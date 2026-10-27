import { randomUUID } from 'node:crypto';

import type { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { acquireLock, domainLockKey } from './lib/lock.js';
import { MatchModel, ProfileModel, SourceModel } from './models/index.js';
import { embedUser } from './pipelines/embed.js';
import { type ProcessorContext, startWorkers } from './processors.js';
import { type DeadLetterJob, QUEUE_NAMES, type QueueName } from './queues.js';
import { bullEnqueuer, createQueueSet, type QueueSet } from './runtime.js';
import { testDeps, type TestDeps } from './test/deps.js';
import { useMongo } from './test/mongo.js';
import { sample } from './test/samples.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function redisAvailable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1_000, retryStrategy: () => null });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const redisUp = await redisAvailable();
if (!redisUp) {
  console.warn(`[integration] Redis not reachable at ${REDIS_URL}; BullMQ integration tests skipped. Start it: docker compose -f docker-compose.dev.yml up -d redis`);
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe.skipIf(!redisUp)('BullMQ integration (real Redis)', () => {
  useMongo();
  let connection: Redis;
  let set: QueueSet;
  let workers: Worker[] = [];
  let deps: TestDeps;
  const prefix = `beacon-test-${randomUUID().slice(0, 8)}`;

  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);
    nock.emitter.on('no match', (req: { href?: string; host?: string; path?: string }) => process.stderr.write(`NOMATCH ${req.href ?? `${req.host}${req.path}`}\n`));
    connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  });

  afterEach(async () => {
    await Promise.allSettled(workers.map((w) => w.close(true)));
    workers = [];
    if (set) {
      await Promise.allSettled([...set.queues.values(), set.dead, set.maintenance].map((q) => q.obliterate({ force: true })));
      await set.close();
    }
    nock.cleanAll();
  });

  afterAll(async () => {
    nock.enableNetConnect();
    await connection.quit();
  });

  function boot(queues: readonly QueueName[] = [QUEUE_NAMES.ingest, QUEUE_NAMES.extract, QUEUE_NAMES.embed, QUEUE_NAMES.match]) {
    set = createQueueSet(connection, prefix);
    deps = testDeps({ redis: connection, now: () => new Date() });
    deps.enqueue = bullEnqueuer(set) as never;
    const ctx: ProcessorContext = { deps, set, connection, standby: null, crawler: null, syncSchedules: () => Promise.resolve(null), prefix };
    workers = startWorkers(ctx, queues);
    return ctx;
  }

  it('retries with exponential backoff, then moves the job to the dead-letter queue with the reason', async () => {
    boot([QUEUE_NAMES.ingest]);
    const source = await SourceModel.create({ url: 'https://job-boards.greenhouse.io/flaky', name: 'Flaky', kind: 'greenhouse', config: { boardToken: 'flaky' } });
    const scope = nock('https://boards-api.greenhouse.io').get('/v1/boards/flaky/jobs').query(true).times(3).reply(503);
    const started = Date.now();
    await set.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'manual' }, { attempts: 3, backoff: { type: 'exponential', delay: 200 } });
    const dead = await waitFor(async () => (await set.dead.getJobs(['waiting']))[0]);
    const elapsed = Date.now() - started;
    expect(scope.isDone()).toBe(true);
    const entry = dead.data as DeadLetterJob;
    expect(entry).toMatchObject({ queue: 'ingest', attemptsMade: 3, data: { sourceId: String(source._id) } });
    expect(entry.reason).toMatch(/503/);
    // Backoff 200 ms then 400 ms between the three attempts.
    expect(elapsed).toBeGreaterThanOrEqual(600);
    expect((await SourceModel.findById(source._id).lean())!.health).toBe('failing');
  });

  it('runs the ingest → extract → embed → match flow in order and scores users', async () => {
    boot();
    const userId = new Types.ObjectId();
    await ProfileModel.create({
      userId,
      headline: 'AI engineer',
      skills: [{ name: 'Python', proficiency: 'advanced', years: 2 }],
      education: [{ institution: 'X', degree: 'B.Tech', degreeLevel: 'bachelor', field: 'CS', startYear: 2022, gradYear: 2026, current: true, gpa: null }],
      preferredRoles: ['ml_engineer'],
      preferredLocations: ['Bengaluru'],
      remotePref: 'any',
      embeddingHash: null,
    });
    await embedUser(testDeps(), String(userId));
    const source = await SourceModel.create({ url: 'https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited', name: 'Razorpay', kind: 'greenhouse', config: { boardToken: 'razorpaysoftwareprivatelimited' } });
    nock('https://boards-api.greenhouse.io').get('/v1/boards/razorpaysoftwareprivatelimited/jobs').query(true).reply(200, sample('ats-greenhouse'));
    await set.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'manual' });

    const matchQueue = set.queues.get(QUEUE_NAMES.match)!;
    const parent = await waitFor(async () => (await matchQueue.getJobs(['completed']))[0] as Job | undefined, 30_000);
    expect((parent.data as { listingIds: string[] }).listingIds).toHaveLength(2);
    const children = await parent.getChildrenValues();
    expect(Object.keys(children)).toHaveLength(2);
    const matches = await MatchModel.find({ userId }).lean();
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.fit.semanticAvailable)).toBe(true);
  });

  it('per-domain concurrency 1: a held domain lock delays the ingest job', async () => {
    boot([QUEUE_NAMES.ingest]);
    const source = await SourceModel.create({ url: 'https://jobs.lever.co/cred', name: 'CRED', kind: 'lever', config: { boardToken: 'cred' } });
    const release = await acquireLock(connection, domainLockKey('api.lever.co'), 60_000);
    expect(release).not.toBeNull();
    await set.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'manual' });
    const ingest = set.queues.get(QUEUE_NAMES.ingest)!;
    const delayed = await waitFor(async () => (await ingest.getJobs(['delayed']))[0]);
    expect(delayed.attemptsMade).toBe(0);
    await release!();
  });
});
