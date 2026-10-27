import { randomBytes } from 'node:crypto';

import mongoose from 'mongoose';

import { createGoogleVerifier, type GoogleVerifier } from './auth/google.js';
import type { Env } from './env.js';
import type { FetchLike } from './lib/http.js';
import { RecordingQueue, type JobQueue } from './lib/queues.js';
import { withTimeout, type RedisClient } from './lib/redis.js';
import type { Logger } from './logger.js';
import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from './middleware/rateLimit.js';

export interface Readiness {
  mongo: boolean;
  redis: boolean;
}

/** Everything a request handler may need. Built once by `createContext`. */
export interface AppContext {
  env: Env;
  logger: Logger;
  redis: RedisClient;
  queue: JobQueue;
  google: GoogleVerifier;
  fetch: FetchLike;
  now: () => Date;
  readiness: () => Promise<Readiness>;
  jwtSecret: string;
  encryptionKey: string;
  rateLimits: RateLimitConfig;
  /** Delays between LLM attempts (length = retries). */
  llmRetryDelaysMs: number[];
  /** Resolve DNS for user-supplied URLs and refuse private addresses. */
  resolveDns: boolean;
  /** bcrypt cost for password hashes. */
  passwordCost: number;
}

export type ContextInput = Pick<AppContext, 'env' | 'logger' | 'redis'> & Partial<AppContext>;

async function defaultReadiness(redis: RedisClient): Promise<Readiness> {
  const mongoOk = async () => {
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) return false;
    const db = mongoose.connection.db;
    if (!db) return false;
    await withTimeout(db.admin().ping(), 2_000, 'mongo ping');
    return true;
  };
  const [mongo, redisPing] = await Promise.allSettled([
    mongoOk(),
    withTimeout(redis.ping(), 2_000, 'redis ping'),
  ]);
  return {
    mongo: mongo.status === 'fulfilled' && mongo.value,
    redis: redisPing.status === 'fulfilled' && redisPing.value === 'PONG',
  };
}

export function createContext(rawInput: ContextInput): AppContext {
  // Ignore explicit `undefined` overrides so defaults still apply.
  const input = Object.fromEntries(
    Object.entries(rawInput).filter(([, value]) => value !== undefined),
  ) as ContextInput;
  const { env, logger, redis } = input;
  const ephemeral = (what: string) => {
    logger.warn(`${what} not set; using an ephemeral random value (sessions/keys reset on restart)`);
    return randomBytes(32).toString('hex');
  };
  return {
    queue: new RecordingQueue(),
    google: createGoogleVerifier(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    fetch: (...args) => fetch(...args),
    now: () => new Date(),
    readiness: () => defaultReadiness(redis),
    jwtSecret: input.jwtSecret ?? env.JWT_SECRET ?? ephemeral('JWT_SECRET'),
    encryptionKey: input.encryptionKey ?? env.ENCRYPTION_KEY ?? ephemeral('ENCRYPTION_KEY'),
    rateLimits: DEFAULT_RATE_LIMITS,
    llmRetryDelaysMs: [1_000, 3_000],
    resolveDns: env.NODE_ENV !== 'test',
    passwordCost: env.PASSWORD_HASH_COST,
    ...input,
  };
}
