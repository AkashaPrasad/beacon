import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { aiKeyAad, decryptSecret } from '../lib/crypto.js';
import { AlertRule, Interaction, Match, Notification, TrackerItem } from '../models/activity.js';
import { Profile } from '../models/profile.js';
import { Settings } from '../models/settings.js';
import { Source } from '../models/source.js';
import { User } from '../models/user.js';
import { as, buildTestApp, cookieFor, createListing, createSource, createUser, resetDb, TEST_ENCRYPTION_KEY } from '../test/helpers.js';
import { mockLlm } from '../test/llm-mock.js';

const WEIGHTS = { semantic: 30, skills: 30, role: 10, eligibility: 10, location: 10, freshness: 5, stipend: 5 };

describe('settings and account', () => {
  beforeEach(resetDb);

  it('GET /v1/settings creates defaults; PATCH /v1/settings updates groups and requeues on weight changes', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const defaults = await api.get('/v1/settings');
    expect(defaults.status).toBe(200);
    expect(defaults.body).toMatchObject({
      userId: user._id.toString(),
      appearance: { theme: 'system' },
      ai: { provider: 'default', hasKey: false, keyLast4: null },
      notifications: { timezone: 'Asia/Kolkata' },
    });
    expect(defaults.body.ai).not.toHaveProperty('keyCiphertext');

    const patched = await api.patch('/v1/settings').send({
      appearance: { theme: 'dark', density: 'compact' },
      notifications: { push: false },
      ai: { consent: true },
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ appearance: { theme: 'dark', density: 'compact' }, notifications: { push: false } });
    expect(patched.body.ai.consentGivenAt).toEqual(expect.any(String));
    expect(queue.of('match')).toHaveLength(0);

    const weights = await api.patch('/v1/settings').send({ weights: { skills: 60 } });
    expect(weights.body.weights.skills).toBe(60);
    expect(queue.of('match')).toEqual([{ userId: user._id.toString(), reason: 'weights' }]);
    expect((await api.patch('/v1/settings').send({ appearance: { theme: 'neon' } })).status).toBe(400);
  });

  it('PUT /v1/settings/weights stores raw sliders and returns the normalised weights', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user).put('/v1/settings/weights').send(WEIGHTS);
    expect(res.status).toBe(200);
    expect(res.body.weights).toEqual(WEIGHTS);
    const sum = Object.values(res.body.normalised as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(res.body.normalised.skills).toBeCloseTo(0.3, 6);
    expect(queue.of('match')).toHaveLength(1);
    const zero = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0]));
    expect((await as(app, user).put('/v1/settings/weights').send(zero)).status).toBe(400);
  });

  it('PUT /v1/settings/ai encrypts a BYOK key; DELETE /v1/settings/ai/key removes it', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const key = 'sk-byok-test-key-1234';
    const put = await api.put('/v1/settings/ai').send({ provider: 'openai', model: 'gpt-4o-mini', apiKey: key, enabled: true });
    expect(put.status).toBe(200);
    expect(put.body.ai).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', hasKey: true, keyLast4: '1234', enabled: true });
    const stored = await Settings.findOne({ userId: user._id }).lean();
    const ciphertext = stored?.ai.keyCiphertext as string;
    expect(ciphertext).not.toContain(key);
    expect(decryptSecret(ciphertext, TEST_ENCRYPTION_KEY, aiKeyAad(user._id.toString()))).toBe(key);
    expect(JSON.stringify((await api.get('/v1/settings')).body)).not.toContain(ciphertext);

    // Switching provider without a new key drops the old one (never sent to another provider).
    const switched = await api.put('/v1/settings/ai').send({ provider: 'openrouter', enabled: true });
    expect(switched.body.ai).toMatchObject({ provider: 'openrouter', hasKey: false });

    await api.put('/v1/settings/ai').send({ provider: 'openai', apiKey: key, enabled: true });
    const removed = await api.delete('/v1/settings/ai/key');
    expect(removed.status).toBe(200);
    expect(removed.body.ai).toMatchObject({ provider: 'openai', hasKey: false, keyLast4: null });
    expect((await api.put('/v1/settings/ai').send({ provider: 'custom', enabled: true })).status).toBe(400);
  });

  it('POST /v1/settings/ai/test checks the server provider, explicit values, and refuses when nothing is configured', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    mockLlm('OK');
    const ok = await api.post('/v1/settings/ai/test').send({});
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, provider: 'server', model: 'test-model' });

    mockLlm('', { status: 401 });
    const bad = await api.post('/v1/settings/ai/test').send({ provider: 'custom', baseUrl: 'https://llm.test/v1', model: 'm', apiKey: 'sk-wrong-key' });
    expect(bad.status).toBe(200);
    expect(bad.body).toMatchObject({ ok: false, provider: 'custom' });
    expect(bad.body.error).toMatch(/401/);

    const { app: bare } = buildTestApp({}, { LLM_BASE_URL: '', LLM_MODEL: '', LLM_API_KEY: '' });
    const none = await as(bare, user).post('/v1/settings/ai/test').send({});
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('DELETE /v1/account cascades, clears the cookie and revokes the session', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const other = await createUser();
    const source = await createSource({ scope: 'personal', ownerId: user._id, url: 'https://jobs.lever.co/gone' });
    const listing = await createListing({ sourceId: source._id });
    await Profile.create({ userId: user._id, profileHash: 'h' });
    await Match.create({ userId: user._id, listingId: listing._id, score: 50 });
    await Interaction.create({ userId: user._id, listingId: listing._id, saved: true });
    await TrackerItem.create({ userId: user._id, title: 'x', company: 'y' });
    await AlertRule.create({ userId: user._id, name: 'rule' });
    await Notification.create({ userId: user._id, kind: 'system', title: 'hi' });
    await TrackerItem.create({ userId: other._id, title: 'keep', company: 'me' });

    const res = await as(app, user).delete('/v1/account');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/beacon_session=;.*Max-Age=0/);
    for (const model of [Profile, Match, Interaction, TrackerItem, AlertRule, Notification] as const) {
      expect(await (model as typeof Profile).countDocuments({ userId: user._id })).toBe(0);
    }
    expect(await Source.countDocuments({ ownerId: user._id })).toBe(0);
    expect(await User.exists({ _id: user._id })).toBeNull();
    expect(await TrackerItem.countDocuments({ userId: other._id })).toBe(1);

    const after = await request(app).get('/v1/me').set('Cookie', cookieFor(user));
    expect(after.status).toBe(401);
    expect(after.body.error.details.reason).toBe('revoked');
  });
});
