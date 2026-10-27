import { Router } from 'express';
import { marked } from 'marked';
import type { Types } from 'mongoose';
import sanitizeHtml from 'sanitize-html';

import { computeFit, normaliseWeights, type FitResult, type GhostReason } from '@kestrel/shared';

import { explainListing } from '../ai/explain.js';
import type { AppContext } from '../context.js';
import { notFound } from '../lib/errors.js';
import { escapeRegex, objectIdParam, parse } from '../lib/validate.js';
import { candidatesForUser } from '../lib/vector.js';
import { currentUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { Interaction, Match, TrackerItem, type InteractionDoc, type MatchDoc } from '../models/activity.js';
import { Listing, type ListingDoc } from '../models/listing.js';
import { Profile, type ProfileDoc } from '../models/profile.js';
import { Source, type SourceDoc } from '../models/source.js';
import { User } from '../models/user.js';
import { feedQueryApiSchema } from '../schemas/index.js';
import { getFeed, getFeedSummary } from '../services/feed.js';
import { pickProfileFields } from '../services/profile.js';
import { toFitResult, toListingPublic } from '../services/serialize.js';
import { getSettings } from '../services/settings.js';
import { canSeeListing, getVisibility, visibleSourceFilter } from '../services/visibility.js';

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote',
    'ul', 'ol', 'li', 'a', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
  ],
  // rel/target must be allowed or the transform below is stripped again; simpleTransform
  // overwrites any rel/target the source sent.
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
  disallowedTagsMode: 'discard',
};

/** Markdown (possibly containing raw HTML) → sanitised HTML. */
export function renderDescription(markdown: string): string {
  const html = marked.parse(markdown ?? '', { async: false, gfm: true, breaks: false });
  return sanitizeHtml(html, SANITIZE);
}

type ApplyHealth = 'ok' | 'dead' | 'redirect_home' | 'error' | 'unknown';

function applyLinkHealth(listing: ListingDoc) {
  const reasons: GhostReason[] = (listing.ghostRisk?.reasons ?? []).filter((r) => r.code.startsWith('apply_link'));
  let status: ApplyHealth = listing.applyCheck?.status ?? 'unknown';
  if (status === 'unknown' && reasons.length) {
    const code = reasons[0]!.code;
    status = code === 'apply_link_dead' ? 'dead' : code === 'apply_link_redirect_home' ? 'redirect_home' : 'error';
  }
  return {
    status,
    httpStatus: listing.applyCheck?.httpStatus ?? null,
    checkedAt: listing.applyCheck?.checkedAt ?? null,
    reasons,
  };
}

async function fitFor(userId: Types.ObjectId, listing: ListingDoc, profile: ProfileDoc | null): Promise<FitResult | null> {
  const match = await Match.findOne({ userId, listingId: listing._id }).lean<MatchDoc>();
  if (match) return toFitResult(match);
  if (!profile) return null;
  const settings = await getSettings(userId);
  return computeFit({
    profile: pickProfileFields(profile),
    listing: { ...listing, location: listing.location ?? [] },
    weights: normaliseWeights(settings.weights),
    semantic: null,
  });
}

async function similarListings(userId: Types.ObjectId, listing: ListingDoc) {
  const { sourceIds } = await getVisibility(userId);
  const ids: Types.ObjectId[] = [];
  if (listing.embedding?.length) {
    const near = await candidatesForUser(listing.embedding, { excludeIds: [listing._id], sourceIds }, 6);
    ids.push(...near.map((c) => objectIdParam(c.listingId)));
  }
  const related = await Listing.find(
    {
      _id: { $ne: listing._id, $nin: ids },
      archived: { $ne: true },
      $and: [
        visibleSourceFilter(sourceIds),
        {
          $or: [
            { company: { $regex: `^${escapeRegex(listing.company)}$`, $options: 'i' } },
            ...(listing.roleFamily ? [{ roleFamily: listing.roleFamily }] : []),
          ],
        },
      ],
    },
    { _id: 1 },
  )
    .sort({ postedAt: -1 })
    .limit(6)
    .lean<{ _id: Types.ObjectId }[]>();
  ids.push(...related.map((r) => r._id));
  const unique = [...new Map(ids.map((id) => [id.toString(), id])).values()].slice(0, 6);
  const [docs, matches] = await Promise.all([
    Listing.find({ _id: { $in: unique } }, { embedding: 0 }).lean<ListingDoc[]>(),
    Match.find({ userId, listingId: { $in: unique } }, { listingId: 1, score: 1 }).lean<MatchDoc[]>(),
  ]);
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  const scores = new Map(matches.map((m) => [m.listingId.toString(), Math.round(m.score)]));
  return unique
    .map((id) => byId.get(id.toString()))
    .filter((d): d is ListingDoc => Boolean(d))
    .map((d) => ({ listing: toListingPublic(d, { descriptionChars: 0 }), score: scores.get(d._id.toString()) ?? null }))
    .map((item) => ({ ...item, listing: { ...item.listing, descriptionMd: '' } }));
}

