import { DescribeInstancesCommand, StartInstancesCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SourceError } from '../lib/errors.js';
import { MemoryRedis } from '../test/memory-redis.js';

import { FirecrawlHttpBackend } from './backend.js';
import { CrawlerClient } from './client.js';
import { CRAWLER_KEYS } from './keys.js';
import { CreditMeter } from './meter.js';
import { RobotsChecker } from './robots.js';
import { type Ec2Like, StandbyManager } from './standby.js';

const CLOUD = 'https://api.firecrawl.dev';
const STANDBY = 'http://10.0.0.5:3002';
const NOW = new Date('2026-10-27T06:30:00Z');

beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

/** EC2 double: a state machine stopped → pending → running, recording every command. */
class FakeEc2 implements Ec2Like {
  calls: string[] = [];
  constructor(
    public state: string,
    private readonly pendingPolls = 2,
  ) {}
  private polls = 0;
  send(command: unknown): Promise<unknown> {
    if (command instanceof DescribeInstancesCommand) {
      this.calls.push('describe');
      if (this.state === 'pending' && ++this.polls >= this.pendingPolls) this.state = 'running';
      return Promise.resolve({ Reservations: [{ Instances: [{ State: { Name: this.state } }] }] });
    }
    if (command instanceof StartInstancesCommand) {
      this.calls.push('start');
      this.state = 'pending';
      return Promise.resolve({});
    }
    if (command instanceof StopInstancesCommand) {
      this.calls.push('stop');
      this.state = 'stopping';
      return Promise.resolve({});
    }
    return Promise.reject(new Error('unexpected command'));
  }
}

function setup(opts: { cap?: number; userCap?: number; standby?: StandbyManager | null; cloudKey?: string | null } = {}) {
  const redis = new MemoryRedis(() => NOW.getTime());
  const meter = new CreditMeter(redis, { dailyCap: opts.cap ?? 150, userDailyCap: opts.userCap ?? 30 }, () => NOW);
  const cloud = opts.cloudKey === null ? null : new FirecrawlHttpBackend('cloud', CLOUD, opts.cloudKey ?? 'fc-test');
  const client = new CrawlerClient({
    cloud,
    selfhosted: new FirecrawlHttpBackend('selfhosted', STANDBY),
    standby: opts.standby === undefined ? null : opts.standby,
    meter,
    redis,
    now: () => NOW.getTime(),
  });
  return { redis, meter, client };
}

const scrapeOk = (markdown = '# Page', creditsUsed?: number) => ({
  success: true,
  data: { markdown, metadata: { statusCode: 200, title: 'Page', ...(creditsUsed ? { creditsUsed } : {}) } },
});

function mockBalance(remaining: number) {
  return nock(CLOUD).get('/v2/team/credit-usage').reply(200, { success: true, data: { remainingCredits: remaining } });
}

describe('CreditMeter', () => {
  it('reserves, refuses over the cap and rolls back', async () => {
    const { meter, redis } = setup({ cap: 6, userCap: 3 });
    expect(await meter.reserveCloud(5)).toEqual({ ok: true });
    expect(await meter.reserveCloud(5)).toEqual({ ok: false, reason: 'global_cap' });
    expect(await redis.get(CRAWLER_KEYS.credits('2026-10-27'))).toBe('5');
    expect(await meter.reserveCloud(1, 'u1')).toEqual({ ok: true });
    expect(await meter.reserveCloud(5, 'u1')).toEqual({ ok: false, reason: 'global_cap' });
    expect((await meter.userUsage('u1')).used).toBe(1);
    expect(await meter.reserveSelfhosted('u1')).toEqual({ ok: true });
    expect(await meter.reserveSelfhosted('u1')).toEqual({ ok: true });
    expect(await meter.reserveSelfhosted('u1')).toEqual({ ok: false, reason: 'user_cap' });
    const usage = await meter.usage();
    expect(usage).toMatchObject({ day: '2026-10-27', cloudCreditsUsed: 6, selfhostedCalls: 2, backend: 'cloud' });
  });
});

