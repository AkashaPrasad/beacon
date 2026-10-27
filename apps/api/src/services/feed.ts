/**
 * GET /v1/feed. Primary path: the worker's `matches` joined to `listings` (Mongo aggregation),
 * filters + keyset pagination. Cold start (no match docs yet): visible listings by posted date,
 * or by vector similarity when the profile already has an embedding (`warmingUp: true`).
 */
import type { PipelineStage, Types } from 'mongoose';

import {
  APPROX_FX_PER_USD,
  convertCurrency,
  DAY_MS,
  decodeCursor,
  EMBEDDING_DIM,
  encodeCursor,
  OPPORTUNITY_TYPES,
  toMonthlyAmount,
  type FitResult,
  type ListingPublic,
  type OpportunityType,
  type PayPeriod,
} from '@kestrel/shared';

import type { AppContext } from '../context.js';
import { FEED_DESCRIPTION_CHARS, toFitResult, toListingPublic } from './serialize.js';
import { getVisibility, visibleSourceFilter } from './visibility.js';
import { sha256Hex, stableStringify } from '../lib/crypto.js';
import { badCursor } from '../lib/errors.js';
import { withTimeout } from '../lib/redis.js';
import { escapeRegex, toObjectId } from '../lib/validate.js';
import { candidatesForUser } from '../lib/vector.js';
import { Interaction, Match, type MatchDoc } from '../models/activity.js';
import { Listing, type ListingDoc } from '../models/listing.js';
import { Profile } from '../models/profile.js';
import type { FeedQueryApi } from '../schemas/index.js';


export interface FeedItemDTO {
  listing: ListingPublic;
  fit: FitResult | null;
  score: number | null;
  saved: boolean;
  hidden: boolean;
  trackerItemId: string | null;
}

export interface FeedResponse {
  items: FeedItemDTO[];
  nextCursor: string | null;
  warmingUp: boolean;
  total?: number;
}

const FAR_FUTURE = new Date('9999-12-31T00:00:00.000Z');
const PERIODS: PayPeriod[] = ['hour', 'day', 'week', 'month', 'year'];

type Filter = Record<string, unknown>;

