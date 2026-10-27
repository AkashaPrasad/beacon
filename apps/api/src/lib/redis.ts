import { Redis } from 'ioredis';

import type { Logger } from '../logger.js';

/**
 * The subset of ioredis the API uses. Tests pass `ioredis-mock` (plus a `call` shim) through
 * the same type.
 */
export type RedisClient = Pick<
  Redis,
  'get' | 'mget' | 'incr' | 'incrby' | 'expire' | 'hincrby' | 'hgetall' | 'ping' | 'del' | 'set' | 'quit'
> & {
  call: (command: string, ...args: (string | number | Buffer)[]) => Promise<unknown>;
};

export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    connectTimeout: 5_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  let lastLog = 0;
  redis.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLog > 30_000) {
      lastLog = now;
      logger.warn({ err: err.message }, 'redis error');
    }
  });
  return redis;
}

/** Resolve within `ms` or reject; used so a dead Redis never hangs a request. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** UTC calendar day `YYYY-MM-DD` (the key suffix used by credit and LLM counters). */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export const redisKeys = {
  crawlerCredits: (day: string) => `crawler:credits:${day}`,
  crawlerSelfHosted: (day: string) => `crawler:selfhosted:${day}`,
  crawlerBackend: 'crawler:backend',
  crawlerBackendReason: 'crawler:backend:reason',
  crawlerCloudRemaining: 'crawler:cloud:remaining',
  crawlerUser: (userId: string, day: string) => `crawler:user:${userId}:${day}`,
  llmCalls: (userId: string, day: string) => `llm:calls:${userId}:${day}`,
  llmTokens: (userId: string, day: string) => `llm:tokens:${userId}:${day}`,
} as const;
