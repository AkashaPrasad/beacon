import {
  computeFit,
  contentHash,
  cosineSimilarity,
  EMBEDDING_DIM,
  type FitResult,
  normaliseWeights,
  type ScoringListing,
  type ScoringProfile,
  type Weights,
} from '@kestrel/shared';
import { type AnyBulkWriteOperation, Types } from 'mongoose';

import { matchesConditions } from '../lib/alerts.js';
import { profileEmbeddingText } from '../lib/embeddings.js';
import {
  AlertRuleModel,
  type ListingDoc,
  ListingModel,
  type MatchDoc,
  MatchModel,
  type ProfileDoc,
  ProfileModel,
  SettingsModel,
  TrackerItemModel,
} from '../models/index.js';

import type { PipelineDeps } from './deps.js';

const LISTING_PROJECTION = {
  type: 1, title: 1, company: 1, location: 1, remote: 1, country: 1, stipendMin: 1, stipendMax: 1, currency: 1, period: 1,
  postedAt: 1, deadlineAt: 1, deadlineKind: 1, firstSeenAt: 1, eligibility: 1, skillsRequired: 1, skillsNice: 1,
  ghostRisk: 1, roleFamily: 1, archived: 1, embedding: 1,
} as const;

type ScoredListing = Pick<ListingDoc, keyof typeof LISTING_PROJECTION | '_id'>;

/** Hash of everything the stored fit depends on (profile text + scoring fields + weights). */
export function profileHashOf(profile: ProfileDoc, weights: Weights): string {
  const scoring = {
    skills: profile.skills?.map((s) => s.name) ?? [],
    education: profile.education?.map((e) => [e.gradYear, e.degree, e.degreeLevel]) ?? [],
    experienceYears: profile.experienceYears ?? 0,
    preferredRoles: profile.preferredRoles ?? [],
    preferredLocations: profile.preferredLocations ?? [],
    remotePref: profile.remotePref ?? 'any',
    openToRelocate: profile.openToRelocate ?? false,
    stipendFloor: profile.stipendFloor ?? null,
    citizenship: profile.workAuth?.citizenship ?? [],
  };
  return contentHash(`${profileEmbeddingText(profile)}\n${JSON.stringify(scoring)}\n${JSON.stringify(weights)}`);
}

function toScoringProfile(p: ProfileDoc): ScoringProfile {
  return {
    skills: p.skills ?? [],
    education: p.education ?? [],
    experienceYears: p.experienceYears ?? 0,
    preferredRoles: p.preferredRoles ?? [],
    preferredLocations: p.preferredLocations ?? [],
    remotePref: p.remotePref ?? 'any',
    openToRelocate: p.openToRelocate ?? false,
    stipendFloor: p.stipendFloor ?? null,
    workAuth: { citizenship: p.workAuth?.citizenship ?? [] },
  };
}

function toScoringListing(l: ScoredListing): ScoringListing {
  return {
    type: l.type,
    title: l.title,
    company: l.company,
    location: l.location,
    remote: l.remote,
    country: l.country,
    stipendMin: l.stipendMin,
    stipendMax: l.stipendMax,
    currency: l.currency,
    period: l.period,
    postedAt: l.postedAt,
    deadlineAt: l.deadlineAt,
    deadlineKind: l.deadlineKind,
    firstSeenAt: l.firstSeenAt,
    eligibility: l.eligibility,
    skillsRequired: l.skillsRequired,
    skillsNice: l.skillsNice,
    ghostRisk: l.ghostRisk,
    roleFamily: l.roleFamily,
  };
}

async function weightsFor(userId: Types.ObjectId): Promise<Weights> {
  const settings = await SettingsModel.findOne({ userId }, { weights: 1 }).lean();
  return normaliseWeights(settings?.weights ?? null);
}

function score(profile: ProfileDoc, weights: Weights, listing: ScoredListing, now: Date, semantic: number | null): FitResult {
  return computeFit({ profile: toScoringProfile(profile), listing: toScoringListing(listing), weights, now, semantic });
}

const semanticOf = (a: readonly number[] | undefined, b: readonly number[] | undefined): number | null =>
  a?.length === EMBEDDING_DIM && b?.length === EMBEDDING_DIM ? cosineSimilarity(a, b) : null;

function upsertOp(userId: Types.ObjectId, listing: ScoredListing, fit: FitResult, semantic: number | null, profileHash: string, now: Date): AnyBulkWriteOperation<MatchDoc> {
  return {
    updateOne: {
      filter: { userId, listingId: listing._id },
      update: {
        $set: {
          score: fit.score,
          fit,
          semantic,
          profileHash,
          listingType: listing.type,
          listingDeadlineAt: listing.deadlineAt,
          computedAt: now,
        },
      },
      upsert: true,
    },
  };
}

export interface MatchUserOutcome {
  userId: string;
  candidates: number;
  written: number;
  semantic: boolean;
}

/**
 * Full recompute for one user: stage 1 vector candidates (k=200) + every listing the user
 * tracks, stage 2 `computeFit`, upsert `matches` stamped with `profileHash`, drop matches
 * from older profile versions.
 */