/** Listing-level filters (`prefix` = 'listing.' inside the matches join). */
export function listingFilter(q: FeedQueryApi, now: Date, prefix = ''): Filter {
  const f = (field: string) => `${prefix}${field}`;
  const and: Filter[] = [{ [f('archived')]: { $ne: true } }];

  if (q.types?.length) and.push({ [f('type')]: { $in: q.types } });
  if (q.remote?.length) and.push({ [f('remote')]: { $in: q.remote } });
  if (q.locations?.length) {
    and.push({ $or: q.locations.map((l) => ({ [f('location')]: { $regex: escapeRegex(l), $options: 'i' } })) });
  }
  if (q.deadlineWithinDays) {
    and.push({ [f('deadlineAt')]: { $gte: now, $lte: new Date(now.getTime() + q.deadlineWithinDays * DAY_MS) } });
  } else if (!q.includeExpired) {
    and.push({ $or: [{ [f('deadlineAt')]: null }, { [f('deadlineAt')]: { $gte: now } }] });
  }
  if (q.postedWithinDays) {
    const cutoff = new Date(now.getTime() - q.postedWithinDays * DAY_MS);
    and.push({
      $or: [{ [f('postedAt')]: { $gte: cutoff } }, { [f('postedAt')]: null, [f('firstSeenAt')]: { $gte: cutoff } }],
    });
  }
  if (q.minStipend !== undefined && q.minStipend > 0) {
    and.push({ $or: stipendClauses(q.minStipend, q.stipendCurrency ?? 'INR', f) });
  }
  if (q.gradYear) {
    and.push({
      $or: [
        { [f('eligibility.gradYears')]: { $exists: false } },
        { [f('eligibility.gradYears')]: { $size: 0 } },
        { [f('eligibility.gradYears')]: q.gradYear },
      ],
    });
  }
  const companies = [...(q.company ? [q.company] : []), ...(q.companies ?? [])];
  if (companies.length) {
    and.push({ [f('company')]: { $in: companies.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i')) } });
  }
  const sourceIds = [...(q.sourceId ? [q.sourceId] : []), ...(q.sourceIds ?? [])];
  if (sourceIds.length) and.push(visibleSourceFilter(sourceIds.map(toObjectId), prefix));
  if (q.q) {
    for (const word of q.q.split(/\s+/).filter(Boolean).slice(0, 8)) {
      const rx = { $regex: escapeRegex(word), $options: 'i' };
      and.push({
        $or: [{ [f('title')]: rx }, { [f('company')]: rx }, { [f('skillsRequired')]: rx }, { [f('location')]: rx }],
      });
    }
  }
  return { $and: and };
}

/** Monthly floor in `base` currency → per-(currency, period) thresholds on stipendMax/stipendMin. */
function stipendClauses(minMonthly: number, base: string, f: (s: string) => string): Filter[] {
  const clauses: Filter[] = [];
  for (const currency of Object.keys(APPROX_FX_PER_USD)) {
    const inCurrency = convertCurrency(minMonthly, base, currency);
    if (inCurrency === null) continue;
    for (const period of PERIODS) {
      const perMonth = toMonthlyAmount(1, period);
      if (!perMonth) continue;
      const threshold = inCurrency / perMonth;
      const periodMatch = period === 'month' ? { $in: ['month', null] } : period;
      clauses.push({
        [f('currency')]: currency,
        [f('period')]: periodMatch,
        $or: [
          { [f('stipendMax')]: { $gte: threshold } },
          { [f('stipendMax')]: null, [f('stipendMin')]: { $gte: threshold } },
        ],
      });
    }
  }
  return clauses.length ? clauses : [{ _id: null }];
}

function interactionStages(userId: Types.ObjectId, listingIdField: string, hideHidden: boolean, savedOnly: boolean): PipelineStage[] {
  const stages: PipelineStage[] = [
    {
      $lookup: {
        from: 'interactions',
        localField: listingIdField,
        foreignField: 'listingId',
        pipeline: [{ $match: { userId } }, { $project: { saved: 1, hidden: 1 } }],
        as: '_ix',
      },
    },
    {
      $addFields: {
        _saved: { $ifNull: [{ $first: '$_ix.saved' }, false] },
        _hidden: { $ifNull: [{ $first: '$_ix.hidden' }, false] },
      },
    },
  ];
  const match: Filter = {};
  if (hideHidden) match['_hidden'] = false;
  if (savedOnly) match['_saved'] = true;
  if (Object.keys(match).length) stages.push({ $match: match });
  return stages;
}

function trackerStage(userId: Types.ObjectId, listingIdField: string): PipelineStage {
  return {
    $lookup: {
      from: 'tracker_items',
      localField: listingIdField,
      foreignField: 'listingId',
      pipeline: [{ $match: { userId } }, { $project: { _id: 1 } }, { $limit: 1 }],
      as: '_tr',
    },
  };
}

type SortKind = 'fit' | 'deadline' | 'posted';

function sortStages(
  kind: SortKind,
  scoreField: string | null,
  listingPrefix: string,
  listingIdField: string,
  cursor: Record<string, unknown> | null,
): PipelineStage[] {
  const p = (field: string) => `$${listingPrefix}${field}`;
  const sk =
    kind === 'fit'
      ? `$${scoreField ?? 'score'}`
      : kind === 'deadline'
        ? { $ifNull: [p('deadlineAt'), FAR_FUTURE] }
        : { $ifNull: [p('postedAt'), p('firstSeenAt')] };
  const desc = kind !== 'deadline';
  const stages: PipelineStage[] = [{ $addFields: { _sk: sk, _lid: `$${listingIdField}` } }];
  if (cursor) {
    const raw = cursor['s'];
    const id = cursor['id'];
    if (typeof raw !== 'number' || typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw badCursor();
    const value = kind === 'fit' ? raw : new Date(raw);
    const lid = toObjectId(id);
    stages.push({
      $match: {
        $or: [{ _sk: { [desc ? '$lt' : '$gt']: value } }, { _sk: value, _lid: { [desc ? '$lt' : '$gt']: lid } }],
      },
    });
  }
  stages.push({ $sort: { _sk: desc ? -1 : 1, _lid: desc ? -1 : 1 } });
  return stages;
}

/** Keyset condition for `sort=fit` on the raw match fields (score desc, listingId desc). */
function fitKeyset(cursor: Record<string, unknown> | null): PipelineStage[] {
  if (!cursor) return [];
  const score = cursor['s'];
  const id = cursor['id'];
  if (typeof score !== 'number' || typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw badCursor();
  const lid = toObjectId(id);
  return [{ $match: { $or: [{ score: { $lt: score } }, { score, listingId: { $lt: lid } }] } }];
}

function cursorFor(kind: SortKind, row: { _sk: unknown; _lid: Types.ObjectId }): string {
  const s = row._sk instanceof Date ? row._sk.getTime() : Number(row._sk);
  return encodeCursor({ k: kind, s, id: row._lid.toString() });
}

interface Row {
  _sk: unknown;
  _lid: Types.ObjectId;
  _saved: boolean;
  _hidden: boolean;
  _tr: { _id: Types.ObjectId }[];
}

function toItem(listing: ListingDoc, match: MatchDoc | null, row: Row): FeedItemDTO {
  const fit = match ? toFitResult(match) : null;
  return {
    listing: toListingPublic(listing, { descriptionChars: FEED_DESCRIPTION_CHARS }),
    fit,
    score: fit?.score ?? null,
    saved: Boolean(row._saved),
    hidden: Boolean(row._hidden),
    trackerItemId: row._tr[0]?._id.toString() ?? null,
  };
}

/** Feed aggregations give up after this long, so abandoned requests cannot keep mongod busy. */
export const FEED_MAX_TIME_MS = 5_000;
const TOTAL_CACHE_TTL_SECONDS = 60;

/** Listing fields the feed never needs from the join (the 384-d embedding is ~4.6 kB per doc). */
const LISTING_JOIN_PROJECTION = { embedding: 0, contentHash: 0, structured: 0 } as const;

function aggregate<T>(model: typeof Match | typeof Listing, pipeline: PipelineStage[]) {
  return (model as typeof Listing).aggregate<T>(pipeline).option({ maxTimeMS: FEED_MAX_TIME_MS });
}

/**
 * `total` is display-only, so it is cached per user + filter set for 60 s (Redis); a cache
 * failure just recomputes it.
 */
async function cachedTotal(
  ctx: AppContext,
  userId: Types.ObjectId,
  q: FeedQueryApi,
  path: string,
  compute: () => Promise<number>,
): Promise<number> {
  const { cursor: _cursor, limit: _limit, ...filters } = q;
  const key = `feed:total:${userId.toString()}:${sha256Hex(`${path}:${stableStringify(filters)}`).slice(0, 24)}`;
  try {
    const hit = await withTimeout(ctx.redis.get(key), 500, 'feed total cache');
    if (hit !== null && Number.isFinite(Number(hit))) return Number(hit);
  } catch {
    /* recompute */
  }
  const total = await compute();
  void withTimeout(ctx.redis.set(key, String(total), 'EX', TOTAL_CACHE_TTL_SECONDS), 500, 'feed total cache').catch(() => undefined);
  return total;
}

async function countPipeline(model: typeof Match | typeof Listing, pre: PipelineStage[]): Promise<number> {
  const result = await aggregate<{ n: number }>(model, [...pre, { $count: 'n' }]);
  return result[0]?.n ?? 0;
}

export async function getFeed(ctx: AppContext, userId: Types.ObjectId, q: FeedQueryApi): Promise<FeedResponse> {
  const now = ctx.now();
  const hideHidden = q.hideHidden ?? !q.includeHidden;
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cursor) throw badCursor();
  const limit = q.limit;

  if (await Match.exists({ userId })) {
    const kind: SortKind = q.sort;
    if (cursor && cursor['k'] !== kind) throw badCursor();
    const matchStage: PipelineStage = { $match: { userId, ...(q.minFit !== undefined ? { score: { $gte: q.minFit } } : {}) } };
    const join: PipelineStage[] = [
      {
        $lookup: {
          from: 'listings',
          localField: 'listingId',
          foreignField: '_id',
          pipeline: [{ $project: LISTING_JOIN_PROJECTION }],
          as: 'listing',
        },
      },
      { $unwind: '$listing' },
      { $match: listingFilter(q, now, 'listing.') },
      ...interactionStages(userId, 'listingId', hideHidden, q.savedOnly),
    ];
    const pre: PipelineStage[] = [matchStage, ...join];
    // sort=fit orders by fields on `matches` itself, so sort (index {userId, score, listingId})
    // and apply the cursor first, then join only until `limit + 1` rows pass the listing filters,
    // instead of joining every match of the user before sorting.
    const ordered: PipelineStage[] =
      kind === 'fit'
        ? [matchStage, ...fitKeyset(cursor), { $sort: { score: -1, listingId: -1 } }, ...join, { $addFields: { _sk: '$score', _lid: '$listingId' } }]
        : [...pre, ...sortStages(kind, 'score', 'listing.', 'listingId', cursor)];
    const [rows, total] = await Promise.all([
      aggregate<Row & MatchDoc & { listing: ListingDoc }>(Match, [
        ...ordered,
        { $limit: limit + 1 },
        trackerStage(userId, 'listingId'),
      ]),
      q.cursor ? Promise.resolve(undefined) : cachedTotal(ctx, userId, q, 'match', () => countPipeline(Match, pre)),
    ]);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => toItem(row.listing, row, row)),
      nextCursor: rows.length > limit && last ? cursorFor(kind, last) : null,
      warmingUp: false,
      ...(total === undefined ? {} : { total }),
    };
  }

  // ── Cold start ──
  const visibility = await getVisibility(userId);
  const baseMatch: Filter = { $and: [listingFilter(q, now), visibleSourceFilter(visibility.sourceIds)] };
  const profile = await Profile.findOne({ userId }, { embedding: 1 }).lean<{ embedding?: number[] }>();
  const embedding = profile?.embedding ?? [];
  const useVector = embedding.length === EMBEDDING_DIM && q.sort !== 'deadline';

  if (useVector) {
    if (cursor && cursor['k'] !== 'vec') throw badCursor();
    const offset = cursor ? Number(cursor['o']) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw badCursor();
    const candidates = await candidatesForUser(
      embedding,
      {
        sourceIds: visibility.sourceIds,
        ...(q.types?.length ? { types: q.types } : {}),
        ...(q.includeExpired ? {} : { deadlineAfter: now }),
      },
      200,
    );
    const rank = new Map(candidates.map((c, i) => [c.listingId, i]));
    const rows = await aggregate<Row & ListingDoc>(Listing, [
      { $match: { $and: [baseMatch, { _id: { $in: candidates.map((c) => toObjectId(c.listingId)) } }] } },
      { $project: LISTING_JOIN_PROJECTION },
      ...interactionStages(userId, '_id', hideHidden, q.savedOnly),
      { $addFields: { _lid: '$_id', _sk: null } },
      trackerStage(userId, '_id'),
    ]);
    rows.sort((a, b) => (rank.get(a._id.toString()) ?? 0) - (rank.get(b._id.toString()) ?? 0));
    const page = rows.slice(offset, offset + limit);
    return {
      items: page.map((row) => toItem(row, null, row)),
      nextCursor: offset + limit < rows.length ? encodeCursor({ k: 'vec', o: offset + limit }) : null,
      warmingUp: true,
      ...(q.cursor ? {} : { total: rows.length }),
    };
  }

  const kind: SortKind = q.sort === 'deadline' ? 'deadline' : 'posted';
  if (cursor && cursor['k'] !== kind) throw badCursor();
  const pre: PipelineStage[] = [
    { $match: baseMatch },
    { $project: LISTING_JOIN_PROJECTION },
    ...interactionStages(userId, '_id', hideHidden, q.savedOnly),
  ];
  const [rows, total] = await Promise.all([
    aggregate<Row & ListingDoc>(Listing, [
      ...pre,
      ...sortStages(kind, null, '', '_id', cursor),
      { $limit: limit + 1 },
      trackerStage(userId, '_id'),
    ]),
    q.cursor ? Promise.resolve(undefined) : cachedTotal(ctx, userId, q, 'cold', () => countPipeline(Listing, pre)),
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toItem(row, null, row)),
    nextCursor: rows.length > limit && last ? cursorFor(kind, last) : null,
    warmingUp: true,
    ...(total === undefined ? {} : { total }),
  };
}

export interface FeedSummary {
  total: number;
  byType: Record<OpportunityType, number>;
  deadlinesThisWeek: number;
  newSinceLastVisit: number;
  lastSeenFeedAt: Date | null;
  saved: number;
  warmingUp: boolean;
}

export async function getFeedSummary(
  ctx: AppContext,
  userId: Types.ObjectId,
  lastSeenFeedAt: Date | null,
): Promise<FeedSummary> {
  const now = ctx.now();
  const weekEnd = new Date(now.getTime() + 7 * DAY_MS);
  const visibleFilter = { $and: [{ archived: { $ne: true } }, { $or: [{ deadlineAt: null }, { deadlineAt: { $gte: now } }] }] };
  const facet = (prefix: string): PipelineStage => ({
    $facet: {
      byType: [{ $group: { _id: `$${prefix}type`, n: { $sum: 1 } } }],
      week: [{ $match: { [`${prefix}deadlineAt`]: { $gte: now, $lte: weekEnd } } }, { $count: 'n' }],
      fresh: [
        ...(lastSeenFeedAt ? [{ $match: { [`${prefix}firstSeenAt`]: { $gt: lastSeenFeedAt } } }] : []),
        { $count: 'n' },
      ],
    },
  });
  const warmingUp = !(await Match.exists({ userId }));
  let rows: { byType: { _id: string; n: number }[]; week: { n: number }[]; fresh: { n: number }[] }[];
  if (!warmingUp) {
    rows = await Match.aggregate([
      { $match: { userId } },
      { $lookup: { from: 'listings', localField: 'listingId', foreignField: '_id', as: 'listing' } },
      { $unwind: '$listing' },
      { $match: { 'listing.archived': { $ne: true } } },
      { $match: { $or: [{ 'listing.deadlineAt': null }, { 'listing.deadlineAt': { $gte: now } }] } },
      ...interactionStages(userId, 'listingId', true, false),
      facet('listing.'),
    ]);
  } else {
    const visibility = await getVisibility(userId);
    rows = await Listing.aggregate([
      { $match: { $and: [visibleFilter, visibleSourceFilter(visibility.sourceIds)] } },
      ...interactionStages(userId, '_id', true, false),
      facet(''),
    ]);
  }
  const row = rows[0] ?? { byType: [], week: [], fresh: [] };
  const byType = Object.fromEntries(OPPORTUNITY_TYPES.map((t) => [t, 0])) as Record<OpportunityType, number>;
  let total = 0;
  for (const { _id, n } of row.byType) {
    if ((OPPORTUNITY_TYPES as readonly string[]).includes(_id)) byType[_id as OpportunityType] = n;
    total += n;
  }
  return {
    total,
    byType,
    deadlinesThisWeek: row.week[0]?.n ?? 0,
    newSinceLastVisit: row.fresh[0]?.n ?? 0,
    lastSeenFeedAt,
    saved: await Interaction.countDocuments({ userId, saved: true }),
    warmingUp,
  };
}
