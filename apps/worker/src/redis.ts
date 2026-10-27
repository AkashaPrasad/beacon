import { Redis } from 'ioredis';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on worker connections so blocking
 * commands are not aborted while Redis restarts.
 */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

/**
 * The handful of Redis commands the crawler meter, locks and caches use. `ioredis`
 * satisfies it structurally; tests use the in-memory `MemoryRedis`.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number): Promise<unknown>;
  set(key: string, value: string | number, mode: 'EX' | 'PX', ttl: number): Promise<unknown>;
  set(key: string, value: string | number, mode: 'PX', ttl: number, nx: 'NX'): Promise<unknown>;
  incrby(key: string, by: number): Promise<number>;
  decrby(key: string, by: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  hincrby(key: string, field: string, by: number): Promise<number>;
}