export function createFeedRouter(ctx: AppContext): Router {
  const router = Router();
  const explainLimiter = createRateLimiter('explain', ctx.rateLimits.explain, ctx.redis, 'user');

  router.get('/feed', async (req, res) => {
    const q = parse(feedQueryApiSchema, req.query, 'query');
    res.json(await getFeed(ctx, currentUser(req)._id, q));
  });

  router.get('/feed/summary', async (req, res) => {
    const user = currentUser(req);
    res.json(await getFeedSummary(ctx, user._id, user.doc.lastSeenFeedAt ?? null));
  });

  router.post('/feed/seen', async (req, res) => {
    await User.updateOne({ _id: currentUser(req)._id }, { $set: { lastSeenFeedAt: ctx.now() } });
    res.status(204).end();
  });

  async function loadListing(userId: Types.ObjectId, rawId: unknown): Promise<ListingDoc> {
    const listingId = objectIdParam(rawId, 'Listing');
    const listing = await Listing.findById(listingId).lean<ListingDoc>();
    if (!listing || !(await canSeeListing(userId, listing))) throw notFound('Listing');
    return listing;
  }

  router.get('/listings/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const listing = await loadListing(_id, req.params['id']);
    const profile = await Profile.findOne({ userId: _id }).lean<ProfileDoc>();
    const [fit, interaction, tracker, source, similar] = await Promise.all([
      fitFor(_id, listing, profile),
      Interaction.findOne({ userId: _id, listingId: listing._id }).lean<InteractionDoc>(),
      TrackerItem.findOne({ userId: _id, listingId: listing._id }, { _id: 1 }).lean(),
      Source.findById(listing.sourceId, { name: 1, kind: 1, scope: 1 }).lean<SourceDoc>(),
      similarListings(_id, listing),
    ]);
    res.json({
      listing: toListingPublic(listing),
      descriptionHtml: renderDescription(listing.descriptionMd),
      fit,
      matchedSkills: fit ? [...fit.details.skills.matchedRequired, ...fit.details.skills.matchedNice] : [],
      missingSkills: fit ? [...fit.details.skills.missingRequired, ...fit.details.skills.missingNice] : [],
      saved: interaction?.saved ?? false,
      hidden: interaction?.hidden ?? false,
      trackerItemId: tracker?._id.toString() ?? null,
      source: source ? { id: source._id.toString(), name: source.name, kind: source.kind, scope: source.scope } : null,
      applyLinkHealth: applyLinkHealth(listing),
      similar,
    });
  });

  const toggles = {
    save: { saved: true },
    unsave: { saved: false },
    hide: { hidden: true },
    unhide: { hidden: false },
  } as const;

  for (const [action, change] of Object.entries(toggles)) {
    router.post(`/listings/:id/${action}`, async (req, res) => {
      const { _id } = currentUser(req);
      const listing = await loadListing(_id, req.params['id']);
      const now = ctx.now();
      const set: Record<string, unknown> = { ...change };
      if ('saved' in change) set['savedAt'] = change.saved ? now : null;
      if ('hidden' in change) set['hiddenAt'] = change.hidden ? now : null;
      const doc = await Interaction.findOneAndUpdate(
        { userId: _id, listingId: listing._id },
        { $set: set, $setOnInsert: { userId: _id, listingId: listing._id } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ).lean<InteractionDoc>();
      res.json({ listingId: listing._id.toString(), saved: doc?.saved ?? false, hidden: doc?.hidden ?? false });
    });
  }

  router.post('/listings/:id/explain', explainLimiter, async (req, res) => {
    const { _id } = currentUser(req);
    const listing = await loadListing(_id, req.params['id']);
    const profile = await Profile.findOne({ userId: _id }).lean<ProfileDoc>();
    const fit = await fitFor(_id, listing, profile);
    res.json(await explainListing(ctx, _id, listing, profile, fit));
  });

  return router;
}
