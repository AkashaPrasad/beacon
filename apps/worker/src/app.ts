import { EC2Client } from '@aws-sdk/client-ec2';
import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { FirecrawlHttpBackend } from './crawl/backend.js';
import { CrawlerClient } from './crawl/client.js';
import { CreditMeter } from './crawl/meter.js';
import { RobotsChecker } from './crawl/robots.js';
import { StandbyManager } from './crawl/standby.js';
import { connectMongo, disconnectMongo, mongoStatus } from './db.js';
import type { Env } from './env.js';
import { createHealthServer } from './health.js';
import { createEmbedder } from './lib/embeddings.js';
import { createServerLlm } from './lib/llm.js';
import { Metrics } from './lib/metrics.js';
import { WebPushSender } from './lib/push.js';
import { createVectorIndex } from './lib/vector.js';
import type { Logger } from './logger.js';
import { ensureWorkerIndexes } from './models/index.js';
import type { PipelineDeps } from './pipelines/deps.js';
import { startWorkers } from './processors.js';
import { DEAD_LETTER_QUEUE, MAINTENANCE_QUEUE, QUEUE_LIST } from './queues.js';
import { createRedisConnection } from './redis.js';
import { bullEnqueuer, createQueueSet, type QueueSet } from './runtime.js';
import { applyGlobalConcurrency, registerSchedules, syncSourceSchedules } from './scheduler.js';

export interface WorkerApp {
  deps: PipelineDeps;
  set: QueueSet;
  crawler: CrawlerClient;
  standby: StandbyManager;
  meter: CreditMeter;
  redis: Redis;
  start(): Promise<void>;
  stop(): Promise<void>;
  metricsText(): Promise<string>;
}

/** Composition root: every dependency the queues need, built from env. */
export function buildWorker(env: Env, logger: Logger): WorkerApp {
  const redis = createRedisConnection(env.REDIS_URL);
  redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
  const set = createQueueSet(redis, env.QUEUE_PREFIX);
  const metrics = new Metrics();
  const meter = new CreditMeter(redis, { dailyCap: env.FIRECRAWL_DAILY_CREDIT_CAP, userDailyCap: env.FIRECRAWL_USER_DAILY_CREDIT_CAP });
  const standby = new StandbyManager({
    // Default credential chain: instance role via IMDSv2 in prod, AWS_PROFILE locally. No static keys.
    ec2: env.FIRECRAWL_INSTANCE_ID ? new EC2Client({ region: env.AWS_REGION }) : null,
    instanceId: env.FIRECRAWL_INSTANCE_ID,
    baseUrl: env.FIRECRAWL_SELF_HOSTED_URL,
    redis,
    idleMinutes: env.FIRECRAWL_STANDBY_IDLE_MINUTES,
    logger: logger.child({ component: 'standby' }),
  });
  const crawler = new CrawlerClient({
    cloud: env.FIRECRAWL_API_KEY ? new FirecrawlHttpBackend('cloud', env.FIRECRAWL_API_URL, env.FIRECRAWL_API_KEY) : null,
    selfhosted: env.FIRECRAWL_SELF_HOSTED_URL ? new FirecrawlHttpBackend('selfhosted', env.FIRECRAWL_SELF_HOSTED_URL) : null,
    standby,
    meter,
    redis,
    robots: new RobotsChecker(redis),
    logger: logger.child({ component: 'crawler' }),
  });
  const deps: PipelineDeps = {
    env,
    logger,
    now: () => new Date(),
    redis,
    enqueue: bullEnqueuer(set),
    crawler,
    embedder: createEmbedder(env, logger.child({ component: 'embed' })),
    llm: createServerLlm(env, logger.child({ component: 'llm' }), redis),
    vector: createVectorIndex(env.VECTOR_SEARCH, env.VECTOR_INDEX_NAME, logger),
    push: new WebPushSender({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }),
    metrics,
  };

  let workers: Worker[] = [];
  const health = createHealthServer({
    redisStatus: () => redis.status,
    mongoStatus,
    queues: QUEUE_LIST,
    metrics: () => metricsText(),
  });

  async function metricsText(): Promise<string> {
    const queues = [...set.queues.values(), set.dead, set.maintenance];
    const counts = await Promise.all(queues.map(async (q) => ({ queue: q.name, counts: await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'waiting-children') })));
    const usage = await meter.usage();
    return metrics.render([
      {
        name: 'beacon_worker_queue_depth',
        help: 'Jobs per queue and state',
        samples: counts.flatMap(({ queue, counts: c }) => Object.entries(c).map(([state, value]) => ({ labels: { queue, state }, value }))),
      },
      {
        name: 'beacon_worker_crawler_backend',
        help: 'Active crawl backend (1 = active)',
        samples: (['cloud', 'selfhosted'] as const).map((b) => ({ labels: { backend: b }, value: usage.backend === b ? 1 : 0 })),
      },
      { name: 'beacon_worker_crawler_cloud_credits_used', help: 'Firecrawl cloud credits used today (UTC)', samples: [{ labels: { day: usage.day }, value: usage.cloudCreditsUsed }] },
      { name: 'beacon_worker_crawler_daily_credit_cap', help: 'FIRECRAWL_DAILY_CREDIT_CAP', samples: [{ labels: {}, value: usage.dailyCap }] },
      { name: 'beacon_worker_crawler_selfhosted_calls', help: 'Self-hosted scrape calls today (UTC)', samples: [{ labels: { day: usage.day }, value: usage.selfhostedCalls }] },
      { name: 'beacon_worker_standby_available', help: 'Self-hosted standby configured', samples: [{ labels: {}, value: standby.available ? 1 : 0 }] },
    ]);
  }

  return {
    deps,
    set,
    crawler,
    standby,
    meter,
    redis,
    metricsText,
    async start() {
      await new Promise<void>((resolve) => health.listen(env.HEALTH_PORT, resolve));
      logger.info({ port: env.HEALTH_PORT }, 'health server listening');
      if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required');
      await connectMongo({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB });
      await ensureWorkerIndexes((message) => logger.warn({ message }, 'index conflict (left as is)'));
      logger.info({ db: env.MONGODB_DB, vector: env.VECTOR_SEARCH, llm: Boolean(deps.llm), embedder: deps.embedder.model, crawler: { cloud: crawler.cloudConfigured, selfhosted: crawler.selfhostedAvailable } }, 'worker dependencies ready');
      if (env.WORKER_PROCESSORS) {
        await applyGlobalConcurrency(set);
        workers = startWorkers({
          deps,
          set,
          connection: redis,
          standby,
          crawler,
          syncSchedules: () => syncSourceSchedules(set, logger),
          ...(env.QUEUE_PREFIX ? { prefix: env.QUEUE_PREFIX } : {}),
        });
        logger.info({ queues: [...QUEUE_LIST, MAINTENANCE_QUEUE], dlq: DEAD_LETTER_QUEUE }, 'processors started');
      }
      if (env.WORKER_SCHEDULER) await registerSchedules(set, logger);
    },
    async stop() {
      // Let in-flight jobs finish (BullMQ close waits for active jobs), then disconnect.
      await Promise.allSettled(workers.map((w) => w.close()));
      await set.close();
      await new Promise<void>((resolve) => health.close(() => resolve()));
      await disconnectMongo().catch(() => undefined);
      await redis.quit().catch(() => undefined);
    },
  };
}
