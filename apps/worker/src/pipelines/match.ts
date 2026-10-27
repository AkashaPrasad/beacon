import { type AnyBulkWriteOperation, Types } from 'mongoose';

import {
  computeFit,
  contentHash,
  cosineSimilarity,
  EMBEDDING_DIM,
  type FitResult,
  normaliseWeights,
  OPPORTUNITY_TYPES,
  type OpportunityType,
  type ScoringListing,
  type ScoringProfile,
  type Weights,
} from '@kestrel/shared';

import type { PipelineDeps } from './deps.js';
import { ensureProfileEmbedding } from './embed.js';
import { matchesConditions } from '../lib/alerts.js';
import { profileEmbeddingText } from '../lib/embeddings.js';
import { isVisible, type UserVisibility, VisibilityResolver } from '../lib/visibility.js';
import {
  AlertRuleModel,
  InteractionModel,
  type ListingDoc,
  ListingModel,
  type MatchDoc,
  type MatchFloors,
  MatchModel,
  type ProfileDoc,
  ProfileModel,
  SettingsModel,
  TrackerItemModel,
} from '../models/index.js';

const LISTING_PROJECTION = {
  type: 1,
  title: 1,
  company: 1,
  location: 1,
  remote: 1,
  country: 1,
  stipendMin: 1,
  stipendMax: 1,
  currency: 1,
  period: 1,
  postedAt: 1,
  deadlineAt: 1,
  deadlineKind: 1,
  firstSeenAt: 1,
  eligibility: 1,
  skillsRequired: 1,
  skillsNice: 1,
  ghostRisk: 1,
  roleFamily: 1,
  archived: 1,
  embedding: 1,
  sourceId: 1,
  sourceIds: 1,
} as const;

type ScoredListing = Pick<ListingDoc, keyof typeof LISTING_PROJECTION | '_id'>;

/** Stage-1 quota per opportunity type, so a narrow profile still sees every type in the feed. */
export const PER_TYPE_CANDIDATES = 40;
/**
 * Stage-1 quota for the types the profile asked for. Hackathons, scholarships and fellowships are
 * not resume-shaped, so a resume-led top-K alone fills the feed with jobs; the chosen types must
 * arrive in bulk, not as a token few.
 */
export const CHOSEN_TYPE_CANDIDATES = 120;

function quotaFor(type: OpportunityType, chosen: ReadonlySet<OpportunityType>): number {
  return chosen.has(type) ? CHOSEN_TYPE_CANDIDATES : PER_TYPE_CANDIDATES;
}

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
  return contentHash(
    `${profileEmbeddingText(profile)}\n${JSON.stringify(scoring)}\n${JSON.stringify(weights)}`,
  );
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

function score(
  profile: ProfileDoc,
  weights: Weights,
  listing: ScoredListing,
  now: Date,
  semantic: number | null,
): FitResult {
  return computeFit({
    profile: toScoringProfile(profile),
    listing: toScoringListing(listing),
    weights,
    now,
    semantic,
  });
}

const semanticOf = (
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): number | null =>
  a?.length === EMBEDDING_DIM && b?.length === EMBEDDING_DIM ? cosineSimilarity(a, b) : null;

interface MatchStamp {
  profileHash: string | null;
  matchHash: string;
  now: Date;
}

/** Every `FitResult` field at the top level (API.md §12 `matches`). */
function upsertOp(
  userId: Types.ObjectId,
  listing: ScoredListing,
  fit: FitResult,
  semantic: number | null,
  stamp: MatchStamp,
): AnyBulkWriteOperation<MatchDoc> {
  return {
    updateOne: {
      filter: { userId, listingId: listing._id },
      update: {
        $set: {
          score: fit.score,
          rawScore: fit.rawScore,
          components: fit.components,
          contributions: fit.contributions,
          weights: fit.weights,
          caps: fit.caps,
          ghostPenalty: fit.ghostPenalty,
          hardFails: fit.hardFails,
          semanticAvailable: fit.semanticAvailable,
          details: fit.details,
          explain: fit.explain,
          profileHash: stamp.profileHash,
          matchHash: stamp.matchHash,
          semantic,
          listingType: listing.type,
          listingDeadlineAt: listing.deadlineAt,
          computedAt: stamp.now,
        },
      },
      upsert: true,
    },
  };
}

function visibleFilter(visibility: UserVisibility): Record<string, unknown> {
  const ids = [...visibility.sourceIds].map((id) => new Types.ObjectId(id));
  return { $or: [{ sourceIds: { $in: ids } }, { sourceId: { $in: ids } }] };
}

/** Listings the user saved or tracks: always scored, whatever stage 1 says. */
async function pinnedListingIds(userId: Types.ObjectId): Promise<string[]> {
  const [tracked, saved] = await Promise.all([
    TrackerItemModel.find({ userId, listingId: { $ne: null } }, { listingId: 1 }).lean(),
    InteractionModel.find({ userId, saved: true }, { listingId: 1 }).lean(),
  ]);
  return [
    ...tracked.flatMap((t) => (t.listingId ? [String(t.listingId)] : [])),
    ...saved.map((s) => String(s.listingId)),
  ];
}

