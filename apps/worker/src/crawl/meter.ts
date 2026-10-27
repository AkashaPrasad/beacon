import { utcDay } from '../lib/dates.js';
import type { RedisLike } from '../redis.js';
import { CRAWLER_KEYS, METER_TTL_SECONDS, SELFHOSTED_TTL_SECONDS } from './keys.js';

export type CrawlerBackendName = 'cloud' | 'selfhosted';

export type ReserveResult = { ok: true } | { ok: false; reason: 'global_cap' | 'user_cap' };

export interface MeterUsage {
  day: string;
  cloudCreditsUsed: number;
  dailyCap: number;
  selfhostedCalls: number;
  backend: CrawlerBackendName;
  backendReason: string | null;
  /** Seconds until the backend flag expires (−2 when cloud). */
  backendTtlSeconds: number;
}

/**
 * Daily crawl budget in Redis. Cloud credits are reserved before a call (INCRBY, rolled
 * back when over the cap) and corrected afterwards with the real `creditsUsed`.
 */
export class CreditMeter {
  constructor(
    private readonly redis: RedisLike,
    private readonly caps: { dailyCap: number; userDailyCap: number },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private day() {
    return utcDay(this.clock());
  }

  private async bump(key: string, by: number): Promise<number> {
    const next = await this.redis.incrby(key, by);
    if (next === by) await this.redis.expire(key, METER_TTL_SECONDS);
    return next;
  }

  async backend(): Promise<CrawlerBackendName> {
    return (await this.redis.get(CRAWLER_KEYS.backend)) === 'selfhosted' ? 'selfhosted' : 'cloud';
  }

  /** Route all scrapes to the standby for 6 h. */
  async switchToSelfhosted(reason: string): Promise<void> {
    await this.redis.set(CRAWLER_KEYS.backend, 'selfhosted', 'EX', SELFHOSTED_TTL_SECONDS);
    await this.redis.set(CRAWLER_KEYS.backendReason, reason, 'EX', SELFHOSTED_TTL_SECONDS);
  }

  /** Reserve cloud credits for one call; refuses (and rolls back) above the global or user cap. */
  async reserveCloud(credits: number, userId?: string | null): Promise<ReserveResult> {
    const day = this.day();
    const globalKey = CRAWLER_KEYS.credits(day);
    const used = await this.bump(globalKey, credits);
    if (used > this.caps.dailyCap) {
      await this.redis.decrby(globalKey, credits);
      return { ok: false, reason: 'global_cap' };
    }
    if (userId) {
      const userKey = CRAWLER_KEYS.user(userId, day);
      const userUsed = await this.bump(userKey, credits);
      if (userUsed > this.caps.userDailyCap) {
        await this.redis.decrby(userKey, credits);
        await this.redis.decrby(globalKey, credits);
        return { ok: false, reason: 'user_cap' };
      }
    }
    return { ok: true };
  }

  /** Correct a reservation by the difference between actual and reserved credits. */
  async adjustCloud(delta: number, userId?: string | null): Promise<void> {
    if (delta === 0) return;
    const day = this.day();
    await this.bump(CRAWLER_KEYS.credits(day), delta);
    if (userId) await this.bump(CRAWLER_KEYS.user(userId, day), delta);
  }

  /** A personal source may still use the standby when the user has budget left. */
  async reserveSelfhosted(userId?: string | null): Promise<ReserveResult> {
    const day = this.day();
    if (userId) {
      const userKey = CRAWLER_KEYS.user(userId, day);
      const userUsed = await this.bump(userKey, 1);
      if (userUsed > this.caps.userDailyCap) {
        await this.redis.decrby(userKey, 1);
        return { ok: false, reason: 'user_cap' };
      }
    }
    await this.bump(CRAWLER_KEYS.selfhosted(day), 1);
    return { ok: true };
  }

  async userUsage(userId: string): Promise<{ used: number; cap: number }> {
    const used = Number((await this.redis.get(CRAWLER_KEYS.user(userId, this.day()))) ?? 0);
    return { used, cap: this.caps.userDailyCap };
  }

  async usage(): Promise<MeterUsage> {
    const day = this.day();
    const [credits, selfhosted, backend, reason, ttl] = await Promise.all([
      this.redis.get(CRAWLER_KEYS.credits(day)),
      this.redis.get(CRAWLER_KEYS.selfhosted(day)),
      this.backend(),
      this.redis.get(CRAWLER_KEYS.backendReason),
      this.redis.ttl(CRAWLER_KEYS.backend),
    ]);
    return {
      day,
      cloudCreditsUsed: Number(credits ?? 0),
      dailyCap: this.caps.dailyCap,
      selfhostedCalls: Number(selfhosted ?? 0),
      backend,
      backendReason: backend === 'selfhosted' ? reason : null,
      backendTtlSeconds: ttl,
    };
  }
}
