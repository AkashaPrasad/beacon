import { type ConnectionOptions, DelayedError, type Job, UnrecoverableError, Worker } from 'bullmq';

import type { CrawlerClient } from './crawl/client.js';
import type { StandbyManager } from './crawl/standby.js';
import { isSourceError } from './lib/errors.js';
import { acquireLock, domainLockKey } from './lib/lock.js';
import { SourceModel, type SourceDoc } from './models/index.js';
import { runCleanup } from './pipelines/cleanup.js';
import type { PipelineDeps } from './pipelines/deps.js';
import { embedListing, embedUser } from './pipelines/embed.js';
import { extractListing } from './pipelines/extract.js';
import { ghostcheckListing, ghostRecheck } from './pipelines/ghostcheck.js';
import { fetchHostOf, ingestSource, toFetchSource } from './pipelines/ingest.js';
import { matchListings, matchUser } from './pipelines/match.js';
import { runNotify } from './pipelines/notify.js';
import {
  type DeadLetterJob,
  type EmbedJob,
  type ExtractJob,
  type GhostcheckJob,
  type IngestJob,
  MAINTENANCE_QUEUE,
  type MatchJob,
  type NotifyJob,
  QUEUE_CONCURRENCY,
  QUEUE_LIST,
  QUEUE_NAMES,
  type QueueName,
} from './queues.js';
import type { QueueSet } from './runtime.js';

/** How long one source run may hold its domain lock. */
const DOMAIN_LOCK_MS = 10 * 60_000;

export type MaintenanceJobName = 'standby-idle' | 'sync-schedules' | 'ghost-recheck' | 'crawler-balance';

export interface ProcessorContext {
  deps: PipelineDeps;
  set: QueueSet;
  connection: ConnectionOptions;
  standby: StandbyManager | null;
  crawler: CrawlerClient | null;
  /** Re-registers per-source ingest schedulers (scheduler.ts). */
  syncSchedules: () => Promise<unknown>;
  prefix?: string;
}

export type Processor = (job: Job, token?: string) => Promise<unknown>;

/** Ingest with per-domain concurrency 1: a busy host delays the job by 15–45 s. */
export function ingestProcessor(ctx: ProcessorContext): Processor {
  return async (job, token) => {
    const { sourceId, reason } = job.data as IngestJob;
    const doc = await SourceModel.findById(sourceId).lean<SourceDoc>();
    if (!doc) return { status: 'skipped', reason: 'source not found' };
    const host = fetchHostOf(toFetchSource(doc));
    const release = await acquireLock(ctx.deps.redis, domainLockKey(host), DOMAIN_LOCK_MS);
    if (!release) {
      await job.moveToDelayed(Date.now() + 15_000 + Math.floor(Math.random() * 30_000), token);
      throw new DelayedError();
    }
    try {
      return await ingestSource(ctx.deps, sourceId, reason);
    } catch (err) {
      // Non-retryable source errors were already recorded; only network/rate-limit reach here.
      if (isSourceError(err) && !err.retryable) throw new UnrecoverableError(err.message);
      throw err;
    } finally {
      await release();
    }
  };
}

/** Accepts the API's `{ userId, alertRuleId, test: true }` as well as worker-internal jobs. */
export function normaliseNotifyJob(data: NotifyJob): NotifyJob {
  const ruleId = data.ruleId ?? data.alertRuleId;
  return { ...data, ...(ruleId ? { ruleId } : {}) };
}

