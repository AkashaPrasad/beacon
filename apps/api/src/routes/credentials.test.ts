import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../lib/jwt.js';
import { hashPassword } from '../lib/password.js';
import { DEFAULT_RATE_LIMITS } from '../middleware/rateLimit.js';
import { migrateIndexes } from '../models/index.js';
import { User } from '../models/user.js';
import { seedAdmin } from '../services/admin.js';
import { as, buildTestApp, createListing, createSource, createUser, resetDb, tokenFor } from '../test/helpers.js';

const csrf = { 'X-Requested-With': 'beacon' };
const fast = { passwordCost: 4 };

function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];
}

describe('email + password auth', () => {
  beforeEach(resetDb);

  it('register → cookie → /v1/me, then login with the same credentials', async () => {
    const { app } = buildTestApp(fast);
    const reg = await request(app)
      .post('/v1/auth/register')
      .set(csrf)
      .send({ email: ' Asha@Example.com ', password: 'correct horse', name: 'Asha' });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ isNew: true, user: { email: 'asha@example.com', role: 'user', authMethods: { google: false, password: true } } });
    expect(reg.body.user.passwordHash).toBeUndefined();
    const me = await request(app).get('/v1/me').set('Cookie', sessionCookie(reg)!);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'asha@example.com', role: 'user' });

    const stored = await User.findOne({ email: 'asha@example.com' }).lean();
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$04\$/);

    const login = await request(app).post('/v1/auth/login').set(csrf).send({ email: 'ASHA@example.com', password: 'correct horse' });
    expect(login.status).toBe(200);
    expect(login.body.isNew).toBe(false);
    expect(sessionCookie(login)).toBeDefined();
  });

  it('validation, duplicate email and generic invalid-credential errors', async () => {
    const { app } = buildTestApp(fast);
    const short = await request(app).post('/v1/auth/register').set(csrf).send({ email: 'a@b.co', password: 'short', name: 'A' });
    expect(short.status).toBe(400);
    expect(short.body.error.issues[0].path).toEqual(['password']);
    const badEmail = await request(app).post('/v1/auth/register').set(csrf).send({ email: 'nope', password: 'longenough', name: 'A' });
    expect(badEmail.status).toBe(400);
    const tooLong = await request(app).post('/v1/auth/register').set(csrf).send({ email: 'a@b.co', password: 'x'.repeat(73), name: 'A' });
    expect(tooLong.status).toBe(400);

    await request(app).post('/v1/auth/register').set(csrf).send({ email: 'dup@b.co', password: 'longenough', name: 'A' });
    const dup = await request(app).post('/v1/auth/register').set(csrf).send({ email: 'dup@b.co', password: 'longenough2', name: 'B' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reason).toBe('email_in_use');

    const wrong = await request(app).post('/v1/auth/login').set(csrf).send({ email: 'dup@b.co', password: 'wrong-password' });
    const unknown = await request(app).post('/v1/auth/login').set(csrf).send({ email: 'ghost@b.co', password: 'wrong-password' });
    await createUser({ email: 'google-only@b.co' });
    const googleOnly = await request(app).post('/v1/auth/login').set(csrf).send({ email: 'google-only@b.co', password: 'whatever1' });
    for (const res of [wrong, unknown, googleOnly]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    }
    expect((await request(app).post('/v1/auth/login').send({ email: 'dup@b.co', password: 'longenough' })).status).toBe(403);
  });

  it('rate-limits register/login per IP', async () => {
    const { app } = buildTestApp({ ...fast, rateLimits: { ...DEFAULT_RATE_LIMITS, credentials: { windowMs: 60_000, limit: 2 } } });
    for (let i = 0; i < 2; i += 1) {
      expect((await request(app).post('/v1/auth/login').set(csrf).send({ email: 'x@y.co', password: 'nope-nope' })).status).toBe(401);
    }
    expect((await request(app).post('/v1/auth/login').set(csrf).send({ email: 'x@y.co', password: 'nope-nope' })).status).toBe(429);
  });

  it('a Google account can add a password, and changing it needs the current one', async () => {
    const { app } = buildTestApp(fast);
    const user = await createUser({ email: 'g@b.co' });
    const api = as(app, user);
    const set = await api.post('/v1/auth/password').send({ password: 'first-password' });
    expect(set.status).toBe(200);
    expect(set.body.user.authMethods).toEqual({ google: true, password: true });
    // Other sessions are revoked; the response carries a fresh cookie.
    expect((await request(app).get('/v1/me').set('Authorization', `Bearer ${tokenFor(user)}`)).status).toBe(401);
    const fresh = sessionCookie(set)!;
    expect((await request(app).get('/v1/me').set('Cookie', fresh)).status).toBe(200);

    const noCurrent = await request(app).post('/v1/auth/password').set('Cookie', fresh).set(csrf).send({ password: 'second-password' });
    expect(noCurrent.status).toBe(401);
    expect(noCurrent.body.error.code).toBe('INVALID_CREDENTIALS');
    const changed = await request(app)
      .post('/v1/auth/password')
      .set('Cookie', fresh)
      .set(csrf)
      .send({ password: 'second-password', currentPassword: 'first-password' });
    expect(changed.status).toBe(200);
    expect((await request(app).post('/v1/auth/login').set(csrf).send({ email: 'g@b.co', password: 'second-password' })).status).toBe(200);
    expect((await request(app).post('/v1/auth/password').set(csrf).send({ password: 'whatever12' })).status).toBe(401);
  });

  it('Google sign-in for a password-only email takes the account over and revokes the password', async () => {
    const { app, google } = buildTestApp(fast);
    const reg = await request(app).post('/v1/auth/register').set(csrf).send({ email: 'owner@b.co', password: 'squatter-pass', name: 'X' });
    const squatterCookie = sessionCookie(reg)!;
    google.addToken('owner-token-123', { email: 'owner@b.co', sub: 'google-owner' });
    const signIn = await request(app).post('/v1/auth/google').set(csrf).send({ credential: 'owner-token-123' });
    expect(signIn.status).toBe(200);
    expect(signIn.body.isNew).toBe(false);
    expect(signIn.body.user.id).toBe(reg.body.user.id);
    expect(signIn.body.user.authMethods).toEqual({ google: true, password: false });
    expect((await request(app).get('/v1/me').set('Cookie', squatterCookie)).status).toBe(401);
    expect((await request(app).post('/v1/auth/login').set(csrf).send({ email: 'owner@b.co', password: 'squatter-pass' })).status).toBe(401);
    expect(await User.countDocuments({ email: 'owner@b.co' })).toBe(1);
  });
});

