import { DAY_MS } from '@kestrel/shared';

/**
 * Workday-style relative posting dates: "Posted Today", "Posted Yesterday",
 * "Posted 14 Days Ago", "Posted 30+ Days Ago" (→ 30 days, a lower bound).
 */
export function parseRelativePosted(text: string | null | undefined, now: Date): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\btoday\b|\bjust posted\b/.test(t)) return now;
  if (/\byesterday\b/.test(t)) return new Date(now.getTime() - DAY_MS);
  const m = /(\d+)\+?\s*(day|week|month)s?\s+ago/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] === 'week' ? 7 : m[2] === 'month' ? 30 : 1;
  return new Date(now.getTime() - n * unit * DAY_MS);
}

/** UTC calendar day, used in Redis meter keys and job ids: "2026-10-27". */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** "2026-11-06 18:29:00+00:00" (space separator) → Date. */
export function parseLooseIso(text: string | null | undefined): Date | null {
  if (!text) return null;
  const d = new Date(text.trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}
