import {
  canonicalKey,
  contentHash,
  DAY_MS,
  dedupeListings,
  ghostRisk,
  listingRichness,
  normaliseCompany,
  normaliseTitle,
  tryNormaliseUrl,
} from '@kestrel/shared';
import { type AnyBulkWriteOperation, Types } from 'mongoose';

import { CRAWL_KINDS, fetcherFor } from '../fetchers/index.js';
import { PUBLIC_API_HOSTS } from '../fetchers/detect.js';
import type { FetchResult, FetchSource, NormalisedListing } from '../fetchers/types.js';
import { errorMessage, isSourceError, type SourceErrorKind } from '../lib/errors.js';
import { type ListingDoc, ListingModel, type SourceDoc, type SourceHealthCode, SourceModel, SourceRunModel } from '../models/index.js';
import type { IngestReason } from '../queues.js';

import type { PipelineDeps } from './deps.js';

/** A role that reappears after this long unseen counts as a re-post (ghost signal). */
const REPOST_GAP_MS = 7 * DAY_MS;
const FLOW_CHUNK = 100;

export interface IngestSummary {
  sourceId: string;
  status: 'ok' | 'not_modified' | 'error' | 'deferred' | 'skipped';
  found: number;
  new: number;
  updated: number;
  unchanged: number;
  newIds: string[];
  changedIds: string[];
  error?: { kind: SourceErrorKind | 'unknown'; message: string };
}

/** The listing fields a fetch can change (extract-owned fields are reset on change). */
type Prepared = NormalisedListing & { canonicalKey: string; contentHash: string; applyUrlKey: string | null; identical: number };

export function listingContentHash(l: Pick<NormalisedListing, 'title' | 'company' | 'location' | 'descriptionMd' | 'deadlineAt'>): string {
  return contentHash([l.title, l.company, l.location.join(' | '), l.deadlineAt?.toISOString() ?? '', l.descriptionMd].join('\n'));
}

export function toFetchSource(doc: SourceDoc): FetchSource {
  return {
    id: String(doc._id),
    url: doc.url,
    name: doc.name,
    kind: doc.kind,
    typeTag: doc.typeTag ?? null,
    ownerId: doc.ownerId ? String(doc.ownerId) : null,
    config: { ...(doc.config ?? {}), boardToken: doc.config?.boardToken ?? null, feedUrl: doc.config?.feedUrl ?? null, provider: doc.config?.provider ?? null },
    companyDomain: (doc.companyDomain as string | null | undefined) ?? (doc.config?.companyDomain as string | null | undefined) ?? null,
    country: (doc.country as string | null | undefined) ?? (doc.config?.country as string | null | undefined) ?? null,
    etag: doc.etag ?? null,
    lastModified: doc.lastModified ?? null,
  };
}

/** Host whose politeness lock this source's fetch takes (`ratelimit:domain:<host>`). */
export function fetchHostOf(source: Pick<FetchSource, 'kind' | 'url' | 'config'>): string {
  const byKind: Partial<Record<string, string>> = {
    greenhouse: 'boards-api.greenhouse.io',
    lever: 'api.lever.co',
    ashby: 'api.ashbyhq.com',
    smartrecruiters: 'api.smartrecruiters.com',
    workable: 'www.workable.com',
  };
  const fixed = byKind[source.kind];
  if (fixed) return fixed;
  const feed = typeof source.config.feedUrl === 'string' ? source.config.feedUrl : null;
  if (source.kind === 'publicapi' && !feed) {
    const host = new URL(source.url).hostname;
    const api = PUBLIC_API_HOSTS[host];
    if (api) return new URL(api.feedUrl).hostname;
  }
  try {
    return new URL(feed ?? source.url).hostname;
  } catch {
    return 'unknown';
  }
}

function healthFor(kind: SourceErrorKind, consecutiveFailures: number): { health: SourceDoc['health']; code: SourceHealthCode } {
  switch (kind) {
    case 'credits':
      return { health: 'degraded', code: 'paused:credits' };
    case 'auth':
    case 'notfound':
    case 'blocked':
      return { health: 'failing', code: kind };
    case 'parse':
      return { health: consecutiveFailures >= 2 ? 'failing' : 'degraded', code: 'parse' };
    case 'ratelimited':
    case 'network':
      return { health: consecutiveFailures >= 2 ? 'failing' : 'degraded', code: kind };
  }
}

