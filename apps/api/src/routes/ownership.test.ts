import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AlertRule, Match, Notification, PushSubscription, Subscription, TrackerItem } from '../models/activity.js';
import { Source } from '../models/source.js';
import { as, buildTestApp, createListing, createSource, createUser, resetDb } from '../test/helpers.js';

/** SPEC §8: user A can never read or change user B's data; foreign ids answer 404 (never 403). */
describe('ownership', () => {
  beforeEach(resetDb);

  async function setup() {
    const t = buildTestApp();
    const a = await createUser();
    const b = await createUser();
    const bSource = await createSource({ scope: 'personal', ownerId: b._id, url: 'https://jobs.lever.co/bco' });
    const bListing = await createListing({ sourceId: bSource._id });
    const bTracker = await TrackerItem.create({ userId: b._id, title: 'B role', company: 'B Co', stage: 'saved' });
    const bRule = await AlertRule.create({ userId: b._id, name: 'B rule' });
    const bPush = await PushSubscription.create({
      userId: b._id,
      endpoint: 'https://push.example/b-endpoint',
      keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) },
    });
    const bNote = await Notification.create({ userId: b._id, kind: 'system', title: 'For B' });
    // A has its own source, so B's personal-source listing is not visible to A.
    await createSource({ scope: 'personal', ownerId: a._id, url: 'https://jobs.lever.co/aco' });
    return { ...t, a, b, bSource, bListing, bTracker, bRule, bPush, bNote };
  }

  it('sources: B’s personal source is invisible and immutable for A', async () => {
    const { app, a, bSource } = await setup();
    const api = as(app, a);
    const id = bSource._id.toString();
    expect((await api.get(`/v1/sources/${id}`)).status).toBe(404);
    expect((await api.patch(`/v1/sources/${id}`).send({ name: 'hijack' })).status).toBe(404);
    expect((await api.delete(`/v1/sources/${id}`)).status).toBe(404);
    expect((await api.post(`/v1/sources/${id}/refresh`)).status).toBe(404);
    const mine = await api.get('/v1/sources');
    expect(mine.body.items.map((s: { url: string }) => s.url)).toEqual(['https://jobs.lever.co/aco']);
    expect(await Source.countDocuments({ _id: bSource._id, name: 'hijack' })).toBe(0);
  });

  it('listings: a listing only reachable through B’s sources is a 404 for A', async () => {
    const { app, a, b, bListing } = await setup();
    const id = bListing._id.toString();
    const api = as(app, a);
    expect((await api.get(`/v1/listings/${id}`)).status).toBe(404);
    expect((await api.post(`/v1/listings/${id}/save`)).status).toBe(404);
    expect((await api.post(`/v1/listings/${id}/explain`)).status).toBe(404);
    expect((await api.post('/v1/tracker').send({ listingId: id })).status).toBe(404);
    expect((await as(app, b).get(`/v1/listings/${id}`)).status).toBe(200);
  });

  it('tracker, alerts, push subscriptions and notifications are per user', async () => {
    const { app, a, bTracker, bRule, bPush, bNote } = await setup();
    const api = as(app, a);
    const t = bTracker._id.toString();
    expect((await api.get(`/v1/tracker/${t}`)).status).toBe(404);
    expect((await api.patch(`/v1/tracker/${t}`).send({ notes: 'x' })).status).toBe(404);
    expect((await api.post(`/v1/tracker/${t}/move`).send({ stage: 'applied', position: 0 })).status).toBe(404);
    expect((await api.delete(`/v1/tracker/${t}`)).status).toBe(404);
    expect((await api.get('/v1/tracker')).body.items).toEqual([]);

    const r = bRule._id.toString();
    expect((await api.get(`/v1/alerts/${r}`)).status).toBe(404);
    expect((await api.patch(`/v1/alerts/${r}`).send({ name: 'x' })).status).toBe(404);
    expect((await api.post(`/v1/alerts/${r}/test`)).status).toBe(404);
    expect((await api.delete(`/v1/alerts/${r}`)).status).toBe(404);
    expect((await api.get('/v1/alerts')).body.items).toEqual([]);

    expect((await api.delete(`/v1/push/subscriptions/${bPush._id.toString()}`)).status).toBe(404);
    expect((await api.delete('/v1/push/subscriptions').send({ endpoint: bPush.endpoint })).status).toBe(204);
    expect(await PushSubscription.countDocuments({ _id: bPush._id })).toBe(1);
    expect((await api.get('/v1/push/subscriptions')).body.items).toEqual([]);

    const read = await api.post('/v1/notifications/read').send({ ids: [bNote._id.toString()] });
    expect(read.body.updated).toBe(0);
    expect((await Notification.findById(bNote._id).lean())?.readAt).toBeNull();
    expect((await api.get('/v1/notifications')).body.items).toEqual([]);
  });

  it('malformed ids are 404, the same as foreign ones', async () => {
    const { app, a } = await setup();
    const api = as(app, a);
    for (const path of ['/v1/sources/nope', '/v1/listings/nope', '/v1/tracker/nope', '/v1/alerts/nope']) {
      const res = await api.get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('feed, summary and export never include another user’s data', async () => {
    const { app, a, b, bListing } = await setup();
    await Match.create({ userId: b._id, listingId: bListing._id, score: 91 });
    await Subscription.create({ userId: b._id, sourceId: bListing.sourceId, packId: null });
    const api = as(app, a);
    const feed = await api.get('/v1/feed');
    expect(feed.status).toBe(200);
    expect(feed.body.items.map((i: { listing: { id: string } }) => i.listing.id)).not.toContain(bListing._id.toString());
    const exported = await api.get('/v1/settings/export');
    expect(exported.status).toBe(200);
    const body = JSON.parse(exported.text);
    expect(body.user.id).toBe(a._id.toString());
    expect(body.tracker).toEqual([]);
    expect(body.matches).toEqual([]);
    expect(body.sources.every((s: { ownerId: string }) => String(s.ownerId) === a._id.toString())).toBe(true);
  });

  it('unknown /v1 routes are 404 even without a session; known user routes are 401', async () => {
    const { app } = await setup();
    const unknown = await request(app).get('/v1/definitely-not-a-route');
    expect(unknown.status).toBe(404);
    const tracker = await request(app).get('/v1/tracker');
    expect(tracker.status).toBe(401);
    expect(tracker.body.error.details.reason).toBe('missing');
  });
});
