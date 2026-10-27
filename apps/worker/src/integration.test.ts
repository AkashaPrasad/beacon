import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { acquireLock, domainLockKey } from './lib/lock.js';
import { ListingModel, MatchModel, ProfileModel, SourceModel } from './models/index.js';
import { embedUser } from './pipelines/embed.js';
import { type ProcessorContext, startWorkers } from './processors.js';
import { type DeadLetterJob, QUEUE_NAMES, type QueueName } from './queues.js';
import { bullEnqueuer, createQueueSet, type QueueSet } from './runtime.js';
import { testDeps, type TestDeps } from './test/deps.js';
import { useMongo } from './test/mongo.js';
import { sample } from './test/samples.js';

/**
 * BullMQ against a real Redis (`docker compose -f docker-compose.dev.yml up -d redis`):
 * retry/backoff → dead-letter queue, flow ordering (extract → embed → match) and the
 * per-domain lock. Upstream APIs are served by a local HTTP server (publicapi sources
 * with a `feedUrl`), so no HTTP interception is involved. Queues use a random prefix.
 */
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

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

describe.skipIf(!redisUp)('BullMQ integration (real Redis)', () => {
  useMongo();
  let connection: Redis;
  let set: QueueSet | undefined;
  let workers: Worker[] = [];
  let deps: TestDeps;
  let upstream: Server;
  let base = '';
  const routes = new Map<string, Handler>();
  const hits = new Map<string, number>();
  const prefix = `beacon-test-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    upstream = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      hits.set(path, (hits.get(path) ?? 0) + 1);
      const handler = routes.get(path);
      if (handler) handler(req, res);
      else res.writeHead(404, { 'content-type': 'application/json' }).end('{}');
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await Promise.allSettled(workers.map((w) => w.close(true)));
    workers = [];
    if (set) {
      await Promise.allSettled([...set.queues.values(), set.dead, set.maintenance].map((q) => q.obliterate({ force: true })));
      await set.close();
      set = undefined;
    }
    await connection.del(domainLockKey('127.0.0.1'), domainLockKey('api.lever.co'));
    routes.clear();
    hits.clear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await connection.quit();
  });

  function boot(queues: readonly QueueName[] = [QUEUE_NAMES.ingest, QUEUE_NAMES.extract, QUEUE_NAMES.embed, QUEUE_NAMES.match]): QueueSet {
    const queueSet = createQueueSet(connection, prefix);
    set = queueSet;
    deps = testDeps({ redis: connection, now: () => new Date() });
    deps.enqueue = bullEnqueuer(queueSet) as never;
    const ctx: ProcessorContext = { deps, set: queueSet, connection, standby: null, crawler: null, syncSchedules: () => Promise.resolve(null), prefix };
    workers = startWorkers(ctx, queues);
    return queueSet;
  }

  const remotiveSource = (path: string) =>
    SourceModel.create({ url: 'https://remotive.com/remote-jobs', name: 'Remotive', kind: 'publicapi', scope: 'community', config: { provider: 'remotive', feedUrl: `${base}${path}` } });

  it('retries with exponential backoff, then moves the job to the dead-letter queue with the reason', async () => {
    const queues = boot([QUEUE_NAMES.ingest]);
    routes.set('/flaky', (_req, res) => res.writeHead(503).end());
    const source = await remotiveSource('/flaky');
    const started = Date.now();
    await queues.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'manual' }, { attempts: 3, backoff: { type: 'exponential', delay: 200 } });
    const dead = await waitFor(async () => (await queues.dead.getJobs(['waiting']))[0]);
    const elapsed = Date.now() - started;
    expect(hits.get('/flaky')).toBe(3);
    const entry = dead.data as DeadLetterJob;
    expect(entry).toMatchObject({ queue: 'ingest', attemptsMade: 3, data: { sourceId: String(source._id) } });
    expect(entry.reason).toMatch(/503/);
    // Exponential backoff: 200 ms, then 400 ms between the three attempts.
    expect(elapsed).toBeGreaterThanOrEqual(600);
    const failedJob = (await queues.queues.get(QUEUE_NAMES.ingest)!.getJobs(['failed']))[0]!;
    expect(failedJob.attemptsMade).toBe(3);
    const stored = (await SourceModel.findById(source._id).lean())!;
    expect(stored).toMatchObject({ health: 'failing', healthCode: 'network', consecutiveFailures: 3 });
  });

  it('a non-retryable source error (404) is recorded once and never retried', async () => {
    const queues = boot([QUEUE_NAMES.ingest]);
    const source = await remotiveSource('/missing');
    await queues.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'created' });
    const ingest = queues.queues.get(QUEUE_NAMES.ingest)!;
    await waitFor(async () => (await ingest.getJobs(['completed']))[0]);
    expect(hits.get('/missing')).toBe(1);
    expect((await SourceModel.findById(source._id).lean())!).toMatchObject({ health: 'failing', healthCode: 'notfound' });
    expect(await queues.dead.count()).toBe(0);
  });

  it('runs ingest → extract → embed → match as a flow, in order, and scores users', async () => {
    const queues = boot();
    routes.set('/remotive', (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(sample('remotive'))));
    const userId = new Types.ObjectId();
    await ProfileModel.create({
      userId,
      headline: 'Software engineer',
      skills: [{ name: 'Python', proficiency: 'advanced', years: 2 }],
      education: [{ institution: 'X', degree: 'B.Tech', degreeLevel: 'bachelor', field: 'CS', startYear: 2022, gradYear: 2026, current: true, gpa: null }],
      preferredRoles: ['backend_engineer'],
      preferredLocations: ['Remote'],
      remotePref: 'any',
      embeddingHash: null,
    });
    await embedUser(testDeps(), String(userId));
    const source = await remotiveSource('/remotive');
    await queues.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'manual' });

    const matchQueue = queues.queues.get(QUEUE_NAMES.match)!;
    const parent = await waitFor(async () => (await matchQueue.getJobs(['completed']))[0] as Job | undefined, 30_000);
    const listingIds = (parent.data as { listingIds: string[] }).listingIds;
    expect(listingIds).toHaveLength(2);

    // Ordering: each listing's extract finished before its embed started; every embed
    // finished before the match parent started.
    const embeds = await queues.queues.get(QUEUE_NAMES.embed)!.getJobs(['completed']);
    const extracts = await queues.queues.get(QUEUE_NAMES.extract)!.getJobs(['completed']);
    expect(embeds).toHaveLength(2);
    expect(extracts).toHaveLength(2);
    for (const embed of embeds) {
      const listingId = (embed.data as { listingId: string }).listingId;
      const extract = extracts.find((e) => (e.data as { listingId: string }).listingId === listingId)!;
      expect(extract.finishedOn!).toBeLessThanOrEqual(embed.processedOn!);
      expect(embed.finishedOn!).toBeLessThanOrEqual(parent.processedOn!);
    }
    expect(Object.keys(await parent.getChildrenValues())).toHaveLength(2);

    const listings = await ListingModel.find({ _id: { $in: listingIds.map((id) => new Types.ObjectId(id)) } }).lean();
    expect(listings.every((l) => l.embedding.length === 384 && l.extractedHash === l.contentHash)).toBe(true);
    const matches = await MatchModel.find({ userId }).lean();
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.semanticAvailable && typeof m.score === 'number')).toBe(true);

    // Same payload again: idempotent (no new listings, no new flow).
    await queues.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'schedule' }, { jobId: 'second-run' });
    const ingest = queues.queues.get(QUEUE_NAMES.ingest)!;
    const second = await waitFor(async () => {
      const job = await ingest.getJob('second-run');
      return job?.finishedOn ? job : null;
    });
    expect(second.returnvalue).toMatchObject({ new: 0, unchanged: 2 });
    expect(await ListingModel.countDocuments({ sourceIds: source._id })).toBe(2);
    expect((await ListingModel.findOne({ sourceIds: source._id }).lean())!.seenCount).toBe(2);
  });

  it('per-domain concurrency 1: a held domain lock delays the ingest job without spending an attempt', async () => {
    const queues = boot([QUEUE_NAMES.ingest]);
    const source = await SourceModel.create({ url: 'https://jobs.lever.co/cred', name: 'CRED', kind: 'lever', config: { boardToken: 'cred' } });
    const release = await acquireLock(connection, domainLockKey('api.lever.co'), 60_000);
    expect(release).not.toBeNull();
    await queues.add(QUEUE_NAMES.ingest, { sourceId: String(source._id), reason: 'manual' });
    const ingest = queues.queues.get(QUEUE_NAMES.ingest)!;
    const delayed = await waitFor(async () => (await ingest.getJobs(['delayed']))[0]);
    expect(delayed.attemptsMade).toBe(0);
    await release!();
  });
});
