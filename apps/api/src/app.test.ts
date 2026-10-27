import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { allowedOrigins } from './app.js';
import { DEFAULT_RATE_LIMITS } from './middleware/rateLimit.js';
import { buildTestApp, createUser, cookieFor, resetDb } from './test/helpers.js';

describe('platform routes', () => {
  beforeEach(resetDb);

  it('GET /healthz returns ok without touching dependencies', async () => {
    const { app } = buildTestApp({ readiness: () => Promise.reject(new Error('never called')) });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /readyz reflects Mongo and Redis', async () => {
    const up = buildTestApp({ readiness: () => Promise.resolve({ mongo: true, redis: true }) });
    const down = buildTestApp({ readiness: () => Promise.resolve({ mongo: true, redis: false }) });
    const ok = await request(up.app).get('/readyz');
    const bad = await request(down.app).get('/readyz');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, mongo: 'up', redis: 'up' });
    expect(bad.status).toBe(503);
    expect(bad.body).toEqual({ ok: false, mongo: 'up', redis: 'down' });
  });

  it('default readiness pings the real Mongo connection and the redis client', async () => {
    const { app } = buildTestApp({ readiness: undefined as never });
    const res = await request(app).get('/readyz');
    expect(res.body).toEqual({ ok: true, mongo: 'up', redis: 'up' });
  });

  it('GET /v1/meta lists enumerations and packs', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/v1/meta');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('beacon');
    expect(res.body.opportunityTypes).toContainEqual({ id: 'internship', label: 'Internship' });
    expect(res.body.packs.map((p: { id: string }) => p.id)).toContain('faang-plus-india');
  });

  it('unknown routes return the JSON error envelope', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('serves the OpenAPI document and the docs UI', async () => {
    const { app } = buildTestApp();
    const spec = await request(app).get('/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.info.title).toBe('Beacon API');
    expect(Object.keys(spec.body.paths)).toEqual(expect.arrayContaining(['/v1/feed', '/v1/auth/google', '/v1/tracker/{id}/move']));
    const docs = await request(app).get('/docs');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('api-reference');
    expect(docs.headers['content-security-policy']).toContain('cdn.jsdelivr.net');
  });

  it('sets security headers, request ids and CORS for the web origin only', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/v1/meta').set('Origin', 'https://beacon.test').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.headers['access-control-allow-origin']).toBe('https://beacon.test');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/v1/meta').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app)
      .options('/v1/profile')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PUT');
    expect(preflight.status).toBe(204);
    expect(allowedOrigins('https://beacon.test/')).toEqual(['https://beacon.test', 'http://localhost:5173']);
  });

  it('rejects malformed JSON and oversized bodies with the envelope', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const bad = await request(app)
      .put('/v1/profile')
      .set('Cookie', cookieFor(user))
      .set('X-Requested-With', 'beacon')
      .set('Content-Type', 'application/json')
      .send('{"oops":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
    const big = await request(app)
      .put('/v1/profile')
      .set('Cookie', cookieFor(user))
      .set('X-Requested-With', 'beacon')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ summary: 'x'.repeat(1_100_000) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('requires X-Requested-With on mutating cookie requests (CSRF)', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await request(app).put('/v1/profile').set('Cookie', cookieFor(user)).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
    const wrong = await request(app).post('/v1/auth/logout').set('X-Requested-With', 'XMLHttpRequest');
    expect(wrong.status).toBe(403);
    const legacy = await request(app).post('/v1/auth/logout').set('X-Requested-With', 'kestrel');
    expect(legacy.status).toBe(204);
  });

  it('enforces the global rate limit with 429 + Retry-After', async () => {
    const { app } = buildTestApp({ rateLimits: { ...DEFAULT_RATE_LIMITS, global: { windowMs: 60_000, limit: 3 } } });
    for (let i = 0; i < 3; i += 1) expect((await request(app).get('/v1/meta')).status).toBe(200);
    const limited = await request(app).get('/v1/meta');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['ratelimit-policy']).toBeDefined();
    // health probes are never limited
    expect((await request(app).get('/healthz')).status).toBe(200);
  });
});
