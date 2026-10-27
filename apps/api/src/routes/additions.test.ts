import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../env.js';
import { verifySession } from '../lib/jwt.js';
import { redisKeys, utcDay } from '../lib/redis.js';
import { Match, Subscription, TrackerItem } from '../models/activity.js';
import { User } from '../models/user.js';
import { mintDevToken } from '../scripts/dev-token.js';
import {
  as,
  buildTestApp,
  createListing,
  createSource,
  createUser,
  resetDb,
  TEST_JWT_SECRET,
  tokenFor,
} from '../test/helpers.js';

describe('routes added after the first API.md draft', () => {
  beforeEach(resetDb);

  it('POST /v1/sources/:id/refresh queues an ingest for own and subscribed sources', async () => {
    const { app, ctx, queue } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const own = await createSource({ scope: 'personal', ownerId: user._id, healthCode: 'paused:credits' });
    const res = await api.post(`/v1/sources/${own._id.toString()}/refresh`);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ queued: true, source: { id: own._id.toString(), healthCode: 'paused:credits' } });
    expect(queue.of('ingest')).toEqual([{ sourceId: own._id.toString(), reason: 'manual' }]);

    const disabled = await createSource({ scope: 'personal', ownerId: user._id, enabled: false });
    expect((await api.post(`/v1/sources/${disabled._id.toString()}/refresh`)).status).toBe(409);

    const community = await createSource({ scope: 'community', lastCheckedAt: ctx.now() });
    expect((await api.post(`/v1/sources/${community._id.toString()}/refresh`)).status).toBe(404);
    await Subscription.create({ userId: user._id, sourceId: community._id, packId: 'hackathons-india' });
    const fresh = await api.post(`/v1/sources/${community._id.toString()}/refresh`);
    expect(fresh.status).toBe(409);
    expect(fresh.body.error.details.reason).toBe('recently_checked');
    const stale = await createSource({ scope: 'community', lastCheckedAt: new Date(Date.now() - 3_600_000) });
    await Subscription.create({ userId: user._id, sourceId: stale._id, packId: 'hackathons-india' });
    expect((await api.post(`/v1/sources/${stale._id.toString()}/refresh`)).status).toBe(202);
  });

  it('POST /v1/push/test queues a generic test notification', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user).post('/v1/push/test');
    expect(res.status).toBe(202);
    expect(queue.of('notify')).toEqual([{ userId: user._id.toString(), test: true }]);
    expect((await request(app).post('/v1/push/test').set('X-Requested-With', 'beacon')).status).toBe(401);
  });

  it('POST /v1/alerts/preview counts recent matches that satisfy the conditions', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const empty = await api.post('/v1/alerts/preview').send({});
    expect(empty.body).toMatchObject({ matchesLast7d: 0, warmingUp: true, matchesByDay: [0, 0, 0, 0, 0, 0, 0] });

    const hit = await createListing({ type: 'internship', title: 'React Intern', remote: 'remote' });
    const old = await createListing({ firstSeenAt: new Date(Date.now() - 20 * 86_400_000) });
    const job = await createListing({ type: 'fulltime' });
    await Match.create([
      { userId: user._id, listingId: hit._id, score: 88 },
      { userId: user._id, listingId: old._id, score: 95 },
      { userId: user._id, listingId: job._id, score: 90 },
    ]);
    const res = await api.post('/v1/alerts/preview').send({ conditions: { minFit: 80, types: ['internship'], keywords: ['react'] } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matchesLast7d: 1, warmingUp: false });
    expect(res.body.matchesByDay[6]).toBe(1);
    expect(res.body.sample[0]).toMatchObject({ listingId: hit._id.toString(), score: 88 });
    expect((await api.post('/v1/alerts/preview').send({ conditions: { minFit: 500 } })).status).toBe(400);
  });

  it('GET /v1/settings/ai/usage reads the per-user Redis counters', async () => {
    const { app, redis, ctx } = buildTestApp();
    const user = await createUser();
    const day = utcDay(ctx.now());
    await redis.set(redisKeys.llmCalls(user._id.toString(), day), '3');
    await redis.hincrby(redisKeys.llmTokens(user._id.toString(), day), 'total', 900);
    const res = await as(app, user).get('/v1/settings/ai/usage');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: day, calls: 3, cap: 50, tokens: { prompt: 0, completion: 0, total: 900 } });
  });

  it('POST /v1/tracker/:id/move answers 409 for a stale board', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const item = (await api.post('/v1/tracker').send({ manual: { title: 'SWE Intern', company: 'Acme' } })).body.item;
    await TrackerItem.updateOne({ _id: item.id }, { $set: { stage: 'applied' } });
    const stale = await api.post(`/v1/tracker/${item.id}/move`).send({ stage: 'interview', position: 0, fromStage: 'saved' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toMatchObject({ reason: 'stale', item: { id: item.id, stage: 'applied' } });
    const older = await api
      .post(`/v1/tracker/${item.id}/move`)
      .send({ stage: 'interview', position: 0, ifUnmodifiedSince: '2000-01-01T00:00:00.000Z' });
    expect(older.status).toBe(409);
    const ok = await api.post(`/v1/tracker/${item.id}/move`).send({ stage: 'interview', position: 0, fromStage: 'applied' });
    expect(ok.status).toBe(200);
    expect(ok.body.item.stage).toBe('interview');
  });

  it('visibility uses listings.sourceIds (every source a deduped listing was seen in)', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const subscribed = await createSource({ scope: 'community' });
    const other = await createSource({ scope: 'community' });
    await Subscription.create({ userId: user._id, sourceId: subscribed._id, packId: 'faang-plus-india' });
    // Last written by the unsubscribed source, but also seen in the subscribed one.
    const deduped = await createListing({ sourceId: other._id, sourceIds: [other._id, subscribed._id] });
    const hidden = await createListing({ sourceId: other._id, sourceIds: [other._id] });
    const api = as(app, user);
    expect((await api.get(`/v1/listings/${deduped._id.toString()}`)).status).toBe(200);
    expect((await api.get(`/v1/listings/${hidden._id.toString()}`)).status).toBe(404);
    const feed = await api.get('/v1/feed');
    expect(feed.body.warmingUp).toBe(true);
    expect(feed.body.items.map((i: { listing: { id: string } }) => i.listing.id)).toEqual([deduped._id.toString()]);
    const summary = await api.get('/v1/feed/summary');
    expect(summary.body.total).toBe(1);
    const credits = await api.get('/v1/sources/credits');
    expect(credits.body).toMatchObject({ backend: 'cloud', backendReason: null, cloudRemaining: null });
  });

  it('GET /healthz?mem=1 adds process memory for the soak test', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/healthz?mem=1');
    expect(res.body.ok).toBe(true);
    expect(res.body.mem.rss).toBeGreaterThan(0);
    expect(Object.keys(res.body.mem).sort()).toEqual(['external', 'heapTotal', 'heapUsed', 'rss']);
  });

  it('dev:token mints a working token for a reusable dev user and refuses production', async () => {
    const env = loadEnv({ NODE_ENV: 'test', JWT_SECRET: TEST_JWT_SECRET });
    const first = await mintDevToken(env, { email: 'Load@Beacon.test' });
    const second = await mintDevToken(env, { email: 'load@beacon.test' });
    expect(second.user._id.toString()).toBe(first.user._id.toString());
    expect(await User.countDocuments({ email: 'load@beacon.test' })).toBe(1);
    const verified = verifySession(first.token, TEST_JWT_SECRET);
    expect(verified.ok && verified.claims.sub).toBe(first.user._id.toString());
    const { app } = buildTestApp();
    const me = await request(app).get('/v1/me').set('Authorization', `Bearer ${first.token}`);
    expect(me.status).toBe(200);
    expect(me.body.onboarding.step).toBe('done');
    await expect(mintDevToken({ ...env, NODE_ENV: 'production' }, { email: 'x@y.z' })).rejects.toThrow(/production/);
    await expect(mintDevToken(env, { email: 'not-an-email' })).rejects.toThrow(/email/);
    expect(tokenFor(first.user)).toBeTruthy();
  });
});
