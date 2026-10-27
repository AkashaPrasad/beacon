import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGoogleVerifier, GoogleAuthError } from '../auth/google.js';
import { SESSION_COOKIE } from '../lib/jwt.js';
import { DEFAULT_RATE_LIMITS } from '../middleware/rateLimit.js';
import { Settings } from '../models/settings.js';
import { User } from '../models/user.js';
import {
  as,
  buildTestApp,
  createUser,
  identityFor,
  resetDb,
  TEST_JWT_SECRET,
  tokenFor,
} from '../test/helpers.js';

const csrf = { 'X-Requested-With': 'beacon' };

function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

describe('POST /v1/auth/google', () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());

  it('verifies an ID token, creates the user and sets the session cookie', async () => {
    const { app, google } = buildTestApp();
    const identity = google.addToken('good-token-123', { name: 'Asha Rao', email: 'Asha@Example.com' });
    const res = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'good-token-123' });
    expect(res.status).toBe(200);
    expect(res.body.isNew).toBe(true);
    expect(res.body.user).toMatchObject({ email: 'asha@example.com', name: 'Asha Rao', avatarUrl: identity.picture });
    expect(res.body.user.googleSub).toBeUndefined();
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);

    const me = await request(app).get('/v1/me').set('Cookie', cookie.split(';')[0]!);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('asha@example.com');
    expect(me.body.onboarding).toMatchObject({ step: 'consent', hasProfile: false, personalSources: 0, enabledPacks: [] });
    expect(me.body.settings).toMatchObject({ theme: 'system', aiEnabled: true, hasKey: false });
    expect(me.body.unreadNotifications).toBe(0);

    const again = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'good-token-123' });
    expect(again.body.isNew).toBe(false);
    expect(await User.countDocuments()).toBe(1);
  });

  it('sets a Secure cookie in production', async () => {
    const { app, google } = buildTestApp({}, { NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1/x' });
    google.addToken('prod-token-1234');
    const res = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'prod-token-1234' });
    expect(sessionCookie(res)).toMatch(/Secure/i);
  });

  it('accepts the redirect auth-code flow with an allowed redirectUri', async () => {
    const { app, google } = buildTestApp();
    google.codes.set('auth-code-1', identityFor({ email: 'code@example.com' }));
    const res = await request(app)
      .post('/v1/auth/google')
      .set(csrf)
      .send({ code: 'auth-code-1', redirectUri: 'https://beacon.test/auth/callback' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('code@example.com');
    expect(sessionCookie(res)).toBeDefined();
    const local = await request(app)
      .post('/v1/auth/google')
      .set(csrf)
      .send({ code: 'auth-code-1', redirectUri: 'http://localhost:4173/auth/callback' });
    expect(local.status).toBe(200);
  });

  it('rejects redirect URIs outside the allowlist and bad codes', async () => {
    const { app, google } = buildTestApp();
    google.codes.set('auth-code-2', identityFor());
    const evil = await request(app)
      .post('/v1/auth/google')
      .set(csrf)
      .send({ code: 'auth-code-2', redirectUri: 'https://evil.example/auth/callback' });
    expect(evil.status).toBe(400);
    expect(evil.body.error.details.allowed).toContain('https://beacon.test/auth/callback');
    const bad = await request(app)
      .post('/v1/auth/google')
      .set(csrf)
      .send({ code: 'nope-code', redirectUri: 'https://beacon.test/auth/callback' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('rejects invalid tokens, unverified emails and bad bodies', async () => {
    const { app, google } = buildTestApp();
    const invalid = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'forged-token-xyz' });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_GOOGLE_TOKEN');
    google.addToken('unverified-token', { emailVerified: false });
    const unverified = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'unverified-token' });
    expect(unverified.status).toBe(401);
    const validation = await request(app).post('/v1/auth/google').set(csrf).send({ token: 1 });
    expect(validation.status).toBe(400);
    expect(validation.body.error.code).toBe('VALIDATION');
    expect(validation.body.error.issues.length).toBeGreaterThan(0);
    const noCsrf = await request(app).post('/v1/auth/google').send({ credential: 'forged-token-xyz' });
    expect(noCsrf.status).toBe(403);
  });

  it('rate-limits sign-in attempts per IP', async () => {
    const { app } = buildTestApp({ rateLimits: { ...DEFAULT_RATE_LIMITS, auth: { windowMs: 60_000, limit: 2 } } });
    for (let i = 0; i < 2; i += 1) {
      expect((await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'bad-token-000' })).status).toBe(401);
    }
    const limited = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'bad-token-000' });
    expect(limited.status).toBe(429);
  });

  it('uses OAuth2Client.verifyIdToken with the configured audience', async () => {
    const spy = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(((opts: { idToken: string; audience: string }) => {
      expect(opts.audience).toBe('client-123');
      if (opts.idToken !== 'real-looking') return Promise.reject(new Error('Wrong number of segments'));
      return Promise.resolve({
        getPayload: () => ({ sub: 'g-1', email: 'g@example.com', email_verified: true, name: 'G', picture: 'https://x/p.png' }),
      });
    }) as never);
    const verifier = createGoogleVerifier('client-123', 'secret');
    await expect(verifier.verifyIdToken('real-looking')).resolves.toMatchObject({ sub: 'g-1', emailVerified: true });
    await expect(verifier.verifyIdToken('garbage')).rejects.toBeInstanceOf(GoogleAuthError);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('exchanges auth codes with getToken and verifies the returned id_token', async () => {
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(((opts: { code: string; redirect_uri: string }) => {
      if (opts.code !== 'good-code') return Promise.reject(new Error('invalid_grant'));
      expect(opts.redirect_uri).toBe('https://beacon.test/auth/callback');
      return Promise.resolve({ tokens: { id_token: 'id-from-code' } });
    }) as never);
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation((() =>
      Promise.resolve({ getPayload: () => ({ sub: 'g-2', email: 'c@example.com', email_verified: true }) })) as never);
    const verifier = createGoogleVerifier('client-123', 'secret');
    await expect(verifier.exchangeCode('good-code', 'https://beacon.test/auth/callback')).resolves.toMatchObject({
      sub: 'g-2',
      name: null,
    });
    await expect(verifier.exchangeCode('bad', 'https://beacon.test/auth/callback')).rejects.toBeInstanceOf(GoogleAuthError);
    await expect(createGoogleVerifier('client-123').exchangeCode('x', 'y')).rejects.toThrow(/not configured/);
    await expect(createGoogleVerifier().verifyIdToken('x')).rejects.toThrow(/not configured/);
    expect(() => createGoogleVerifier().authUrl('https://beacon.test/auth/callback')).toThrow(/not configured/);
    const url = new URL(createGoogleVerifier('client-123', 'secret').authUrl('https://beacon.test/auth/callback', 'st8'));
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('state')).toBe('st8');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('GET /v1/auth/google/url', () => {
  it('returns the authorization URL for an allowed redirect', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/v1/auth/google/url').query({ state: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.redirectUri).toBe('https://beacon.test/auth/callback');
    expect(res.body.url).toContain('state=abc');
    const bad = await request(app).get('/v1/auth/google/url').query({ redirectUri: 'https://evil.example/cb' });
    expect(bad.status).toBe(400);
  });

  it('answers 503 when Google is not configured', async () => {
    const { app } = buildTestApp({ google: createGoogleVerifier() });
    const res = await request(app).get('/v1/auth/google/url');
    expect(res.status).toBe(503);
  });
});

describe('session handling (requireAuth)', () => {
  beforeEach(resetDb);

  it('rejects missing, expired, forged and revoked sessions with 401', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const missing = await request(app).get('/v1/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.details.reason).toBe('missing');

    const expired = jwt.sign({ sv: 0 }, TEST_JWT_SECRET, {
      subject: user._id.toString(),
      issuer: 'beacon-api',
      expiresIn: -10,
    });
    const exp = await request(app).get('/v1/me').set('Cookie', `beacon_session=${expired}`);
    expect(exp.status).toBe(401);
    expect(exp.body.error.details.reason).toBe('expired');

    const forged = tokenFor(user, 'some-other-secret-that-is-long-enough-123');
    const forgedRes = await request(app).get('/v1/me').set('Authorization', `Bearer ${forged}`);
    expect(forgedRes.status).toBe(401);
    expect(forgedRes.body.error.details.reason).toBe('invalid');

    const garbage = await request(app).get('/v1/me').set('Authorization', 'Bearer not.a.jwt');
    expect(garbage.body.error.details.reason).toBe('invalid');

    const badSub = jwt.sign({ sv: 0 }, TEST_JWT_SECRET, { subject: 'not-an-id', issuer: 'beacon-api' });
    expect((await request(app).get('/v1/me').set('Authorization', `Bearer ${badSub}`)).status).toBe(401);

    const token = tokenFor(user);
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    const revoked = await request(app).get('/v1/me').set('Authorization', `Bearer ${token}`);
    expect(revoked.body.error.details.reason).toBe('revoked');
  });

  it('accepts Authorization: Bearer without the CSRF header', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await request(app).patch('/v1/me').set('Authorization', `Bearer ${tokenFor(user)}`).send({ name: 'Bearer User' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Bearer User');
  });

  it('logout clears the cookie', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/v1/auth/logout').set(csrf);
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('PATCH /v1/me', () => {
  beforeEach(resetDb);

  it('updates onboarding and syncs consent into settings', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const step = await api.patch('/v1/me').send({ onboardingStep: 'resume' });
    expect(step.body.onboarding.step).toBe('resume');

    const consent = await api.patch('/v1/me').send({ consent: { version: '2026-10', aiMode: 'beacon', resumeToAi: true } });
    expect(consent.status).toBe(200);
    expect(consent.body.onboarding.consent).toMatchObject({ version: '2026-10', aiMode: 'beacon', resumeToAi: true });
    expect(consent.body.settings.consentGivenAt).not.toBeNull();
    const settings = await Settings.findOne({ userId: user._id }).lean();
    expect(settings?.privacy.sendResumeToAi).toBe(true);
    expect(settings?.ai.enabled).toBe(true);

    const off = await api.patch('/v1/me').send({ consent: { version: '2026-10', aiMode: 'off', resumeToAi: false } });
    expect(off.body.settings.aiEnabled).toBe(false);
    expect(off.body.settings.consentGivenAt).toBeNull();

    const done = await api.patch('/v1/me').send({ onboardingCompleted: true });
    expect(done.body.onboarding.step).toBe('done');
    expect(done.body.onboarding.completedAt).not.toBeNull();

    const invalid = await api.patch('/v1/me').send({ onboardingStep: 'nope' });
    expect(invalid.status).toBe(400);
    const extra = await api.patch('/v1/me').send({ role: 'admin' });
    expect(extra.status).toBe(400);
  });
});
