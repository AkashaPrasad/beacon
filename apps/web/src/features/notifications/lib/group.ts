/** Day grouping for the notification centre, in the account's time zone (SHARED-REQUESTS qa → web #10). */
import type { Notification } from '@kestrel/shared';

/** "2026-10-27" for an instant in `timeZone`. */
export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** "Today", "Yesterday", or "Mon 26 Oct" (with the year when it isn't this year). */
export function dayLabel(key: string, now: Date, timeZone: string): string {
  const today = dayKey(now, timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), timeZone);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12));
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
    .format(date)
    .replace(',', '');
}

export interface DayGroup {
  key: string;
  label: string;
  items: Notification[];
}

/** Newest first, grouped by calendar day in `timeZone`. */
export function groupByDay(items: readonly Notification[], timeZone: string, now: Date = new Date()): DayGroup[] {
  const groups = new Map<string, Notification[]>();
  const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const n of sorted) {
    const key = dayKey(n.createdAt, timeZone);
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, label: dayLabel(key, now, timeZone), items: list }));
}

/** "14:05" in `timeZone`. */
export function timeOfDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
}

/** Where a notification leads (USERFLOW §3.4; the bell uses the same rule). */
export function targetOf(n: Pick<Notification, 'listingId' | 'trackerItemId' | 'url' | 'kind'>): string | null {
  if (n.listingId) return `/radar/${n.listingId}`;
  if (n.url) return n.url;
  if (n.trackerItemId) return '/tracker';
  if (n.kind === 'source') return '/sources';
  return null;
}
