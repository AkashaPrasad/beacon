import type { DefaultJobOptions } from 'bullmq';

/** Every BullMQ queue the worker owns. Producers (api) use the same names and payloads. */
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

export const QUEUE_LIST: readonly QueueName[] = Object.values(QUEUE_NAMES);

/** Dead-letter queue: jobs that exhausted their retries are copied here with the reason. */
export const DEAD_LETTER_QUEUE = 'dead';

/** Internal maintenance queue (standby idle stop). Not part of the producer contract. */
export const MAINTENANCE_QUEUE = 'maintenance';

// ── Job payloads (the producer contract; see docs/WORKER.md) ─────────────────────────

export type IngestReason = 'schedule' | 'manual' | 'created' | 'retry';
export interface IngestJob {
  sourceId: string;
  reason: IngestReason;
}

export interface ExtractJob {
  listingId: string;
}

export type EmbedJob = { listingId: string } | { userId: string };

export type MatchJob =
  | { userId: string }
  | {
      listingIds: string[];
      /** Continuation cursor when there are more users than MATCH_USERS_PER_JOB. */
      afterUserId?: string;
    };

export interface GhostcheckJob {
  listingId: string;
}

export type NotifyKind = 'instant' | 'digest' | 'deadline' | 'nudge';
export interface NotifyJob {
  kind: NotifyKind;
  userId?: string;
  ruleId?: string;
  /** Listing ids that triggered an instant rule evaluation. */
  listingIds?: string[];
  /** Send a test push/in-app notification to `userId` (Settings > [Send a test notification]). */
  test?: boolean;
}

export type CleanupJob = Record<string, never>;

export interface DeadLetterJob {
  queue: string;
  jobId: string | null;
  name: string;
  data: unknown;
  reason: string;
  attemptsMade: number;
  failedAt: string;
}

export interface JobPayloads {
  ingest: IngestJob;
  extract: ExtractJob;
  embed: EmbedJob;
  match: MatchJob;
  ghostcheck: GhostcheckJob;
  notify: NotifyJob;
  cleanup: CleanupJob;
}

/** Defaults: 3 attempts with exponential backoff; bounded history so Redis stays small. */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: { age: 7 * 24 * 3600, count: 5_000 },
};

/** Per-queue concurrency; ingest is globally capped at 3 (SPEC Phase 4). */
export const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  ingest: 3,
  extract: 2,
  embed: 1,
  match: 2,
  ghostcheck: 4,
  notify: 4,
  cleanup: 1,
};

/**
 * Deterministic job ids make producers idempotent: adding the same id twice while the
 * first is still queued is a no-op in BullMQ. (Ids must not contain ':'.)
 */
export const jobIds = {
  ingest: (sourceId: string) => `ingest-${sourceId}`,
  extract: (listingId: string, contentHash: string) => `extract-${listingId}-${contentHash.slice(0, 12)}`,
  embedListing: (listingId: string, contentHash: string) => `embed-l-${listingId}-${contentHash.slice(0, 12)}`,
  embedUser: (userId: string, hash: string) => `embed-u-${userId}-${hash.slice(0, 12)}`,
  matchUser: (userId: string, hash: string) => `match-u-${userId}-${hash.slice(0, 12)}`,
  ghostcheck: (listingId: string, day: string) => `ghost-${listingId}-${day}`,
};
