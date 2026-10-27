import type { CrawlerClient } from '../crawl/client.js';
import type { Env } from '../env.js';
import type { Embedder } from '../lib/embeddings.js';
import type { ListingLlm } from '../lib/llm.js';
import type { Metrics } from '../lib/metrics.js';
import type { PushSender } from '../lib/push.js';
import type { VectorIndex } from '../lib/vector.js';
import type { Logger } from '../logger.js';
import type { MatchJob, NotifyJob } from '../queues.js';
import type { RedisLike } from '../redis.js';

/** Producer side used by the pipelines (BullMQ in production, a recorder in tests). */
export interface Enqueuer {
  /**
   * New/changed listings: extract → embed per listing, then one `match {listingIds}`
   * parent once every embed finished (a BullMQ flow).
   */
  listingFlow(listings: readonly { id: string; contentHash: string }[], runId: string): Promise<void>;
  ghostcheck(listingIds: readonly string[]): Promise<void>;
  embedUser(userId: string): Promise<void>;
  match(job: MatchJob): Promise<void>;
  notify(job: NotifyJob): Promise<void>;
}

export interface PipelineDeps {
  env: Env;
  logger: Logger;
  now: () => Date;
  redis: RedisLike;
  enqueue: Enqueuer;
  crawler: CrawlerClient | null;
  embedder: Embedder;
  llm: Pick<ListingLlm, 'extractListing' | 'extractIndex'> | null;
  vector: VectorIndex;
  push: PushSender;
  metrics: Metrics;
}

/** Recording enqueuer for tests. */
export class RecordingEnqueuer implements Enqueuer {
  flows: { listings: { id: string; contentHash: string }[]; runId: string }[] = [];
  ghostchecks: string[] = [];
  userEmbeds: string[] = [];
  matches: MatchJob[] = [];
  notifies: NotifyJob[] = [];

  listingFlow(listings: readonly { id: string; contentHash: string }[], runId: string): Promise<void> {
    this.flows.push({ listings: [...listings], runId });
    return Promise.resolve();
  }
  ghostcheck(listingIds: readonly string[]): Promise<void> {
    this.ghostchecks.push(...listingIds);
    return Promise.resolve();
  }
  embedUser(userId: string): Promise<void> {
    this.userEmbeds.push(userId);
    return Promise.resolve();
  }
  match(job: MatchJob): Promise<void> {
    this.matches.push(job);
    return Promise.resolve();
  }
  notify(job: NotifyJob): Promise<void> {
    this.notifies.push(job);
    return Promise.resolve();
  }
  /** Listing ids from every flow so far. */
  get flowListingIds(): string[] {
    return this.flows.flatMap((f) => f.listings.map((l) => l.id));
  }
}
