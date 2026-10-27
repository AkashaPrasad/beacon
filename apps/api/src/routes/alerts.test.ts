import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { DAY_MS } from '@kestrel/shared';

import { Notification, PushSubscription, TrackerItem } from '../models/activity.js';
import { as, buildTestApp, createSource, createUser, resetDb } from '../test/helpers.js';

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'B'.repeat(40), auth: 'a'.repeat(16) },
  expirationTime: null,
};

describe('alerts, push and notifications', () => {
  beforeEach(resetDb);

  it('alert rules: create with defaults, list, get, patch conditions, test and delete', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const created = await api.post('/v1/alerts').send({ name: 'Backend internships', conditions: { types: ['internship'], minFit: 80 } });
    expect(created.status).toBe(201);
    expect(created.body.rule).toMatchObject({
      name: 'Backend internships',
      enabled: true,
      channels: ['inapp', 'push'],
      cadence: 'instant',
      conditions: { types: ['internship'], minFit: 80, remote: 'any' },
      timezone: 'Asia/Kolkata',
    });
    const id = created.body.rule.id as string;
    expect((await api.post('/v1/alerts').send({ name: 'x', channels: ['email'] })).status).toBe(400);
    expect((await api.post('/v1/alerts').send({ name: '' })).status).toBe(400);

    expect((await api.get('/v1/alerts')).body.items.map((r: { id: string }) => r.id)).toEqual([id]);
    expect((await api.get(`/v1/alerts/${id}`)).body.rule.name).toBe('Backend internships');
    const patched = await api.patch(`/v1/alerts/${id}`).send({ enabled: false, conditions: { minFit: 60 } });
    expect(patched.body.rule).toMatchObject({ enabled: false, conditions: { minFit: 60, types: ['internship'] } });

    const test = await api.post(`/v1/alerts/${id}/test`);
    expect(test.status).toBe(202);
    expect(queue.of('notify')).toEqual([{ userId: user._id.toString(), alertRuleId: id, test: true }]);

    expect((await api.delete(`/v1/alerts/${id}`)).status).toBe(204);
    expect((await api.get(`/v1/alerts/${id}`)).status).toBe(404);
  });

  it('GET /v1/push/vapid-public-key is public, and 503 when push is not configured', async () => {
    const { app } = buildTestApp();
    expect((await request(app).get('/v1/push/vapid-public-key')).body).toEqual({ publicKey: 'BTestVapidPublicKey' });
    const { app: noPush } = buildTestApp({}, { VAPID_PUBLIC_KEY: '' });
    const res = await request(noPush).get('/v1/push/vapid-public-key');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('push subscriptions: upsert by endpoint, list without keys, delete by endpoint or id', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const created = await api.post('/v1/push/subscriptions').set('User-Agent', 'Firefox/140').send(SUB);
    expect(created.status).toBe(201);
    expect(created.body.subscription).toMatchObject({ endpoint: SUB.endpoint, userAgent: 'Firefox/140' });
    expect(created.body.subscription).not.toHaveProperty('keys');
    const again = await api.post('/v1/push/subscriptions').send({ ...SUB, userAgent: 'Chrome/141' });
    expect(again.body.subscription.id).toBe(created.body.subscription.id);
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect((await api.post('/v1/push/subscriptions').send({ ...SUB, endpoint: 'http://insecure.example/x' })).status).toBe(400);

    const list = await api.get('/v1/push/subscriptions');
    expect(list.body.items).toEqual([expect.objectContaining({ endpoint: SUB.endpoint, userAgent: 'Chrome/141' })]);

    expect((await api.delete('/v1/push/subscriptions').send({ endpoint: SUB.endpoint })).status).toBe(204);
    expect(await PushSubscription.countDocuments()).toBe(0);
    const second = await api.post('/v1/push/subscriptions').send(SUB);
    expect((await api.delete(`/v1/push/subscriptions/${second.body.subscription.id as string}`)).status).toBe(204);
    expect((await api.delete(`/v1/push/subscriptions/${second.body.subscription.id as string}`)).status).toBe(404);
  });

  it('notifications: newest first, cursor pages, unreadOnly, mark read', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const base = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await Notification.create({ userId: user._id, kind: 'system', title: `n${i}`, createdAt: new Date(base - i * 60_000) });
    }
    const api = as(app, user);
    const first = await api.get('/v1/notifications?limit=3');
    expect(first.body.items.map((n: { title: string }) => n.title)).toEqual(['n0', 'n1', 'n2']);
    expect(first.body.unreadCount).toBe(5);
    const second = await api.get(`/v1/notifications?limit=3&cursor=${first.body.nextCursor as string}`);
    expect(second.body.items.map((n: { title: string }) => n.title)).toEqual(['n3', 'n4']);
    expect(second.body.nextCursor).toBeNull();

    const read = await api.post('/v1/notifications/read').send({ ids: [first.body.items[0].id] });
    expect(read.body).toEqual({ updated: 1, unreadCount: 4 });
    expect((await api.get('/v1/notifications?unreadOnly=true')).body.items).toHaveLength(4);
    expect((await api.post('/v1/notifications/read').send({ all: true })).body).toEqual({ updated: 4, unreadCount: 0 });
    expect((await api.post('/v1/notifications/read').send({ ids: [] })).status).toBe(400);
  });
});

describe('GET /v1/tracker/analytics', () => {
  beforeEach(resetDb);

  it('counts stages, response rate, median response time, best sources and follow-ups', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const source = await createSource({ name: 'Groww careers' });
    const now = Date.now();
    const at = (days: number) => new Date(now - days * DAY_MS);
    await TrackerItem.create([
      // Applied 20 d ago, interview 4 d later → responded.
      {
        userId: user._id, title: 'A', company: 'Groww', stage: 'interview', sourceId: source._id, appliedAt: at(20),
        history: [{ stage: 'applied', at: at(20) }, { stage: 'interview', at: at(16) }],
      },
      // Applied 12 d ago, quiet since → follow up.
      { userId: user._id, title: 'B', company: 'Zerodha', stage: 'applied', sourceId: source._id, appliedAt: at(12), lastActivityAt: at(12), history: [{ stage: 'applied', at: at(12) }] },
      // Applied 40 d ago, quiet since → move on.
      { userId: user._id, title: 'C', company: 'Swiggy', stage: 'applied', appliedAt: at(40), lastActivityAt: at(40), history: [{ stage: 'applied', at: at(40) }] },
      // Saved only.
      { userId: user._id, title: 'D', company: 'CRED', stage: 'saved' },
    ]);
    const res = await as(app, user).get('/v1/tracker/analytics');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 4,
      applied: 3,
      responded: 1,
      responseRate: 0.333,
      medianResponseDays: 4,
      stageCounts: { saved: 1, applied: 2, interview: 1, offer: 0 },
    });
    expect(res.body.bestSources).toEqual([
      { sourceId: source._id.toString(), name: 'Groww careers', applied: 2, responded: 1, responseRate: 0.5 },
    ]);
    expect(res.body.followUp.map((i: { title: string }) => i.title)).toEqual(['B']);
    expect(res.body.moveOn.map((i: { title: string }) => i.title)).toEqual(['C']);
  });
});
