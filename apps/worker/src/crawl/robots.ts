import robotsParserModule from 'robots-parser';

import { httpRequest, USER_AGENT } from '../lib/http.js';
import type { RedisLike } from '../redis.js';
import { CRAWLER_KEYS } from './keys.js';

const ROBOTS_TTL_SECONDS = 24 * 3600;
const BOT_NAME = 'BeaconBot';

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
}
type RobotsParser = (url: string, robotstxt: string) => Robot;
// CJS `module.exports = fn`; its .d.ts declares an ES default, so normalise both shapes.
const robotsParser: RobotsParser =
  (robotsParserModule as unknown as { default?: RobotsParser }).default ?? (robotsParserModule as unknown as RobotsParser);

/** robots.txt check with a 24 h Redis cache. A missing/unreachable robots.txt allows crawling. */
export class RobotsChecker {
  constructor(private readonly redis: RedisLike) {}

  private async robotsTxt(origin: string, host: string): Promise<string> {
    const cached = await this.redis.get(CRAWLER_KEYS.robots(host));
    if (cached !== null) return cached;
    let body: string;
    try {
      const res = await httpRequest(`${origin}/robots.txt`, { timeoutMs: 5_000, maxBytes: 512 * 1024, headers: { accept: 'text/plain' } });
      body = res.text;
    } catch {
      body = '';
    }
    await this.redis.set(CRAWLER_KEYS.robots(host), body, 'EX', ROBOTS_TTL_SECONDS);
    return body;
  }

  async isAllowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const body = await this.robotsTxt(u.origin, u.host);
    if (!body.trim()) return true;
    const robots = robotsParser(`${u.origin}/robots.txt`, body);
    return robots.isAllowed(url, BOT_NAME) ?? robots.isAllowed(url, USER_AGENT) ?? true;
  }
}
