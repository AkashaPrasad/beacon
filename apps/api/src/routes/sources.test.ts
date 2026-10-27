import nock from 'nock';
import { beforeEach, describe, expect, it } from 'vitest';

import { utcDay } from '../lib/redis.js';
import { Subscription } from '../models/activity.js';
import { Source } from '../models/source.js';
import { as, buildTestApp, createSource, createUser, resetDb } from '../test/helpers.js';

const GREENHOUSE = {
  jobs: [
    { id: 1, title: 'Backend Engineer Intern', absolute_url: 'https://boards.greenhouse.io/acme/jobs/1' },
    { id: 2, title: 'Data Engineer', absolute_url: 'https://boards.greenhouse.io/acme/jobs/2' },
  ],
  meta: { total: 2 },
};

describe('sources routes', () => {
  beforeEach(resetDb);

  it('POST /v1/sources/detect recognises a Greenhouse board and counts its postings', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    nock('https://boards-api.greenhouse.io').get('/v1/boards/acme/jobs').reply(200, GREENHOUSE);
    const res = await as(app, user).post('/v1/sources/detect').send({ url: 'boards.greenhouse.io/acme' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: 'greenhouse', boardToken: 'acme', previewCount: 2, valid: true, costsCredits: false });
    expect(res.body.sampleTitles).toContain('Backend Engineer Intern');
    expect((await as(app, user).post('/v1/sources/detect').send({ url: '' })).status).toBe(400);
  });

  it('POST /v1/sources detects, creates, queues ingest + match, and refuses duplicates', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    nock('https://boards-api.greenhouse.io').get('/v1/boards/acme/jobs').reply(200, GREENHOUSE);
    const res = await as(app, user).post('/v1/sources').send({ url: 'https://boards.greenhouse.io/acme' });
    expect(res.status).toBe(201);
    expect(res.body.source).toMatchObject({
      kind: 'greenhouse',
      scope: 'personal',
      ownerId: user._id.toString(),
      health: 'pending',
      healthCode: null,
      refreshInterval: 'daily',
      config: { boardToken: 'acme' },
    });
    expect(res.body.detection).toMatchObject({ kind: 'greenhouse', previewCount: 2 });
    const id = res.body.source.id as string;
    expect(queue.of('ingest')).toEqual([{ sourceId: id, reason: 'created' }]);
    expect(queue.of('match')).toEqual([{ userId: user._id.toString(), reason: 'sources' }]);

    const dup = await as(app, user).post('/v1/sources').send({ url: 'https://boards.greenhouse.io/acme' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.existingId).toBe(id);

    // A kind from an earlier detect skips detection (no network call).
    const lever = await as(app, user)
      .post('/v1/sources')
      .send({ url: 'https://jobs.lever.co/acme', kind: 'lever', name: 'Acme (Lever)', enabled: false });
    expect(lever.status).toBe(201);
    expect(lever.body.detection).toBeNull();
    expect(lever.body.source).toMatchObject({ kind: 'lever', name: 'Acme (Lever)', enabled: false, config: { boardToken: 'acme' } });
    expect(queue.of('ingest')).toHaveLength(1);

    const list = await as(app, user).get('/v1/sources');
    expect(list.body.items.map((s: { kind: string }) => s.kind)).toEqual(['lever', 'greenhouse']);
  });

  it('PATCH /v1/sources/:id queues an ingest when enabled; community sources are read-only', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const mine = await createSource({ scope: 'personal', ownerId: user._id, enabled: false, url: 'https://jobs.lever.co/mine' });
    const res = await as(app, user).patch(`/v1/sources/${mine._id.toString()}`).send({ enabled: true, refreshInterval: '6h' });
    expect(res.status).toBe(200);
    expect(res.body.source).toMatchObject({ enabled: true, refreshInterval: '6h' });
    expect(queue.of('ingest')).toEqual([{ sourceId: mine._id.toString(), reason: 'enabled' }]);
    expect((await as(app, user).patch(`/v1/sources/${mine._id.toString()}`).send({ refreshInterval: 'hourly-ish' })).status).toBe(400);

    const community = await createSource({ scope: 'community', healthCode: 'paused:credits', health: 'degraded' });
    const cid = community._id.toString();
    const got = await as(app, user).get(`/v1/sources/${cid}`);
    expect(got.status).toBe(200);
    expect(got.body.source).toMatchObject({ scope: 'community', healthCode: 'paused:credits', health: 'degraded' });
    expect((await as(app, user).patch(`/v1/sources/${cid}`).send({ name: 'x' })).status).toBe(403);
    expect((await as(app, user).delete(`/v1/sources/${cid}`)).status).toBe(403);

    expect((await as(app, user).delete(`/v1/sources/${mine._id.toString()}`)).status).toBe(204);
    expect(await Source.exists({ _id: mine._id })).toBeNull();
  });

  it('packs: list, enable (alias ids accepted) and disable', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const stale = await createSource({ scope: 'community', packId: 'top-indian-product', packIds: ['top-indian-product'] });
    await createSource({
      scope: 'community',
      packId: 'top-indian-product',
      packIds: ['top-indian-product'],
      lastCheckedAt: new Date(),
    });

    const packs = await as(app, user).get('/v1/sources/packs');
    expect(packs.status).toBe(200);
    const pack = packs.body.items.find((p: { id: string }) => p.id === 'top-indian-product');
    expect(pack).toMatchObject({ sourceCount: 2, enabled: false });
    expect(packs.body.items.map((p: { id: string }) => p.id)).toContain('hackathons-india');

    const enabled = await as(app, user).post('/v1/sources/packs/india-product/enable');
    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({ subscribed: 2, ingestQueued: 1, pack: { id: 'top-indian-product', enabled: true } });
    expect(queue.of('ingest')).toEqual([{ sourceId: stale._id.toString(), reason: 'pack' }]);
    expect(queue.of('match')).toEqual([{ userId: user._id.toString(), reason: 'sources' }]);
    expect(await Subscription.countDocuments({ userId: user._id })).toBe(2);
    expect((await as(app, user).get('/v1/me')).body.onboarding.enabledPacks).toEqual(['top-indian-product']);

    const disabled = await as(app, user).post('/v1/sources/packs/top-indian-product/disable');
    expect(disabled.body).toMatchObject({ unsubscribed: 2, pack: { enabled: false } });
    expect(await Subscription.countDocuments({ userId: user._id })).toBe(0);
    expect((await as(app, user).post('/v1/sources/packs/no-such-pack/enable')).status).toBe(404);
    expect((await as(app, user).post('/v1/sources/packs/no-such-pack/disable')).status).toBe(404);
  });

  it('GET /v1/sources/community filters, flags subscriptions and paginates', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const sources = [];
    for (let i = 0; i < 5; i += 1) {
      sources.push(
        await createSource({
          name: i % 2 ? `Devpost ${i}` : `Groww ${i}`,
          kind: i % 2 ? 'publicapi' : 'greenhouse',
          packId: 'hackathons-india',
          packIds: ['hackathons-india'],
        }),
      );
    }
    await createSource({ scope: 'personal', ownerId: user._id, url: 'https://jobs.lever.co/hidden' });
    await Subscription.create({ userId: user._id, sourceId: sources[0]!._id, packId: 'hackathons-india' });
    const api = as(app, user);

    const first = await api.get('/v1/sources/community?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0]).toMatchObject({ id: sources[0]!._id.toString(), subscribed: true, scope: 'community' });
    expect(first.body.items[1].subscribed).toBe(false);
    const seen = new Set(first.body.items.map((s: { id: string }) => s.id));
    let cursor = first.body.nextCursor as string | null;
    while (cursor) {
      const next = await api.get(`/v1/sources/community?limit=2&cursor=${cursor}`);
      for (const s of next.body.items as { id: string }[]) {
        expect(seen.has(s.id)).toBe(false);
        seen.add(s.id);
      }
      cursor = next.body.nextCursor;
    }
    expect(seen.size).toBe(5);

    expect((await api.get('/v1/sources/community?kind=publicapi')).body.items).toHaveLength(2);
    expect((await api.get('/v1/sources/community?q=groww')).body.items).toHaveLength(3);
    expect((await api.get('/v1/sources/community?pack=hackathons')).body.items).toHaveLength(5);
    expect((await api.get('/v1/sources/community?pack=unknown')).body).toEqual({ items: [], nextCursor: null });
    expect((await api.get('/v1/sources/community?cursor=not-a-cursor')).status).toBe(400);
    expect((await api.get('/v1/sources/community?limit=500')).status).toBe(400);
  });

  it('GET /v1/sources/credits reads the shared crawler meter', async () => {
    const { app, redis, ctx } = buildTestApp();
    const user = await createUser();
    const day = utcDay(ctx.now());
    await redis.set(`crawler:credits:${day}`, '42');
    await redis.set(`crawler:selfhosted:${day}`, '3');
    await redis.set(`crawler:user:${user._id.toString()}:${day}`, '5');
    await redis.set('crawler:backend', 'selfhosted');
    await redis.set('crawler:backend:reason', 'daily_cap');
    await redis.set('crawler:cloud:remaining', '17');
    const res = await as(app, user).get('/v1/sources/credits');
    expect(res.body).toEqual({
      date: day,
      cloudUsedToday: 42,
      cap: 500,
      selfHostedUsedToday: 3,
      backend: 'selfhosted',
      userUsedToday: 5,
      backendReason: 'daily_cap',
      cloudRemaining: 17,
    });
  });
});