function prepare(listings: readonly NormalisedListing[]): Prepared[] {
  const titleCounts = new Map<string, number>();
  const titleKey = (l: NormalisedListing) => `${normaliseCompany(l.company)}|${normaliseTitle(l.title)}`;
  for (const l of listings) titleCounts.set(titleKey(l), (titleCounts.get(titleKey(l)) ?? 0) + 1);
  return listings.map((l) => ({
    ...l,
    canonicalKey: canonicalKey(l),
    contentHash: listingContentHash(l),
    applyUrlKey: tryNormaliseUrl(l.applyUrl),
    identical: titleCounts.get(titleKey(l)) ?? 1,
  }));
}

function fetchedFields(p: Prepared, sourceKind: string) {
  return {
    type: p.type,
    title: p.title,
    company: p.company,
    companyDomain: p.companyDomain,
    location: p.location,
    remote: p.remote,
    country: p.country,
    stipendMin: p.stipendMin,
    stipendMax: p.stipendMax,
    currency: p.currency,
    period: p.period,
    postedAt: p.postedAt,
    deadlineAt: p.deadlineAt,
    deadlineKind: p.deadlineKind,
    eligibility: p.eligibility,
    skillsRequired: p.skillsRequired,
    skillsNice: p.skillsNice,
    descriptionMd: p.descriptionMd,
    applyUrl: p.applyUrl,
    roleFamily: p.roleFamily,
    contentHash: p.contentHash,
    applyUrlKey: p.applyUrlKey,
    externalId: p.externalId,
    externalVersion: p.version ?? null,
    structured: p.structured,
    sourceKind,
  };
}

type ExistingRow = Pick<
  ListingDoc,
  '_id' | 'canonicalKey' | 'applyUrlKey' | 'contentHash' | 'lastSeenAt' | 'sourceId' | 'externalId' | 'descriptionMd' | 'skillsRequired' | 'deadlineAt' | 'stipendMin' | 'eligibility' | 'postedAt' | 'location' | 'remote' | 'country' | 'companyDomain' | 'stipendMax' | 'skillsNice'
>;

/**
 * One source run: fetch → normalise → canonicalKey + contentHash → upsert (new → seenCount 1;
 * same hash → bump lastSeenAt/seenCount; changed → update + re-extract/embed) → dedupe →
 * sourceRuns + source health → enqueue extract/embed/match flow and ghostchecks.
 * Listings not seen in this run are left untouched (cleanup archives them after 60 d).
 */
