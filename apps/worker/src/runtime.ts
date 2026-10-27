import { type ConnectionOptions, FlowProducer, type JobsOptions, Queue } from 'bullmq';

import { utcDay } from './lib/dates.js';
import type { Enqueuer } from './pipelines/deps.js';
import {
  DEAD_LETTER_QUEUE,
  DEFAULT_JOB_OPTIONS,
  type JobPayloads,
  jobIds,
  MAINTENANCE_QUEUE,
  type MatchJob,
  type NotifyJob,
  QUEUE_LIST,
  QUEUE_NAMES,
  type QueueName,
} from './queues.js';

export interface QueueSet {
  queues: Map<QueueName, Queue>;
  dead: Queue;
  maintenance: Queue;
  flow: FlowProducer;
  add<Q extends QueueName>(queue: Q, data: JobPayloads[Q], opts?: JobsOptions): Promise<void>;
  close(): Promise<void>;
}

export function createQueueSet(connection: ConnectionOptions, prefix?: string): QueueSet {
  const common = { connection, ...(prefix ? { prefix } : {}) };
  const queues = new Map<QueueName, Queue>(QUEUE_LIST.map((name) => [name, new Queue(name, { ...common, defaultJobOptions: DEFAULT_JOB_OPTIONS })]));
  const dead = new Queue(DEAD_LETTER_QUEUE, { ...common, defaultJobOptions: { removeOnComplete: true } });
  const maintenance = new Queue(MAINTENANCE_QUEUE, { ...common, defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 1 } });
  const flow = new FlowProducer(common);
  return {
    queues,
    dead,
    maintenance,
    flow,
    async add(queue, data, opts) {
      const q = queues.get(queue);
      if (!q) throw new Error(`unknown queue ${queue}`);
      await q.add(queue, data, opts);
    },
    async close() {
      await Promise.allSettled([...queues.values(), dead, maintenance].map((q) => q.close()));
      await flow.close();
    },
  };
}

/**
 * Child jobs never block their parent: a failed extract/embed still lets `match` run.
 * Child ids are unique per run (re-adding an existing child id can strand a parent);
 * idempotency comes from the processors (extractedHash / embeddingHash checks).
 */
const CHILD_OPTS: JobsOptions = { ...DEFAULT_JOB_OPTIONS, ignoreDependencyOnFailure: true };

/** BullMQ-backed producer used by the pipelines. */
export function bullEnqueuer(set: QueueSet, now: () => Date = () => new Date()): Enqueuer {
  return {
    async listingFlow(listings, runId) {
      if (listings.length === 0) return;
      await set.flow.add({
        name: QUEUE_NAMES.match,
        queueName: QUEUE_NAMES.match,
        data: { listingIds: listings.map((l) => l.id) } satisfies MatchJob,
        opts: { ...DEFAULT_JOB_OPTIONS, jobId: `match-run-${runId}` },
        children: listings.map((l) => ({
          name: QUEUE_NAMES.embed,
          queueName: QUEUE_NAMES.embed,
          data: { listingId: l.id },
          opts: { ...CHILD_OPTS, jobId: `${jobIds.embedListing(l.id, l.contentHash || '0')}-${runId}` },
          children: [
            {
              name: QUEUE_NAMES.extract,
              queueName: QUEUE_NAMES.extract,
              data: { listingId: l.id },
              opts: { ...CHILD_OPTS, jobId: `${jobIds.extract(l.id, l.contentHash || '0')}-${runId}` },
            },
          ],
        })),
      });
    },
    async ghostcheck(listingIds) {
      const q = set.queues.get(QUEUE_NAMES.ghostcheck);
      if (!q || listingIds.length === 0) return;
      const day = utcDay(now());
      for (let i = 0; i < listingIds.length; i += 500) {
        await q.addBulk(
          listingIds.slice(i, i + 500).map((listingId) => ({
            name: QUEUE_NAMES.ghostcheck,
            data: { listingId },
            opts: { jobId: jobIds.ghostcheck(listingId, day) },
          })),
        );
      }
    },
    async embedUser(userId) {
      await set.add(QUEUE_NAMES.embed, { userId }, { jobId: `embed-u-${userId}-${now().getTime()}` });
    },
    async match(job: MatchJob) {
      await set.add(QUEUE_NAMES.match, job);
    },
    async notify(job: NotifyJob) {
      await set.add(QUEUE_NAMES.notify, job);
    },
  };
}
