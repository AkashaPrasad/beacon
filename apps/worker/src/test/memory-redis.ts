import type { RedisLike } from '../redis.js';

/** Minimal in-memory Redis with TTLs, enough for meter/lock/cache unit tests. */
export class MemoryRedis implements RedisLike {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  constructor(private readonly clock: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  set(key: string, value: string | number, mode?: 'EX' | 'PX', ttl?: number, nx?: 'NX'): Promise<unknown> {
    if (nx === 'NX' && this.live(key)) return Promise.resolve(null);
    const ms = mode === 'EX' ? (ttl ?? 0) * 1000 : mode === 'PX' ? (ttl ?? 0) : null;
    this.store.set(key, { value: String(value), expiresAt: ms === null ? null : this.clock() + ms });
    return Promise.resolve('OK');
  }

  incrby(key: string, by: number): Promise<number> {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + by;
    this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return Promise.resolve(next);
  }

  decrby(key: string, by: number): Promise<number> {
    return this.incrby(key, -by);
  }

  expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(0);
    entry.expiresAt = this.clock() + seconds * 1000;
    return Promise.resolve(1);
  }

  ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(-2);
    if (entry.expiresAt === null) return Promise.resolve(-1);
    return Promise.resolve(Math.ceil((entry.expiresAt - this.clock()) / 1000));
  }

  /** Hashes are stored as JSON strings (enough for the LLM token counters). */
  hincrby(key: string, field: string, by: number): Promise<number> {
    const entry = this.live(key);
    const hash = entry ? (JSON.parse(entry.value) as Record<string, number>) : {};
    hash[field] = (hash[field] ?? 0) + by;
    this.store.set(key, { value: JSON.stringify(hash), expiresAt: entry?.expiresAt ?? null });
    return Promise.resolve(hash[field]);
  }

  hgetall(key: string): Promise<Record<string, number>> {
    const entry = this.live(key);
    return Promise.resolve(entry ? (JSON.parse(entry.value) as Record<string, number>) : {});
  }

  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) if (this.store.delete(key)) n++;
    return Promise.resolve(n);
  }
}