export async function matchUser(deps: PipelineDeps, userId: string): Promise<MatchUserOutcome> {
  const uid = new Types.ObjectId(userId);
  const profile = await ProfileModel.findOne({ userId: uid }).lean<ProfileDoc>();
  if (!profile) return { userId, candidates: 0, written: 0, semantic: false };
  const now = deps.now();
  const weights = await weightsFor(uid);
  const profileHash = profileHashOf(profile, weights);
  const embedding = profile.embedding?.length === EMBEDDING_DIM ? profile.embedding : null;

  const candidateIds = new Set<string>();
  if (embedding) {
    for (const hit of await deps.vector.search(embedding, deps.env.MATCH_CANDIDATES_K)) candidateIds.add(hit.listingId);
  }
  const tracked = await TrackerItemModel.find({ userId: uid, listingId: { $ne: null } }, { listingId: 1 }).lean();
  for (const t of tracked) if (t.listingId) candidateIds.add(String(t.listingId));

  let listings: ScoredListing[];
  if (embedding || candidateIds.size > 0) {
    listings = await ListingModel.find({ _id: { $in: [...candidateIds].map((id) => new Types.ObjectId(id)) } }, LISTING_PROJECTION).lean<ScoredListing[]>();
  } else {
    listings = [];
  }
  if (!embedding) {
    // No profile embedding yet (embed pending): rules-only over the freshest listings.
    const recent = await ListingModel.find({ archived: false }, LISTING_PROJECTION).sort({ lastSeenAt: -1 }).limit(deps.env.MATCH_CANDIDATES_K).lean<ScoredListing[]>();
    const seen = new Set(listings.map((l) => String(l._id)));
    listings.push(...recent.filter((l) => !seen.has(String(l._id))));
  }

  const ops = listings
    .filter((l) => !l.archived || candidateIds.has(String(l._id)))
    .map((l) => {
      const semantic = semanticOf(embedding ?? undefined, l.embedding);
      return upsertOp(uid, l, score(profile, weights, l, now, semantic), semantic, profileHash, now);
    });
  if (ops.length) await MatchModel.bulkWrite(ops, { ordered: false });
  await MatchModel.deleteMany({ userId: uid, profileHash: { $ne: profileHash } });
  await ProfileModel.updateOne({ _id: profile._id }, { $set: { matchHash: profileHash } });
  deps.metrics.inc('beacon_worker_matches_written_total', { mode: 'user' }, ops.length, 'Match documents written');
  return { userId, candidates: listings.length, written: ops.length, semantic: Boolean(embedding) };
}

export interface MatchListingsOutcome {
  users: number;
  written: number;
  alerts: number;
  continued: boolean;
}

/**
 * Incremental: score new/changed listings for every user with a profile embedding
 * (chunked by MATCH_USERS_PER_JOB, continuation job for the rest), then evaluate each
 * user's instant alert rules and enqueue `notify`.
 */
export async function matchListings(deps: PipelineDeps, listingIds: readonly string[], afterUserId?: string): Promise<MatchListingsOutcome> {
  const now = deps.now();
  const ids = [...new Set(listingIds)].map((id) => new Types.ObjectId(id));
  const listings = await ListingModel.find({ _id: { $in: ids }, archived: false }, LISTING_PROJECTION).lean<ScoredListing[]>();
  if (listings.length === 0) return { users: 0, written: 0, alerts: 0, continued: false };

  const limit = deps.env.MATCH_USERS_PER_JOB;
  const filter: Record<string, unknown> = { 'embedding.0': { $exists: true } };
  if (afterUserId) filter.userId = { $gt: new Types.ObjectId(afterUserId) };
  const profiles = await ProfileModel.find(filter).sort({ userId: 1 }).limit(limit + 1).lean<ProfileDoc[]>();
  const continued = profiles.length > limit;
  const batch = profiles.slice(0, limit);

  let written = 0;
  let alerts = 0;
  for (const profile of batch) {
    const weights = await weightsFor(profile.userId);
    const profileHash = profileHashOf(profile, weights);
    const scored = listings.map((l) => {
      const semantic = semanticOf(profile.embedding, l.embedding);
      return { listing: l, semantic, fit: score(profile, weights, l, now, semantic) };
    });
    await MatchModel.bulkWrite(scored.map((s) => upsertOp(profile.userId, s.listing, s.fit, s.semantic, profileHash, now)), { ordered: false });
    written += scored.length;

    const rules = await AlertRuleModel.find({ userId: profile.userId, enabled: true, cadence: 'instant' }).lean();
    for (const rule of rules) {
      const hits = scored.filter((s) =>
        matchesConditions(
          rule.conditions,
          {
            type: s.listing.type,
            title: s.listing.title,
            company: s.listing.company,
            location: s.listing.location,
            remote: s.listing.remote,
            country: s.listing.country,
            deadlineAt: s.listing.deadlineAt,
            skillsRequired: s.listing.skillsRequired,
            skillsNice: s.listing.skillsNice,
          },
          s.fit.score,
          now,
        ),
      );
      if (hits.length === 0) continue;
      alerts++;
      await deps.enqueue.notify({
        kind: 'instant',
        userId: String(profile.userId),
        ruleId: String(rule._id),
        listingIds: hits.sort((a, b) => b.fit.score - a.fit.score).map((h) => String(h.listing._id)),
      });
    }
  }
  if (continued) {
    const last = batch[batch.length - 1];
    if (last) await deps.enqueue.match({ listingIds: [...listingIds], afterUserId: String(last.userId) });
  }
  deps.metrics.inc('beacon_worker_matches_written_total', { mode: 'listings' }, written);
  return { users: batch.length, written, alerts, continued };
}
