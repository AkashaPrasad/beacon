import { createHash, randomBytes, randomInt } from 'node:crypto';

import type { Express } from 'express';
import RedisMock from 'ioredis-mock';
import mongoose, { Types } from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';

import { createApp } from '../app.js';
import { GoogleAuthError, type GoogleIdentity, type GoogleVerifier } from '../auth/google.js';
import { createContext, type AppContext } from '../context.js';
import { loadEnv, type Env } from '../env.js';
import { signSession } from '../lib/jwt.js';
import { RecordingQueue } from '../lib/queues.js';
import type { RedisClient } from '../lib/redis.js';
import { ALL_MODELS } from '../models/index.js';
import { Listing, type ListingDoc } from '../models/listing.js';
import { Source, type SourceDoc } from '../models/source.js';
import { User, type UserDoc } from '../models/user.js';

export const TEST_ENCRYPTION_KEY = 'a'.repeat(64);
export const TEST_JWT_SECRET = 'test-jwt-secret-'.padEnd(48, 'x');

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET: TEST_JWT_SECRET,
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    WEB_URL: 'https://beacon.test',
    API_URL: 'https://api.beacon.test',
    VAPID_PUBLIC_KEY: 'BTestVapidPublicKey',
    LLM_BASE_URL: 'https://llm.test/v1',
    LLM_MODEL: 'test-model',
    LLM_API_KEY: 'sk-test-server-key',
    FIRECRAWL_DAILY_CREDIT_CAP: '500',
    VECTOR_SEARCH: 'memory',
    ...overrides,
  });
}

/** ioredis-mock plus a `call` shim (SCRIPT LOAD / EVALSHA) so rate-limit-redis works. */
export function createTestRedis(): RedisClient & { flushall: () => Promise<unknown> } {
  // ioredis-mock shares data per host:port, so every instance gets its own port.
  const mock = new RedisMock({ port: randomInt(10_000, 60_000) }) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const scripts = new Map<string, string>();
  mock['call'] = async (command: unknown, ...args: unknown[]) => {
    const cmd = String(command).toUpperCase();
    if (cmd === 'SCRIPT' && String(args[0]).toUpperCase() === 'LOAD') {
      const sha = createHash('sha1').update(String(args[1])).digest('hex');
      scripts.set(sha, String(args[1]));
      return sha;
    }
    if (cmd === 'EVALSHA') {
      const [sha, ...rest] = args;
      return mock['eval']!(scripts.get(String(sha)), ...rest);
    }
    return mock[cmd.toLowerCase()]!(...args);
  };
  return mock as unknown as RedisClient & { flushall: () => Promise<unknown> };
}

export class FakeGoogle implements GoogleVerifier {
  readonly tokens = new Map<string, GoogleIdentity>();
  readonly codes = new Map<string, GoogleIdentity>();

  addToken(token: string, identity: Partial<GoogleIdentity> = {}): GoogleIdentity {
    const full = identityFor(identity);
    this.tokens.set(token, full);
    return full;
  }

  verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    const identity = this.tokens.get(idToken);
    return identity ? Promise.resolve(identity) : Promise.reject(new GoogleAuthError('Invalid token'));
  }

  exchangeCode(code: string): Promise<GoogleIdentity> {
    const identity = this.codes.get(code);
    return identity ? Promise.resolve(identity) : Promise.reject(new GoogleAuthError('invalid_grant'));
  }

  authUrl(redirectUri: string, state?: string): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state ?? ''}`;
  }
}

export function identityFor(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  const sub = overrides.sub ?? randomBytes(8).toString('hex');
  return {
    sub,
    email: `${sub}@example.com`,
    emailVerified: true,
    name: 'Test Student',
    picture: 'https://lh3.googleusercontent.com/a/test',
    ...overrides,
  };
}

export interface TestApp {
  app: Express;
  ctx: AppContext;
  queue: RecordingQueue;
  redis: ReturnType<typeof createTestRedis>;
  google: FakeGoogle;
}

export function buildTestApp(overrides: Partial<AppContext> = {}, envOverrides: Record<string, string> = {}): TestApp {
  const redis = createTestRedis();
  const queue = new RecordingQueue();
  const google = new FakeGoogle();
  const ctx = createContext({
    env: testEnv(envOverrides),
    logger: pino({ level: 'silent' }),
    redis,
    queue,
    google,
    readiness: () => Promise.resolve({ mongo: true, redis: true }),
    llmRetryDelaysMs: [1, 1],
    ...overrides,
  });
  return { app: createApp(ctx), ctx, queue, redis, google };
}

export async function resetDb(): Promise<void> {
  await Promise.all(ALL_MODELS.map((m) => (m as unknown as typeof User).deleteMany({})));
}

export async function createUser(overrides: Partial<UserDoc> = {}): Promise<UserDoc> {
  const sub = randomBytes(6).toString('hex');
  const doc = await User.create({ email: `${sub}@example.com`, name: 'Student', googleSub: sub, ...overrides });
  return doc.toObject() as UserDoc;
}

export function tokenFor(user: Pick<UserDoc, '_id' | 'sessionVersion'>, secret = TEST_JWT_SECRET, ttl?: number): string {
  return signSession({ sub: user._id.toString(), sv: user.sessionVersion ?? 0 }, secret, ttl);
}

export function cookieFor(user: Pick<UserDoc, '_id' | 'sessionVersion'>): string {
  return `beacon_session=${tokenFor(user)}`;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Supertest bound to a user session (cookie + CSRF header). */
export function as(app: Express, user: Pick<UserDoc, '_id' | 'sessionVersion'>) {
  const cookie = cookieFor(user);
  const call = (method: Method, path: string) =>
    request(app)[method](path).set('Cookie', cookie).set('X-Requested-With', 'beacon');
  return {
    get: (path: string) => call('get', path),
    post: (path: string) => call('post', path),
    put: (path: string) => call('put', path),
    patch: (path: string) => call('patch', path),
    delete: (path: string) => call('delete', path),
  };
}

export async function createSource(overrides: Partial<SourceDoc> = {}): Promise<SourceDoc> {
  const doc = await Source.create({
    url: `https://jobs.example.com/${randomBytes(4).toString('hex')}`,
    name: 'Example Careers',
    kind: 'greenhouse',
    scope: 'community',
    ownerId: null,
    ...overrides,
  });
  return doc.toObject() as SourceDoc;
}

let listingSeq = 0;
export async function createListing(overrides: Partial<ListingDoc> = {}): Promise<ListingDoc> {
  listingSeq += 1;
  const now = new Date();
  const doc = await Listing.create({
    type: 'internship',
    title: `Software Engineering Intern ${listingSeq}`,
    company: 'Acme',
    location: ['Bengaluru, India'],
    remote: 'hybrid',
    country: 'IN',
    applyUrl: `https://jobs.example.com/apply/${listingSeq}`,
    sourceId: new Types.ObjectId(),
    canonicalKey: `acme|swe intern ${listingSeq}|bengaluru-${randomBytes(3).toString('hex')}`,
    contentHash: randomBytes(32).toString('hex'),
    firstSeenAt: now,
    lastSeenAt: now,
    postedAt: now,
    skillsRequired: ['React', 'Node.js'],
    skillsNice: ['TypeScript'],
    descriptionMd: '## About\nBuild things with **React**.',
    ...overrides,
  });
  return doc.toObject() as ListingDoc;
}

export function db() {
  return mongoose.connection;
}
