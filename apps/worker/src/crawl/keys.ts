import { utcDay } from '../lib/dates.js';

/**
 * Redis keys for the crawler. Shared with the API (credit meter in the UI). Days are UTC
 * calendar days ("2026-10-27").
 */
export const CRAWLER_KEYS = {
  /** `cloud | selfhosted`; absent = cloud. Set to selfhosted with a 6 h TTL. */
  backend: 'crawler:backend',
  /** Why the backend flipped (402, cap, low remaining), same TTL as `backend`. */
  backendReason: 'crawler:backend:reason',
  /** Cloud credits used today (all users). */
  credits: (day: string = utcDay()) => `crawler:credits:${day}`,
  /** Self-hosted scrape calls today (0 cloud credits each). */
  selfhosted: (day: string = utcDay()) => `crawler:selfhosted:${day}`,
  /** One user's crawl usage today (cloud credits + self-hosted calls). */
  user: (userId: string, day: string = utcDay()) => `crawler:user:${userId}:${day}`,
  /** Epoch ms of the last standby use; drives the idle stop. */
  standbyLastUsed: 'crawler:standby:lastUsed',
  /** Last `/v2/team/credit-usage` result and when it was checked (hourly). */
  cloudRemaining: 'crawler:cloud:remaining',
  cloudRemainingCheckedAt: 'crawler:cloud:remainingCheckedAt',
  /** robots.txt cache per host (24 h). */
  robots: (host: string) => `crawler:robots:${host}`,
} as const;

export const SELFHOSTED_TTL_SECONDS = 6 * 3600;
/** Meter keys live 3 days so the UI can show yesterday's usage. */
export const METER_TTL_SECONDS = 3 * 24 * 3600;