describe('CrawlerClient policy', () => {
  it('uses the cloud, sends the key and charges actual credits', async () => {
    const { client, meter } = setup();
    mockBalance(400);
    const scope = nock(CLOUD, { reqheaders: { authorization: 'Bearer fc-test' } })
      .post('/v2/scrape', (b: { url: string; formats: unknown[] }) => b.url === 'https://acme.test/jobs' && b.formats.length === 2)
      .reply(200, scrapeOk('# Jobs', 5));
    const out = await client.scrape('https://acme.test/jobs', { formats: ['markdown', { type: 'json', schema: {} }] });
    expect(scope.isDone()).toBe(true);
    expect(out).toMatchObject({ backend: 'cloud', creditsUsed: 5, jsonDropped: false });
    expect((await meter.usage()).cloudCreditsUsed).toBe(5);
  });

  it('the daily cap stops cloud crawling and flips the backend for 6 h (no standby → paused:credits)', async () => {
    const { client, meter, redis } = setup({ cap: 5 });
    mockBalance(400);
    nock(CLOUD).post('/v2/scrape').reply(200, scrapeOk('# A', 5));
    await client.scrape('https://acme.test/a', { formats: ['markdown', { type: 'json', schema: {} }] });
    const cloudCall = nock(CLOUD).post('/v2/scrape').reply(200, scrapeOk());
    const err = await client.scrape('https://acme.test/b', { formats: ['markdown'] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect((err as SourceError).kind).toBe('credits');
    expect(cloudCall.isDone()).toBe(false);
    expect(await meter.backend()).toBe('selfhosted');
    expect(await redis.get(CRAWLER_KEYS.backendReason)).toBe('daily_cap');
    expect(await redis.ttl(CRAWLER_KEYS.backend)).toBe(6 * 3600);
    expect((await meter.usage()).cloudCreditsUsed).toBe(5);
  });

  it('a cloud 402 releases the reservation and switches to the standby', async () => {
    const ec2 = new FakeEc2('running');
    const standbyRedis = new MemoryRedis(() => NOW.getTime());
    const standby = new StandbyManager({ ec2, instanceId: 'i-123', baseUrl: STANDBY, redis: standbyRedis, idleMinutes: 20, sleep: () => Promise.resolve(), now: () => NOW.getTime() });
    const { client, meter } = setup({ standby });
    mockBalance(400);
    nock(CLOUD).post('/v2/scrape').reply(402, { success: false, error: 'Insufficient credits' });
    nock(STANDBY).get('/v0/health/readiness').reply(200, { status: 'ok' });
    nock(STANDBY).post('/v1/scrape').reply(200, scrapeOk('# Example Domain'));
    const selfhosted = nock(STANDBY, { badheaders: ['authorization'] })
      .post('/v2/scrape', (b: { formats: unknown[] }) => JSON.stringify(b.formats) === '["markdown"]')
      .reply(200, scrapeOk('# From standby'));
    const out = await client.scrape('https://acme.test/jobs', { formats: ['markdown', { type: 'json', schema: {} }] });
    expect(selfhosted.isDone()).toBe(true);
    expect(out).toMatchObject({ backend: 'selfhosted', creditsUsed: 0, jsonDropped: true });
    expect(out.data.markdown).toBe('# From standby');
    expect(await meter.backend()).toBe('selfhosted');
    expect((await meter.usage()).cloudCreditsUsed).toBe(0);
    expect((await meter.usage()).selfhostedCalls).toBe(1);
  });

  it('hourly balance check below 20 credits flips to selfhosted', async () => {
    const { client, meter } = setup();
    const balance = mockBalance(12);
    const err = await client.scrape('https://acme.test/jobs', { formats: ['markdown'] }).catch((e: unknown) => e);
    expect(balance.isDone()).toBe(true);
    expect((err as SourceError).kind).toBe('credits');
    expect(await meter.backend()).toBe('selfhosted');
  });

  it('the per-user cap defers personal crawls without flipping the global backend', async () => {
    const { client, meter } = setup({ userCap: 1 });
    mockBalance(400);
    const err = await client.scrape('https://acme.test/jobs', { formats: ['markdown', { type: 'json', schema: {} }], userId: 'u1' }).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe('credits');
    expect((err as SourceError).message).toMatch(/personal sources/);
    expect(await meter.backend()).toBe('cloud');
  });

  it('robots.txt disallow blocks the crawl before any credit is spent', async () => {
    const { redis, meter } = setup();
    const client = new CrawlerClient({
      cloud: new FirecrawlHttpBackend('cloud', CLOUD, 'k'),
      selfhosted: null,
      standby: null,
      meter,
      redis,
      robots: new RobotsChecker(redis),
    });
    nock('https://private.test').get('/robots.txt').reply(200, 'User-agent: *\nDisallow: /careers');
    const err = await client.scrape('https://private.test/careers/1', { formats: ['markdown'] }).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe('blocked');
    expect((await meter.usage()).cloudCreditsUsed).toBe(0);
    // Cached: no second robots.txt fetch.
    expect(await new RobotsChecker(redis).isAllowed('https://private.test/about')).toBe(true);
  });
});

describe('StandbyManager', () => {
  const make = (ec2: FakeEc2 | null, redis = new MemoryRedis(), clock = { t: NOW.getTime() }) =>
    new StandbyManager({
      ec2,
      instanceId: ec2 ? 'i-standby' : null,
      baseUrl: STANDBY,
      redis,
      idleMinutes: 20,
      readyTimeoutMs: 4 * 60_000,
      pollIntervalMs: 5_000,
      now: () => clock.t,
      sleep: (ms) => {
        clock.t += ms;
        return Promise.resolve();
      },
    });

  it('starts a stopped instance, waits for running, then for a real scrape', async () => {
    const ec2 = new FakeEc2('stopped', 3);
    const standby = make(ec2);
    nock(STANDBY).get('/v0/health/readiness').reply(503);
    nock(STANDBY).get('/v0/health/readiness').times(2).reply(200, { status: 'ok' });
    nock(STANDBY).post('/v1/scrape').reply(500);
    const ready = nock(STANDBY).post('/v1/scrape', (b: { url: string }) => b.url === 'https://example.com').reply(200, scrapeOk());
    await standby.ensureReady();
    expect(ec2.calls.filter((c) => c === 'start')).toHaveLength(1);
    expect(ec2.state).toBe('running');
    expect(ready.isDone()).toBe(true);
    // Ready is cached for a minute: no new EC2 calls.
    const before = ec2.calls.length;
    await standby.ensureReady();
    expect(ec2.calls.length).toBe(before);
  });

  it('gives up after 4 minutes', async () => {
    const ec2 = new FakeEc2('running');
    const standby = make(ec2);
    nock(STANDBY).get('/v0/health/readiness').times(100).reply(503);
    const err = await standby.ensureReady().catch((e: unknown) => e);
    expect((err as SourceError).message).toMatch(/not ready/);
  });

  it('stops only after the idle window', async () => {
    const ec2 = new FakeEc2('running');
    const clock = { t: NOW.getTime() };
    const standby = make(ec2, new MemoryRedis(), clock);
    await standby.touch();
    clock.t += 10 * 60_000;
    expect(await standby.stopIfIdle()).toBe('in-use');
    clock.t += 11 * 60_000;
    expect(await standby.stopIfIdle()).toBe('stopped');
    expect(ec2.calls).toContain('stop');
    expect(await standby.stopIfIdle()).toBe('not-running');
  });

  it('is unavailable without an instance id or URL', async () => {
    const standby = make(null);
    expect(standby.available).toBe(false);
    expect(await standby.stopIfIdle()).toBe('unavailable');
    await expect(standby.ensureReady()).rejects.toMatchObject({ kind: 'credits' });
  });
});
