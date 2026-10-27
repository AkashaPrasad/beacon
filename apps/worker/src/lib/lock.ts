import { randomUUID } from 'node:crypto';

import type { RedisLike } from '../redis.js';

/** Per-domain politeness lock key (shared naming with the API). */
export const domainLockKey = (host: string) => `ratelimit:domain:${host}`;

/**
 * Best-effort mutex: SET NX PX. Returns a release function, or null when held elsewhere.
 * The TTL bounds a crashed holder.
 */
export async function acquireLock(redis: RedisLike, key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
  const token = randomUUID();
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') return null;
  return async () => {
    if ((await redis.get(key)) === token) await redis.del(key);
  };
}
