import {
  DescribeInstancesCommand,
  type DescribeInstancesCommandOutput,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';

import { SourceError } from '../lib/errors.js';
import { sleep as realSleep } from '../lib/http.js';
import type { Logger } from '../logger.js';
import { nullLogger } from '../logger.js';
import type { RedisLike } from '../redis.js';

import { CRAWLER_KEYS } from './keys.js';

/** Structural EC2 client (the real `EC2Client` or a test double). */
export interface Ec2Like {
  send(command: DescribeInstancesCommand | StartInstancesCommand | StopInstancesCommand): Promise<unknown>;
}

export interface StandbyOptions {
  ec2: Ec2Like | null;
  instanceId: string | null | undefined;
  baseUrl: string | null | undefined;
  redis: RedisLike;
  idleMinutes: number;
  logger?: Logger;
  /** Max time from "stopped" to a successful readiness scrape (default 4 min). */
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export type StandbyIdleAction = 'unavailable' | 'not-running' | 'in-use' | 'stopped';

/**
 * The self-hosted Firecrawl lives on an EC2 instance that is normally STOPPED.
 * `ensureReady()` starts it (if needed), waits for `running`, then polls the API until a
 * real scrape of example.com succeeds. `stopIfIdle()` (every 5 min) stops it again after
 * `idleMinutes` without use.
 */
export class StandbyManager {
  private readonly logger: Logger;
  private readonly readyTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private pending: Promise<void> | null = null;
  private readyUntil = 0;

  constructor(private readonly opts: StandbyOptions) {
    this.logger = opts.logger ?? nullLogger;
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 4 * 60_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 5_000;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Both an instance id and a URL are configured. Otherwise the selfhosted backend is "unavailable". */
  get available(): boolean {
    return Boolean(this.opts.ec2 && this.opts.instanceId && this.opts.baseUrl);
  }

  get baseUrl(): string {
    return (this.opts.baseUrl ?? '').replace(/\/$/, '');
  }

  async state(): Promise<string> {
    if (!this.opts.ec2 || !this.opts.instanceId) return 'unavailable';
    const out = (await this.opts.ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [this.opts.instanceId] }),
    )) as DescribeInstancesCommandOutput;
    return out.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? 'unknown';
  }

  /** Records a use; the idle timer counts from here. */
  async touch(): Promise<void> {
    await this.opts.redis.set(CRAWLER_KEYS.standbyLastUsed, String(this.now()));
  }

  async lastUsed(): Promise<number | null> {
    const v = await this.opts.redis.get(CRAWLER_KEYS.standbyLastUsed);
    return v ? Number(v) : null;
  }

  /** Start (if needed) and wait until the API answers a real scrape. Concurrent callers share one wait. */
  async ensureReady(): Promise<void> {
    if (!this.available) throw new SourceError('credits', 'Self-hosted crawler is not configured');
    if (this.now() < this.readyUntil) return;
    this.pending ??= this.bringUp().finally(() => {
      this.pending = null;
    });
    await this.pending;
  }

  private async bringUp(): Promise<void> {
    const ec2 = this.opts.ec2 as Ec2Like;
    const instanceId = this.opts.instanceId as string;
    const deadline = this.now() + this.readyTimeoutMs;
    const started = this.now();
    let state = await this.state();
    // A stopping instance cannot be started until it is stopped.
    while (state === 'stopping' || state === 'pending' || state === 'shutting-down') {
      if (state === 'shutting-down') throw new SourceError('network', 'Standby instance is terminating');
      if (state === 'pending') break;
      if (this.now() > deadline) throw new SourceError('network', 'Standby stuck in "stopping"');
      await this.sleep(this.pollIntervalMs);
      state = await this.state();
    }
    if (state === 'stopped') {
      this.logger.info({ instanceId }, 'starting firecrawl standby');
      await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      await this.touch();
    }
    while (state !== 'running') {
      if (this.now() > deadline) throw new SourceError('network', `Standby did not reach "running" in ${this.readyTimeoutMs} ms`);
      await this.sleep(this.pollIntervalMs);
      state = await this.state();
    }
    while (!(await this.probe())) {
      if (this.now() > deadline) throw new SourceError('network', `Standby API not ready after ${this.readyTimeoutMs} ms`);
      await this.sleep(this.pollIntervalMs);
    }
    this.readyUntil = this.now() + 60_000;
    this.logger.info({ instanceId, ms: this.now() - started }, 'firecrawl standby ready');
  }

  /** Readiness = heartbeat OK and a real `/v1/scrape` of example.com returns 200. */
  private async probe(): Promise<boolean> {
    try {
      const health = await this.fetchImpl(`${this.baseUrl}/v0/health/readiness`, { signal: AbortSignal.timeout(5_000) });
      if (!health.ok) return false;
      const res = await this.fetchImpl(`${this.baseUrl}/v1/scrape`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'] }),
        signal: AbortSignal.timeout(30_000),
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /** Stops the instance when it has been idle longer than `idleMinutes`. */
  async stopIfIdle(): Promise<StandbyIdleAction> {
    if (!this.available) return 'unavailable';
    const state = await this.state();
    if (state !== 'running') return 'not-running';
    const last = (await this.lastUsed()) ?? 0;
    if (this.now() - last < this.opts.idleMinutes * 60_000) return 'in-use';
    this.logger.info({ instanceId: this.opts.instanceId, idleMs: this.now() - last }, 'stopping idle firecrawl standby');
    await (this.opts.ec2 as Ec2Like).send(new StopInstancesCommand({ InstanceIds: [this.opts.instanceId as string] }));
    this.readyUntil = 0;
    return 'stopped';
  }
}