export interface MatchUserOutcome {
  userId: string;
  candidates: number;
  written: number;
  removed: number;
  semantic: boolean;
}

/**
 * Full recompute for one user. Stage 1: vector top-K (`MATCH_CANDIDATES_K`, default 200)
 * over the listings the user can see, plus a per-type quota and every saved/tracked
 * listing. Stage 2: shared `computeFit`. Upserts `matches` and removes the user's other
 * matches, so a disabled pack or source leaves the feed. Records the stage-1 floors for
 * incremental matching.
 */
export async function matchUser(
  deps: PipelineDeps,
  userId: string,
  resolver = new VisibilityResolver(),
): Promise<MatchUserOutcome> {
  const uid = new Types.ObjectId(userId);
  const profile = await ProfileModel.findOne({ userId: uid }).lean<ProfileDoc>();
  if (!profile) return { userId, candidates: 0, written: 0, removed: 0, semantic: false };
  const now = deps.now();
  const weights = await weightsFor(uid);
  const stamp: MatchStamp = {
    profileHash: profile.profileHash ?? null,
    matchHash: profileHashOf(profile, weights),
    now,
  };
  let embedding = profile.embedding?.length === EMBEDDING_DIM ? profile.embedding : null;
  if (!embedding) {
    // The embed job may still be queued behind listing embeds; build the vector here so the first
    // match is semantic. If the model is unavailable the rules-only path below still covers every type.
    try {
      embedding = (await ensureProfileEmbedding(deps, profile)).vector;
    } catch (err) {
      deps.logger.warn({ err, userId }, 'profile embedding unavailable; matching on rules only');
    }
  }
  const visibility = await resolver.forUser(uid);
  const k = deps.env.MATCH_CANDIDATES_K;
  const chosen: ReadonlySet<OpportunityType> = new Set(
    profile.opportunityTypes?.length ? profile.opportunityTypes : OPPORTUNITY_TYPES,
  );

  const candidateIds = new Set<string>();
  const floors: MatchFloors = { overall: -1, byType: {} };
  if (embedding && visibility.sourceIds.size > 0) {
    const overall = await deps.vector.search(embedding, k, { sourceIds: visibility.sourceIds });
    for (const hit of overall) candidateIds.add(hit.listingId);
    floors.overall = overall.length >= k ? (overall.at(-1)?.score ?? -1) : -1;
    for (const type of OPPORTUNITY_TYPES) {
      const quota = quotaFor(type, chosen);
      const hits = await deps.vector.search(embedding, quota, {
        sourceIds: visibility.sourceIds,
        type,
      });
      for (const hit of hits) candidateIds.add(hit.listingId);
      floors.byType[type] = hits.length >= quota ? (hits.at(-1)?.score ?? -1) : -1;
    }
  }
  const pinned = new Set(await pinnedListingIds(uid));
  for (const id of pinned) candidateIds.add(id);

  const listings = candidateIds.size
    ? await ListingModel.find(
        { _id: { $in: [...candidateIds].map((id) => new Types.ObjectId(id)) } },
        LISTING_PROJECTION,
      ).lean<ScoredListing[]>()
    : [];
  if (!embedding && visibility.sourceIds.size > 0) {
    // No profile embedding (model unavailable): rules only over the freshest visible listings, with
    // the same per-type quotas, so a burst from one big job board cannot crowd out every other type.
    const fresh = (filter: Record<string, unknown>, limit: number) =>
      ListingModel.find(
        { archived: false, ...visibleFilter(visibility), ...filter },
        LISTING_PROJECTION,
      )
        .sort({ lastSeenAt: -1 })
        .limit(limit)
        .lean<ScoredListing[]>();
    const pools = await Promise.all([
      fresh({}, k),
      ...OPPORTUNITY_TYPES.map((type) => fresh({ type }, quotaFor(type, chosen))),
    ]);
    const seen = new Set(listings.map((l) => String(l._id)));
    for (const pool of pools) {
      for (const l of pool) {
        if (seen.has(String(l._id))) continue;
        seen.add(String(l._id));
        listings.push(l);
      }
    }
  }

  // Saved/tracked listings stay even when archived or no longer visible (the drawer shows them).
  const keep = listings.filter(
    (l) => pinned.has(String(l._id)) || (!l.archived && isVisible(l, visibility)),
  );
  const ops = keep.map((l) => {
    const semantic = semanticOf(embedding ?? undefined, l.embedding);
    return upsertOp(uid, l, score(profile, weights, l, now, semantic), semantic, stamp);
  });
  if (ops.length) await MatchModel.bulkWrite(ops, { ordered: false });
  const removed = (
    await MatchModel.deleteMany({ userId: uid, listingId: { $nin: keep.map((l) => l._id) } })
  ).deletedCount;
  await ProfileModel.updateOne(
    { _id: profile._id },
    { $set: { matchHash: stamp.matchHash, matchFloors: embedding ? floors : null } },
  );
  deps.metrics.inc(
    'beacon_worker_matches_written_total',
    { mode: 'user' },
    ops.length,
    'Match documents written',
  );
  return {
    userId,
    candidates: listings.length,
    written: ops.length,
    removed,
    semantic: Boolean(embedding),
  };
}

