import { SourceError } from '../lib/errors.js';
import type { Logger } from '../logger.js';
import { nullLogger } from '../logger.js';
import type { RedisLike } from '../redis.js';

import {
  type CrawlBackend,
  estimateCredits,
  type FirecrawlHttpBackend,
  PaymentRequiredError,
  type ScrapeData,
  type ScrapeFormat,
} from './backend.js';
import { CRAWLER_KEYS } from './keys.js';
import type { CreditMeter, CrawlerBackendName } from './meter.js';
import type { RobotsChecker } from './robots.js';
import type { StandbyManager } from './standby.js';

export interface ScrapeOptions {
  formats: ScrapeFormat[];
  /** Owner of a personal source (per-user cap); null for community sources. */
  userId?: string | null;
  onlyMainContent?: boolean;
  /** Skip the robots.txt check (only for the explicit smoke test). */
  ignoreRobots?: boolean;
}

export interface ScrapeOutcome {
  data: ScrapeData;
  backend: CrawlerBackendName;
  /** Cloud credits charged (0 on the standby). */
  creditsUsed: number;
  /** True when a JSON format was requested but dropped (standby has no LLM). */
  jsonDropped: boolean;
}

export interface CrawlerClientOptions {
  cloud: (CrawlBackend & Pick<FirecrawlHttpBackend, 'remainingCredits'>) | null;
  selfhosted: CrawlBackend | null;
  standby: StandbyManager | null;
  meter: CreditMeter;
  redis: RedisLike;
  robots?: RobotsChecker | null;
  logger?: Logger;
  now?: () => number;
  /** How often to ask the cloud for remaining credits (default 1 h). */
  creditCheckIntervalMs?: number;
  /** Switch to the standby below this many remaining cloud credits (default 20). */
  minRemainingCredits?: number;
}

const PAUSED = 'Crawl credits for today are used up and the self-hosted crawler is unavailable; this source resumes automatically';

/**
 * One `scrape()` for every crawl, BRIEF decision 3:
 * cloud first (daily + per-user cap, hourly remaining-credits check), then the
 * self-hosted standby for 6 h after a 402 / cap / low balance. With no standby
 * configured the call fails with `SourceError('credits')` → source `paused:credits`.
 */
export class CrawlerClient {
  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly creditCheckIntervalMs: number;
  private readonly minRemainingCredits: number;

  constructor(private readonly opts: CrawlerClientOptions) {
    this.logger = opts.logger ?? nullLogger;
    this.now = opts.now ?? Date.now;
    this.creditCheckIntervalMs = opts.creditCheckIntervalMs ?? 3_600_000;
    this.minRemainingCredits = opts.minRemainingCredits ?? 20;
  }

  get selfhostedAvailable(): boolean {
    return Boolean(this.opts.selfhosted && this.opts.standby?.available);
  }

  get cloudConfigured(): boolean {
    return Boolean(this.opts.cloud);
  }

  /** Hourly `/v2/team/credit-usage`; flips to the standby when the balance is low. */
  async checkCloudBalance(force = false): Promise<number | null> {
    const cloud = this.opts.cloud;
    if (!cloud) return null;
    const last = Number((await this.opts.redis.get(CRAWLER_KEYS.cloudRemainingCheckedAt)) ?? 0);
    if (!force && this.now() - last < this.creditCheckIntervalMs) {
      const cached = await this.opts.redis.get(CRAWLER_KEYS.cloudRemaining);
      return cached === null ? null : Number(cached);
    }
    await this.opts.redis.set(CRAWLER_KEYS.cloudRemainingCheckedAt, String(this.now()));
    let remaining: number | null = null;
    try {
      remaining = await cloud.remainingCredits();
    } catch (err) {
      this.logger.warn({ err }, 'firecrawl credit-usage check failed');
      return null;
    }
    if (remaining === null) return null;
    await this.opts.redis.set(CRAWLER_KEYS.cloudRemaining, String(remaining));
    if (remaining < this.minRemainingCredits) {
      this.logger.warn({ remaining }, 'firecrawl cloud balance low; switching to self-hosted for 6 h');
      await this.opts.meter.switchToSelfhosted(`low_balance:${remaining}`);
    }
    return remaining;
  }

  async scrape(url: string, options: ScrapeOptions): Promise<ScrapeOutcome> {
    if (!options.ignoreRobots && this.opts.robots && !(await this.opts.robots.isAllowed(url))) {
      throw new SourceError('blocked', `robots.txt disallows crawling ${new URL(url).pathname}`, { url });
    }
    const userId = options.userId ?? null;
    let backend = await this.opts.meter.backend();
    if (backend === 'cloud' && this.opts.cloud) {
      await this.checkCloudBalance();
      backend = await this.opts.meter.backend();
    }
    if (backend === 'cloud' && this.opts.cloud) {
      const outcome = await this.tryCloud(url, options, userId);
      if (outcome) return outcome;
    }
    return this.viaSelfhosted(url, options, userId);
  }

  /** Returns null when the call must fall through to the standby. */
  private async tryCloud(url: string, options: ScrapeOptions, userId: string | null): Promise<ScrapeOutcome | null> {
    const cloud = this.opts.cloud as CrawlBackend;
    const estimate = estimateCredits(options.formats);
    const reserved = await this.opts.meter.reserveCloud(estimate, userId);
    if (!reserved.ok) {
      if (reserved.reason === 'user_cap') {
        throw new SourceError('credits', "You've used today's crawl budget for personal sources; it resets at 00:00 UTC");
      }
      this.logger.warn('firecrawl daily credit cap reached; switching to self-hosted for 6 h');
      await this.opts.meter.switchToSelfhosted('daily_cap');
      return null;
    }
    try {
      const data = await cloud.scrape({ url, formats: options.formats, onlyMainContent: options.onlyMainContent ?? true });
      const actual = typeof data.metadata?.creditsUsed === 'number' ? data.metadata.creditsUsed : estimate;
      await this.opts.meter.adjustCloud(actual - estimate, userId);
      return { data, backend: 'cloud', creditsUsed: actual, jsonDropped: false };
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        await this.opts.meter.adjustCloud(-estimate, userId);
        this.logger.warn('firecrawl cloud returned 402; switching to self-hosted for 6 h');
        await this.opts.meter.switchToSelfhosted('payment_required');
        return null;
      }
      // Failed requests are not billed by Firecrawl; release the reservation.
      await this.opts.meter.adjustCloud(-estimate, userId);
      throw err;
    }
  }

  private async viaSelfhosted(url: string, options: ScrapeOptions, userId: string | null): Promise<ScrapeOutcome> {
    const standby = this.opts.standby;
    const selfhosted = this.opts.selfhosted;
    if (!selfhosted || !standby?.available) throw new SourceError('credits', PAUSED);
    const reserved = await this.opts.meter.reserveSelfhosted(userId);
    if (!reserved.ok) throw new SourceError('credits', "You've used today's crawl budget for personal sources; it resets at 00:00 UTC");
    await standby.ensureReady();
    // The standby has no LLM provider: markdown/html/links only; callers extract themselves.
    const formats = options.formats.filter((f) => typeof f === 'string');
    const jsonDropped = formats.length !== options.formats.length;
    if (!formats.includes('markdown')) formats.push('markdown');
    try {
      const data = await selfhosted.scrape({ url, formats, onlyMainContent: options.onlyMainContent ?? true });
      return { data, backend: 'selfhosted', creditsUsed: 0, jsonDropped };
    } finally {
      await standby.touch();
    }
  }
}
