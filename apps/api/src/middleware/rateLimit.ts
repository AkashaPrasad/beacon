import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

import { HttpError } from '../lib/errors.js';
import type { RedisClient } from '../lib/redis.js';

export interface RateLimitSpec {
  windowMs: number;
  limit: number;
}

export type RateLimitName = 'global' | 'auth' | 'detect' | 'resume' | 'explain' | 'aitest';
export type RateLimitConfig = Record<RateLimitName, RateLimitSpec>;

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  global: { windowMs: 15 * 60_000, limit: 300 },
  auth: { windowMs: 60_000, limit: 10 },
  detect: { windowMs: 60_000, limit: 20 },
  resume: { windowMs: 60_000, limit: 5 },
  explain: { windowMs: 3_600_000, limit: 30 },
  aitest: { windowMs: 3_600_000, limit: 10 },
};

/**
 * Redis-backed limiter. `keyBy: 'user'` must be mounted after `requireAuth`. When Redis is
 * unreachable the request passes (`passOnStoreError`) rather than failing the API.
 */
export function createRateLimiter(
  name: RateLimitName,
  spec: RateLimitSpec,
  redis: RedisClient,
  keyBy: 'ip' | 'user',
): RequestHandler {
  return rateLimit({
    windowMs: spec.windowMs,
    limit: spec.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: true,
    identifier: name,
    store: new RedisStore({
      prefix: `rl:${name}:`,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    }),
    keyGenerator: (req) =>
      keyBy === 'user' && req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip ?? '0.0.0.0'),
    handler: (req, _res, next) => {
      const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
      const retryAfterSeconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : undefined;
      next(
        new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.', {
          limiter: name,
          retryAfterSeconds,
        }),
      );
    },
  });
}
