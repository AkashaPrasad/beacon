import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

import { HttpError } from '../lib/errors.js';
import type { RedisClient } from '../lib/redis.js';

export interface RateLimitSpec {
  windowMs: number;
  limit: number;
  /** keyBy 'session': the limit for requests carrying a valid session (keyed by user id). */
  userLimit?: number;
}

export type RateLimitName = 'global' | 'auth' | 'detect' | 'resume' | 'explain' | 'aitest' | 'refresh' | 'pushtest' | 'credentials';
export type RateLimitConfig = Record<RateLimitName, RateLimitSpec>;

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  // Per user when signed in (a campus NAT shares one IP), per IP otherwise.
  global: { windowMs: 15 * 60_000, limit: 300, userLimit: 1_000 },
  auth: { windowMs: 60_000, limit: 10 },
  detect: { windowMs: 60_000, limit: 20 },
  resume: { windowMs: 60_000, limit: 5 },
  explain: { windowMs: 3_600_000, limit: 30 },
  aitest: { windowMs: 3_600_000, limit: 10 },
  refresh: { windowMs: 60_000, limit: 10 },
  pushtest: { windowMs: 3_600_000, limit: 20 },
  credentials: { windowMs: 60_000, limit: 10 },
};

/**
 * Redis-backed limiter. `keyBy: 'user'` must be mounted after `requireAuth`. `keyBy: 'session'`
 * runs before auth: `sessionUserId` reads the user id from a validly signed session token (no DB
 * lookup), and such requests get `spec.userLimit` keyed by user. When Redis is unreachable the
 * request passes (`passOnStoreError`) rather than failing the API.
 */
export function createRateLimiter(
  name: RateLimitName,
  spec: RateLimitSpec,
  redis: RedisClient,
  keyBy: 'ip' | 'user' | 'session',
  sessionUserId?: (req: Request) => string | null,
): RequestHandler {
  const sessionKey = (req: Request): string | null =>
    keyBy === 'session' && sessionUserId ? sessionUserId(req) : null;
  return rateLimit({
    windowMs: spec.windowMs,
    limit: (req) => (sessionKey(req) ? (spec.userLimit ?? spec.limit) : spec.limit),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: true,
    identifier: name,
    store: new RedisStore({
      prefix: `rl:${name}:`,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    }),
    keyGenerator: (req) => {
      if (keyBy === 'user' && req.user) return `u:${req.user.id}`;
      const sub = sessionKey(req);
      return sub ? `u:${sub}` : ipKeyGenerator(req.ip ?? '0.0.0.0');
    },
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
