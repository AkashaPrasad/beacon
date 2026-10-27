import { contentHash, REFRESH_INTERVAL_MS, type RefreshInterval } from '@kestrel/shared';

import type { Logger } from './logger.js';
import { SourceModel } from './models/index.js';
import { DEFAULT_JOB_OPTIONS, type IngestJob, QUEUE_NAMES } from './queues.js';
import type { QueueSet } from './runtime.js';

const IST = 'Asia/Kolkata';
const SOURCE_SCHEDULER_PREFIX = 'ingest-src-';

/** Deterministic per-source jitter: spreads sources over the first quarter of their interval (≤ 30 min). */
export function jitterMs(sourceId: string, intervalMs: number): number {
  const span = Math.min(intervalMs / 4, 30 * 60_000);
  return parseInt(contentHash(sourceId).slice(0, 8), 16) % Math.max(1, Math.floor(span));
}

export interface SyncResult {
  scheduled: number;
  removed: number;
}

/** One repeatable ingest per enabled source (every `refreshInterval`, jittered); stale ones removed. */
export async function syncSourceSchedules(set: QueueSet, logger: Logger, now: () => number = Date.now): Promise<SyncResult> {
  const ingest = set.queues.get(QUEUE_NAMES.ingest);
  if (!ingest) throw new Error('ingest queue missing');
  const sources = await SourceModel.find({ enabled: { $ne: false } }, { _id: 1, refreshInterval: 1 }).lean();
  const wanted = new Map<string, number>();
  for (const s of sources) {
    const interval = REFRESH_INTERVAL_MS[(s.refreshInterval ?? 'daily') as RefreshInterval] ?? REFRESH_INTERVAL_MS.daily;
    wanted.set(String(s._id), interval);
  }
  const existing = await ingest.getJobSchedulers(0, -1);
  const existingById = new Map(existing.map((j) => [j.key, j]));
  let removed = 0;
  for (const j of existing) {
    if (!j.key.startsWith(SOURCE_SCHEDULER_PREFIX)) continue;
    const id = j.key.slice(SOURCE_SCHEDULER_PREFIX.length);
    if (!wanted.has(id)) {
      await ingest.removeJobScheduler(j.key);
      removed++;
    }
  }
  let scheduled = 0;
  for (const [sourceId, every] of wanted) {
    const key = `${SOURCE_SCHEDULER_PREFIX}${sourceId}`;
    const current = existingById.get(key);
    if (current && Number(current.every) === every) continue;
    await ingest.upsertJobScheduler(
      key,
      { every, startDate: new Date(now() + jitterMs(sourceId, every)) },
      { name: QUEUE_NAMES.ingest, data: { sourceId, reason: 'schedule' } satisfies IngestJob, opts: DEFAULT_JOB_OPTIONS },
    );
    scheduled++;
  }
  logger.info({ sources: wanted.size, scheduled, removed }, 'ingest schedules synced');
  return { scheduled, removed };
}

/** Fixed repeatables: standby idle stop, digests, reminders, nudges, ghost re-check, cleanup. */
export async function registerFixedSchedules(set: QueueSet): Promise<void> {
  const m = set.maintenance;
  await m.upsertJobScheduler('standby-idle', { every: 5 * 60_000 }, { name: 'standby-idle', data: {} });
  await m.upsertJobScheduler('sync-schedules', { every: 10 * 60_000 }, { name: 'sync-schedules', data: {} });
  await m.upsertJobScheduler('crawler-balance', { every: 60 * 60_000 }, { name: 'crawler-balance', data: {} });
  await m.upsertJobScheduler('ghost-recheck', { pattern: '0 3 * * 0', tz: IST }, { name: 'ghost-recheck', data: {} });

  const notify = set.queues.get(QUEUE_NAMES.notify);
  const cleanup = set.queues.get(QUEUE_NAMES.cleanup);
  if (!notify || !cleanup) throw new Error('queues missing');
  // Hourly tick: per-rule and settings digests at each user's local time + quiet-hours flush.
  await notify.upsertJobScheduler('notify-digest', { pattern: '0 * * * *' }, { name: 'notify', data: { kind: 'digest' } });
  await notify.upsertJobScheduler('notify-deadline', { pattern: '0 8 * * *', tz: IST }, { name: 'notify', data: { kind: 'deadline' } });
  await notify.upsertJobScheduler('notify-nudge', { pattern: '0 10 * * *', tz: IST }, { name: 'notify', data: { kind: 'nudge' } });
  await cleanup.upsertJobScheduler('cleanup-daily', { pattern: '30 3 * * *', tz: IST }, { name: 'cleanup', data: {} });
}

export async function registerSchedules(set: QueueSet, logger: Logger): Promise<SyncResult> {
  await registerFixedSchedules(set);
  return syncSourceSchedules(set, logger);
}