describe('admin', () => {
  beforeEach(resetDb);

  it('seeds the admin from env, promotes existing accounts and re-hashes a changed password', async () => {
    expect(await seedAdmin({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined }, 4)).toBe('skipped');
    expect(await seedAdmin({ ADMIN_EMAIL: 'Admin@Beacon.test', ADMIN_PASSWORD: 'admin-pass-1' }, 4)).toBe('created');
    expect(await seedAdmin({ ADMIN_EMAIL: 'admin@beacon.test', ADMIN_PASSWORD: 'admin-pass-1' }, 4)).toBe('unchanged');
    expect(await seedAdmin({ ADMIN_EMAIL: 'admin@beacon.test', ADMIN_PASSWORD: 'admin-pass-2' }, 4)).toBe('updated');
    const { app } = buildTestApp(fast);
    const login = await request(app).post('/v1/auth/login').set(csrf).send({ email: 'admin@beacon.test', password: 'admin-pass-2' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');

    await createUser({ email: 'owner@beacon.test' });
    expect(await seedAdmin({ ADMIN_EMAIL: 'owner@beacon.test', ADMIN_PASSWORD: 'owner-pass-1' }, 4)).toBe('promoted');
    expect((await User.findOne({ email: 'owner@beacon.test' }).lean())?.role).toBe('admin');
  });

  it('GET /v1/admin/overview: 401 signed out, 403 for users, counts for admins', async () => {
    const { app } = buildTestApp(fast);
    expect((await request(app).get('/v1/admin/overview')).status).toBe(401);
    const user = await createUser();
    const forbidden = await as(app, user).get('/v1/admin/overview');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const admin = await createUser({ role: 'admin', passwordHash: await hashPassword('admin-pass-1', 4) });
    const source = await createSource({ health: 'healthy', kind: 'lever' });
    await createListing({ sourceId: source._id, type: 'hackathon' });
    await createListing({ sourceId: source._id, archived: true });
    const res = await as(app, admin).get('/v1/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body.users).toMatchObject({ total: 2, admins: 1, withPassword: 1, withGoogle: 2 });
    expect(res.body.listings).toMatchObject({ total: 2, archived: 1, active: 1 });
    expect(res.body.listings.byType.hackathon).toBe(1);
    expect(res.body.sources.byHealth.healthy).toBe(1);
    expect(res.body.sources.byKind.lever).toBe(1);
    expect(res.body.queues.map((q: { name: string }) => q.name)).toEqual(expect.arrayContaining(['ingest', 'match', 'notify', 'dead']));
    expect(res.body.crawler).toMatchObject({ backend: 'cloud', cloudUsedToday: 0, cap: 500 });
    expect(res.body.recentRuns).toEqual([]);
    const me = await as(app, admin).get('/v1/me');
    expect(me.body.user.role).toBe('admin');
  });

  it('migrates the legacy non-partial googleSub index so password users can coexist', async () => {
    await User.collection.dropIndex('googleSub_partial_unique').catch(() => undefined);
    await User.collection.createIndex({ googleSub: 1 }, { name: 'googleSub_1', unique: true });
    expect(await migrateIndexes()).toEqual(['users.googleSub_1']);
    await User.createIndexes();
    await User.create({ email: 'a@x.co', name: 'A', googleSub: null, passwordHash: 'h1' });
    await User.create({ email: 'b@x.co', name: 'B', googleSub: null, passwordHash: 'h2' });
    expect(await User.countDocuments({ googleSub: null })).toBe(2);
    expect(await migrateIndexes()).toEqual([]);
  });
});