export async function ingestSource(deps: PipelineDeps, sourceId: string, reason: IngestReason = 'schedule'): Promise<IngestSummary> {
  const now = deps.now();
  const summary: IngestSummary = { sourceId, status: 'ok', found: 0, new: 0, updated: 0, unchanged: 0, newIds: [], changedIds: [] };
  const doc = await SourceModel.findById(sourceId).lean<SourceDoc>();
  if (!doc || doc.enabled === false) return { ...summary, status: 'skipped' };
  const source = toFetchSource(doc);
  const sourceObjectId = doc._id;
  const runId = new Types.ObjectId();
  await SourceRunModel.collection.insertOne({
    _id: runId,
    sourceId: sourceObjectId,
    reason,
    status: 'running',
    startedAt: now,
    finishedAt: null,
    durationMs: null,
    found: 0,
    new: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    backend: null,
    creditsUsed: 0,
  });

  // What this source already has: externalId → (version, description) for detail diffs.
  const knownRows = await ListingModel.find(
    { sourceIds: sourceObjectId, archived: false },
    { externalId: 1, externalVersion: 1, descriptionMd: 1 },
  ).lean();
  const known = new Map(knownRows.filter((r) => r.externalId).map((r) => [r.externalId as string, { version: r.externalVersion ?? null, descriptionMd: r.descriptionMd ?? '' }]));

  let result: FetchResult;
  try {
    result = await fetcherFor(source.kind)(source, {
      now,
      logger: deps.logger.child({ sourceId, kind: source.kind }),
      crawler: deps.crawler ?? undefined,
      known,
      maxItems: deps.env.INGEST_MAX_LISTINGS,
      maxDetailCalls: CRAWL_KINDS.has(source.kind) ? deps.env.FIRECRAWL_MAX_DETAIL_PAGES : 50,
      detailDelayMs: deps.env.NODE_ENV === 'test' ? 0 : 250,
      extractIndex: deps.llm ? (md, url) => deps.llm!.extractIndex(md, url) : undefined,
      keys: { adzunaAppId: deps.env.ADZUNA_APP_ID, adzunaAppKey: deps.env.ADZUNA_APP_KEY },
    });
  } catch (err) {
    const kind: SourceErrorKind | 'unknown' = isSourceError(err) ? err.kind : 'unknown';
    const message = errorMessage(err).slice(0, 400);
    const failures = (doc.consecutiveFailures ?? 0) + (kind === 'credits' ? 0 : 1);
    const { health, code } = healthFor(kind === 'unknown' ? 'network' : kind, failures);
    const deferred = kind === 'credits';
    await SourceModel.updateOne(
      { _id: sourceObjectId },
      {
        $set: {
          health,
          healthCode: code,
          errorReason: `${code}: ${message}`.slice(0, 500),
          lastCheckedAt: now,
          consecutiveFailures: failures,
        },
      },
    );
    await SourceRunModel.collection.updateOne(
      { _id: runId },
      { $set: { status: deferred ? 'deferred' : 'error', finishedAt: deps.now(), durationMs: deps.now().getTime() - now.getTime(), errors: [{ kind, message }] } },
    );
    deps.metrics.inc('beacon_worker_source_errors_total', { kind }, 1, 'Source fetch failures by kind');
    // Network/rate-limit errors are retried by BullMQ (attempts: 3, exponential backoff).
    if (isSourceError(err) && err.retryable) throw err;
    if (!isSourceError(err)) throw err;
    return { ...summary, status: deferred ? 'deferred' : 'error', error: { kind, message } };
  }

  const finish = async (status: IngestSummary['status'], listingsFound: number) => {
    await SourceModel.updateOne(
      { _id: sourceObjectId },
      {
        $set: {
          health: 'healthy',
          healthCode: status === 'not_modified' ? 'not_modified' : 'ok',
          errorReason: null,
          lastCheckedAt: now,
          lastSuccessAt: now,
          listingsFound,
          consecutiveFailures: 0,
          etag: result.etag ?? (status === 'not_modified' ? doc.etag : null),
          lastModified: result.lastModified ?? (status === 'not_modified' ? doc.lastModified : null),
        },
      },
    );
    await SourceRunModel.collection.updateOne(
      { _id: runId },
      {
        $set: {
          status,
          finishedAt: deps.now(),
          durationMs: deps.now().getTime() - now.getTime(),
          found: summary.found,
          new: summary.new,
          updated: summary.updated,
          unchanged: summary.unchanged,
          errors: result.warnings.slice(0, 50).map((message) => ({ kind: 'warning', message: message.slice(0, 300) })),
          backend: result.backend ?? null,
          creditsUsed: result.creditsUsed ?? 0,
        },
      },
    );
  };

  if (result.notModified) {
    // 304: everything this source had is still live.
    const res = await ListingModel.updateMany({ sourceIds: sourceObjectId, archived: false }, { $set: { lastSeenAt: now }, $inc: { seenCount: 1 } });
    summary.status = 'not_modified';
    summary.unchanged = res.modifiedCount;
    summary.found = knownRows.length;
    await finish('not_modified', knownRows.length);
    return summary;
  }

  const prepared = prepare(result.listings);
  // Within-run duplicates (same canonicalKey or apply URL): keep the richest record.
  const deduped = dedupeListings(prepared.map((p) => ({ ...p, seenCount: 1 })));
  summary.found = deduped.length;

  const existing = deduped.length
    ? await ListingModel.find(
        {
          $or: [
            { canonicalKey: { $in: deduped.map((d) => d.canonicalKey) } },
            { applyUrlKey: { $in: deduped.map((d) => d.applyUrlKey).filter((u): u is string => Boolean(u)) } },
          ],
        },
        {
          canonicalKey: 1, applyUrlKey: 1, contentHash: 1, lastSeenAt: 1, sourceId: 1, externalId: 1, descriptionMd: 1, skillsRequired: 1, skillsNice: 1,
          deadlineAt: 1, stipendMin: 1, stipendMax: 1, eligibility: 1, postedAt: 1, location: 1, remote: 1, country: 1, companyDomain: 1,
        },
      ).lean<ExistingRow[]>()
    : [];
  const byKey = new Map(existing.map((e) => [e.canonicalKey, e]));
  const byUrl = new Map(existing.filter((e) => e.applyUrlKey).map((e) => [e.applyUrlKey as string, e]));

  const ops: AnyBulkWriteOperation<ListingDoc>[] = [];
  const claimed = new Set<string>();
  for (const p of deduped) {
    const match = byKey.get(p.canonicalKey) ?? (p.applyUrlKey ? byUrl.get(p.applyUrlKey) : undefined);
    if (!match || claimed.has(String(match._id))) {
      const _id = new Types.ObjectId();
      const risk = ghostRisk({ postedAt: p.postedAt, firstSeenAt: now, lastSeenAt: now, title: p.title, descriptionMd: p.descriptionMd }, { now, identicalOpenRoles: p.identical });
      ops.push({
        insertOne: {
          document: {
            _id,
            ...fetchedFields(p, source.kind),
            canonicalKey: p.canonicalKey,
            sourceId: sourceObjectId,
            sourceIds: [sourceObjectId],
            firstSeenAt: now,
            lastSeenAt: now,
            seenCount: 1,
            ghostRisk: risk,
            embedding: [],
            archived: false,
            extractedHash: null,
            extractMethod: 'none',
            embeddingHash: null,
            embeddingModel: null,
            repostCount: 0,
            identicalOpenRoles: p.identical,
            applyUrlCheck: null,
            lastGhostCheckAt: null,
          } as unknown as ListingDoc,
        },
      });
      summary.newIds.push(_id.toHexString());
      summary.new++;
      continue;
    }
    claimed.add(String(match._id));
    const gap = now.getTime() - new Date(match.lastSeenAt).getTime();
    const sameSource = String(match.sourceId) === sourceId;
    const reposted = gap > REPOST_GAP_MS || (sameSource && match.externalId !== null && match.externalId !== p.externalId);
    const bump = {
      $set: { lastSeenAt: now, archived: false, identicalOpenRoles: p.identical, externalVersion: p.version ?? null },
      $inc: { seenCount: 1, ...(reposted ? { repostCount: 1 } : {}) },
      $addToSet: { sourceIds: sourceObjectId },
    };
    if (match.contentHash === p.contentHash) {
      ops.push({ updateOne: { filter: { _id: match._id }, update: bump } });
      summary.unchanged++;
      continue;
    }
    // Changed content. Another source's richer record wins; ours only bumps it.
    if (!sameSource && listingRichness(match as never) > listingRichness(p as never)) {
      ops.push({ updateOne: { filter: { _id: match._id }, update: bump } });
      summary.unchanged++;
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: match._id },
        update: {
          ...bump,
          $set: { ...bump.$set, ...fetchedFields(p, source.kind), sourceId: sourceObjectId, extractedHash: null, embeddingHash: null },
        },
      },
    });
    summary.changedIds.push(String(match._id));
    summary.updated++;
  }

  if (ops.length) {
    try {
      await ListingModel.bulkWrite(ops, { ordered: false });
    } catch (err) {
      // A concurrent run of another source inserted the same canonicalKey: those inserts
      // are dropped here and picked up as "seen" on the next run.
      const writeErrors = (err as { writeErrors?: { index: number; code?: number }[] }).writeErrors ?? [];
      if (!writeErrors.length || writeErrors.some((e) => e.code !== 11000)) throw err;
      const failed = new Set(writeErrors.map((e) => e.index));
      const lost = ops.flatMap((op, i) => (failed.has(i) && 'insertOne' in op ? [String((op.insertOne.document as { _id: unknown })._id)] : []));
      summary.newIds = summary.newIds.filter((id) => !lost.includes(id));
      summary.new -= lost.length;
      deps.logger.warn({ sourceId, lost: lost.length }, 'duplicate canonicalKey inserts skipped');
    }
  }

  await finish('ok', deduped.length);
  deps.metrics.inc('beacon_worker_listings_ingested_total', { result: 'new' }, summary.new, 'Listings written by ingest');
  deps.metrics.inc('beacon_worker_listings_ingested_total', { result: 'updated' }, summary.updated);

  const hashById = new Map<string, string>();
  ops.forEach((op) => {
    if ('insertOne' in op) {
      const d = op.insertOne.document as unknown as { _id: Types.ObjectId; contentHash: string };
      hashById.set(d._id.toHexString(), d.contentHash);
    } else if ('updateOne' in op) {
      const set = (op.updateOne.update as { $set?: { contentHash?: string } }).$set;
      if (set?.contentHash) hashById.set(String((op.updateOne.filter as { _id: unknown })._id), set.contentHash);
    }
  });
  const flowItems = [...summary.newIds, ...summary.changedIds].map((id) => ({ id, contentHash: hashById.get(id) ?? '' }));
  for (let i = 0; i < flowItems.length; i += FLOW_CHUNK) {
    await deps.enqueue.listingFlow(flowItems.slice(i, i + FLOW_CHUNK), `${runId.toHexString()}-${i / FLOW_CHUNK}`);
  }
  if (summary.newIds.length) await deps.enqueue.ghostcheck(summary.newIds);
  return summary;
}
