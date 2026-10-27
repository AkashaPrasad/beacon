import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import type { Logger } from '../logger.js';

import { withTimeout } from './redis.js';

/** Same names as `apps/worker/src/queues.ts` (QUEUE_NAMES); the worker owns processing. */
export const QUEUE_NAMES = {
  ingest: 'ingest',
  extract: 'extract',
  embed: 'embed',
  match: 'match',
  ghostcheck: 'ghostcheck',
  notify: 'notify',
  cleanup: 'cleanup',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type JobPayloads = {
  ingest: { sourceId: string; reason: 'created' | 'enabled' | 'pack' };
  embed: { kind: 'profile'; userId: string };
  match: { userId: string; reason: 'profile' | 'weights' | 'sources' | 'manual' };
  notify: { userId: string; alertRuleId: string; test: true };
};
export type ProducedQueue = keyof JobPayloads;

export interface EnqueueOptions {
  /** BullMQ deduplication id: a second add within `dedupTtlMs` is dropped. */
  dedupId?: string;
  dedupTtlMs?: number;
}

/** Producer side of the job queues. `add` never throws: failures are logged and return null. */
export interface JobQueue {
  add<Q extends ProducedQueue>(
    queue: Q,
    data: JobPayloads[Q],
    options?: EnqueueOptions,
  ): Promise<string | null>;
  close(): Promise<void>;
}

/** Worker-compatible defaults (apps/worker DEFAULT_JOB_OPTIONS). */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5_000 },
} as const;

export function createBullQueue(redisUrl: string, logger: Logger): JobQueue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, enableOfflineQueue: true });
  connection.on('error', () => {
    /* logged by the main redis client */
  });
  const queues = new Map<ProducedQueue, Queue>();
  const get = (name: ProducedQueue): Queue => {
    let queue = queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
      queue.on('error', (err: Error) => logger.warn({ err: err.message, queue: name }, 'queue error'));
      queues.set(name, queue);
    }
    return queue;
  };

  return {
    async add(queue, data, options = {}) {
      try {
        const job = await withTimeout(
          get(queue).add(queue, data, {
            ...(options.dedupId
              ? { deduplication: { id: options.dedupId, ttl: options.dedupTtlMs ?? 10_000 } }
              : {}),
          }),
          3_000,
          `enqueue ${queue}`,
        );
        logger.debug({ queue, jobId: job.id }, 'job enqueued');
        return job.id ?? null;
      } catch (err) {
        logger.warn({ err: (err as Error).message, queue }, 'failed to enqueue job');
        return null;
      }
    },
    async close() {
      await Promise.allSettled([...queues.values()].map((q) => q.close()));
      connection.disconnect();
    },
  };
}

export interface RecordedJob {
  queue: ProducedQueue;
  data: Record<string, unknown>;
  options: EnqueueOptions;
}

/** In-memory producer for tests and for running without Redis. */
export class RecordingQueue implements JobQueue {
  readonly jobs: RecordedJob[] = [];
  private seq = 0;

  add<Q extends ProducedQueue>(queue: Q, data: JobPayloads[Q], options: EnqueueOptions = {}) {
    this.jobs.push({ queue, data: { ...data }, options });
    this.seq += 1;
    return Promise.resolve(`${queue}-${this.seq}`);
  }

  of(queue: ProducedQueue): Record<string, unknown>[] {
    return this.jobs.filter((j) => j.queue === queue).map((j) => j.data);
  }

  clear(): void {
    this.jobs.length = 0;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