export function processorFor(queue: QueueName, ctx: ProcessorContext): Processor {
  const { deps } = ctx;
  switch (queue) {
    case 'ingest':
      return ingestProcessor(ctx);
    case 'extract':
      return (job) => extractListing(deps, (job.data as ExtractJob).listingId);
    case 'embed':
      return (job) => {
        const data = job.data as EmbedJob;
        if ('userId' in data && data.userId) return embedUser(deps, data.userId);
        if ('listingId' in data && data.listingId) return embedListing(deps, data.listingId);
        throw new UnrecoverableError('embed job needs userId or listingId');
      };
    case 'match':
      return (job) => {
        const data = job.data as MatchJob;
        if ('userId' in data && data.userId) return matchUser(deps, data.userId);
        if ('listingIds' in data && Array.isArray(data.listingIds)) return matchListings(deps, data.listingIds, data.afterUserId);
        throw new UnrecoverableError('match job needs userId or listingIds');
      };
    case 'ghostcheck':
      return (job) => ghostcheckListing(deps, (job.data as GhostcheckJob).listingId);
    case 'notify':
      return (job) => runNotify(deps, normaliseNotifyJob(job.data as NotifyJob));
    case 'cleanup':
      return () => runCleanup(deps, ctx.set.dead);
  }
}

export function maintenanceProcessor(ctx: ProcessorContext): Processor {
  return async (job) => {
    switch (job.name as MaintenanceJobName) {
      case 'standby-idle':
        return { action: ctx.standby ? await ctx.standby.stopIfIdle() : 'unavailable' };
      case 'sync-schedules':
        return ctx.syncSchedules();
      case 'ghost-recheck':
        return { queued: await ghostRecheck(ctx.deps) };
      case 'crawler-balance':
        return { remaining: ctx.crawler?.cloudConfigured ? await ctx.crawler.checkCloudBalance(true) : null };
      default:
        return { skipped: job.name };
    }
  };
}

/** Copies a job that exhausted its attempts to the `dead` queue with the reason. */
export async function toDeadLetter(ctx: ProcessorContext, queue: string, job: Job | undefined, err: Error): Promise<void> {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  const final = job.attemptsMade >= attempts || err instanceof UnrecoverableError || err.name === 'UnrecoverableError';
  if (!final) return;
  const entry: DeadLetterJob = {
    queue,
    jobId: job.id ?? null,
    name: job.name,
    data: job.data as unknown,
    reason: err.message.slice(0, 1_000),
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
  };
  await ctx.set.dead.add('dead', entry, { jobId: `dead-${queue}-${job.id ?? Date.now()}` });
  ctx.deps.metrics.inc('beacon_worker_dead_letters_total', { queue }, 1, 'Jobs moved to the dead-letter queue');
}

export function startWorkers(ctx: ProcessorContext, queues: readonly QueueName[] = QUEUE_LIST): Worker[] {
  const { deps } = ctx;
  const common = { connection: ctx.connection, ...(ctx.prefix ? { prefix: ctx.prefix } : {}) };
  const workers = queues.map(
    (queue) =>
      new Worker(queue, processorFor(queue, ctx), {
        ...common,
        concurrency: QUEUE_CONCURRENCY[queue],
        // Apply-link checks hit many hosts: keep the global rate polite.
        ...(queue === QUEUE_NAMES.ghostcheck ? { limiter: { max: 5, duration: 1_000 } } : {}),
        // Embedding/LLM calls can be slow; lock long enough not to be marked stalled.
        lockDuration: queue === QUEUE_NAMES.ingest || queue === QUEUE_NAMES.embed || queue === QUEUE_NAMES.extract ? 120_000 : 30_000,
      }),
  );
  workers.push(new Worker(MAINTENANCE_QUEUE, maintenanceProcessor(ctx), { ...common, concurrency: 1 }));
  for (const worker of workers) {
    const queue = worker.name;
    worker.on('completed', () => deps.metrics.inc('beacon_worker_jobs_processed_total', { queue }, 1, 'Jobs completed per queue'));
    worker.on('failed', (job, err) => {
      deps.metrics.inc('beacon_worker_jobs_failed_total', { queue }, 1, 'Job attempts that failed per queue');
      deps.logger.warn({ queue, jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'job failed');
      toDeadLetter(ctx, queue, job, err).catch((e: unknown) => deps.logger.error({ err: e }, 'dead-letter write failed'));
    });
    worker.on('error', (err) => deps.logger.error({ queue, err: err.message }, 'worker error'));
  }
  return workers;
}