export interface MatchListingsOutcome {
  users: number;
  written: number;
  alerts: number;
  continued: boolean;
}

/** Would this listing have made the user's stage-1 candidate set at the last full recompute? */
export function passesFloor(
  floors: MatchFloors | null | undefined,
  type: OpportunityType,
  semantic: number | null,
): boolean {
  if (!floors || semantic === null) return true;
  // A type that was not searched (outside the profile's opportunity types) uses the overall floor;
  // −1 means that pool had fewer candidates than its quota, so everything was admitted.
  const typeFloor = floors.byType[type] ?? floors.overall;
  return semantic >= Math.min(floors.overall, typeFloor);
}

/**
 * Incremental: score new/changed listings for every user with a profile embedding who
 * can see them (chunked by MATCH_USERS_PER_JOB, continuation job for the rest). A match
 * doc is written when the listing clears the user's stage-1 floor, already had one, or
 * fires an instant alert rule; then `notify {kind: instant}` per rule that fired.
 */
export async function matchListings(
  deps: PipelineDeps,
  listingIds: readonly string[],
  afterUserId?: string,
): Promise<MatchListingsOutcome> {
  const now = deps.now();
  const ids = [...new Set(listingIds)].map((id) => new Types.ObjectId(id));
  const listings = await ListingModel.find(
    { _id: { $in: ids }, archived: false },
    LISTING_PROJECTION,
  ).lean<ScoredListing[]>();
  if (listings.length === 0) return { users: 0, written: 0, alerts: 0, continued: false };

  if (!afterUserId) {
    // Profiles still without a vector never enter the incremental loop below. Queue each a full
    // recompute (which builds the vector itself), so a user whose embed job was lost or is still
    // queued behind listing embeds gets a real feed on the next ingest instead of never.
    const pending = await ProfileModel.find({ 'embedding.0': { $exists: false } }, { userId: 1 })
      .limit(100)
      .lean<Pick<ProfileDoc, 'userId'>[]>();
    for (const p of pending)
      await deps.enqueue.match({ userId: String(p.userId), reason: 'embedding' });
  }

  const limit = deps.env.MATCH_USERS_PER_JOB;
  const filter: Record<string, unknown> = { 'embedding.0': { $exists: true } };
  if (afterUserId) filter.userId = { $gt: new Types.ObjectId(afterUserId) };
  const profiles = await ProfileModel.find(filter)
    .sort({ userId: 1 })
    .limit(limit + 1)
    .lean<ProfileDoc[]>();
  const continued = profiles.length > limit;
  const batch = profiles.slice(0, limit);
  const visibility = await new VisibilityResolver().forUsers(batch.map((p) => p.userId));

  let written = 0;
  let alerts = 0;
  for (const profile of batch) {
    const vis = visibility.get(String(profile.userId));
    const visible = vis ? listings.filter((l) => isVisible(l, vis)) : [];
    if (visible.length === 0) continue;
    const weights = await weightsFor(profile.userId);
    const stamp: MatchStamp = {
      profileHash: profile.profileHash ?? null,
      matchHash: profileHashOf(profile, weights),
      now,
    };
    const scored = visible.map((l) => {
      const semantic = semanticOf(profile.embedding, l.embedding);
      return { listing: l, semantic, fit: score(profile, weights, l, now, semantic) };
    });

    const rules = await AlertRuleModel.find({
      userId: profile.userId,
      enabled: true,
      cadence: 'instant',
    }).lean();
    const fired = new Map<string, string[]>();
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
      if (hits.length)
        fired.set(
          String(rule._id),
          hits.sort((a, b) => b.fit.score - a.fit.score).map((h) => String(h.listing._id)),
        );
    }
    const alerted = new Set([...fired.values()].flat());
    const existing = new Set(
      (
        await MatchModel.find(
          { userId: profile.userId, listingId: { $in: visible.map((l) => l._id) } },
          { listingId: 1 },
        ).lean()
      ).map((m) => String(m.listingId)),
    );
    const keep = scored.filter((s) => {
      const id = String(s.listing._id);
      return (
        existing.has(id) ||
        alerted.has(id) ||
        passesFloor(profile.matchFloors, s.listing.type, s.semantic)
      );
    });
    if (keep.length)
      await MatchModel.bulkWrite(
        keep.map((s) => upsertOp(profile.userId, s.listing, s.fit, s.semantic, stamp)),
        { ordered: false },
      );
    written += keep.length;

    for (const [ruleId, hitIds] of fired) {
      alerts++;
      await deps.enqueue.notify({
        kind: 'instant',
        userId: String(profile.userId),
        ruleId,
        listingIds: hitIds,
      });
    }
  }
  if (continued) {
    const last = batch.at(-1);
    if (last)
      await deps.enqueue.match({ listingIds: [...listingIds], afterUserId: String(last.userId) });
  }
  deps.metrics.inc('beacon_worker_matches_written_total', { mode: 'listings' }, written);
  return { users: batch.length, written, alerts, continued };
}
