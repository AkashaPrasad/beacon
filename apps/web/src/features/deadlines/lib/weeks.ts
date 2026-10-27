/**
 * Calendar math for the Deadline timeline (DESIGN §10.3). Everything is computed in the user's time
 * zone (default Asia/Kolkata) using civil dates, so a 23:59 IST deadline lands on the right day for
 * an IST user even when the browser clock is elsewhere, and DST never shifts a day.
 *
 * A "day key" is `YYYY-MM-DD` in that zone. Weeks start on Monday (ISO 8601).
 */

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const DAY_MS = 86_400_000;

interface CivilDate {
  year: number;
  month: number; // 1..12
  day: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function keyOf({ year, month, day }: CivilDate): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function civilFromKey(key: string): CivilDate {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

/** UTC-midnight timestamp of a civil date (pure calendar arithmetic, no zone involved). */
function civilToUtc(c: CivilDate): number {
  return Date.UTC(c.year, c.month - 1, c.day);
}

function civilFromUtc(ms: number): CivilDate {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** `YYYY-MM-DD` of `date` in `timeZone`. */
export function dayKey(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return keyOf(zonedParts(date, timeZone));
}

export function addDays(key: string, days: number): string {
  return keyOf(civilFromUtc(civilToUtc(civilFromKey(key)) + days * DAY_MS));
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((civilToUtc(civilFromKey(b)) - civilToUtc(civilFromKey(a))) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: string): number {
  return (new Date(civilToUtc(civilFromKey(key))).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/** ISO-8601 week number (W44). */
export function isoWeek(key: string): number {
  const thursday = addDays(startOfWeek(key), 3);
  const { year } = civilFromKey(thursday);
  const jan4 = keyOf({ year, month: 1, day: 4 });
  return Math.floor(diffDays(startOfWeek(jan4), thursday) / 7) + 1;
}

export function isWeekend(key: string): boolean {
  return weekdayIndex(key) >= 5;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "MON 27" header text parts. */
export function dayHeader(key: string): { weekday: string; day: number; month: string } {
  const c = civilFromKey(key);
  return {
    weekday: WEEKDAY_SHORT[weekdayIndex(key)] ?? '',
    day: c.day,
    month: MONTH_SHORT[c.month - 1] ?? '',
  };
}

/** "Tue 28 Oct". */
export function formatDayKey(key: string): string {
  const { weekday, day, month } = dayHeader(key);
  return `${weekday} ${day} ${month}`;
}

/** "27 Oct – 23 Nov". */
export function formatRange(fromKey: string, toKey: string): string {
  const a = dayHeader(fromKey);
  const b = dayHeader(toKey);
  return `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

export interface WeekRow {
  /** Monday's day key. */
  start: string;
  isoWeek: number;
  days: string[];
  /** Offset from the current week (0 = this week). */
  offset: number;
}

/** Weeks from `before` weeks ago to `after` weeks ahead of the week containing `todayKey`. */
export function buildWeeks(todayKey: string, before: number, after: number): WeekRow[] {
  const current = startOfWeek(todayKey);
  const weeks: WeekRow[] = [];
  for (let offset = -before; offset <= after; offset += 1) {
    const start = addDays(current, offset * 7);
    weeks.push({
      start,
      isoWeek: isoWeek(start),
      offset,
      days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    });
  }
  return weeks;
}

/**
 * Fraction (0..1) of the day elapsed at `now` in `timeZone`. Drives the today line's horizontal
 * position inside today's column, so 18:00 sits three quarters of the way across.
 */
export function dayProgress(now: Date, timeZone = DEFAULT_TIME_ZONE): number {
  const { hour, minute, second } = zonedParts(now, timeZone);
  return Math.min(1, Math.max(0, (hour * 3600 + minute * 60 + second) / 86_400));
}

/** "14:05" wall time in the zone (today-line label). */
export function formatClock(now: Date, timeZone = DEFAULT_TIME_ZONE): string {
  const { hour, minute } = zonedParts(now, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

export interface Datable {
  id: string;
  deadlineAt: Date | null;
}

export interface DeadlineBuckets<T extends Datable> {
  /** Day key → items due that day, soonest first. */
  byDay: Map<string, T[]>;
  /** Rolling / unknown deadlines: never placed on the grid (USERFLOW §3.3). */
  undated: T[];
}

export function bucketByDay<T extends Datable>(
  items: readonly T[],
  timeZone = DEFAULT_TIME_ZONE,
): DeadlineBuckets<T> {
  const byDay = new Map<string, T[]>();
  const undated: T[] = [];
  for (const item of items) {
    if (!item.deadlineAt || Number.isNaN(item.deadlineAt.getTime())) {
      undated.push(item);
      continue;
    }
    const key = dayKey(item.deadlineAt, timeZone);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.deadlineAt?.getTime() ?? 0) - (b.deadlineAt?.getTime() ?? 0));
  }
  return { byDay, undated };
}

/** Which week row (index into `weeks`) contains `key`; −1 when outside the window. */
export function weekIndexOf(weeks: readonly WeekRow[], key: string): number {
  return weeks.findIndex((w) => diffDays(w.start, key) >= 0 && diffDays(w.start, key) < 7);
}
