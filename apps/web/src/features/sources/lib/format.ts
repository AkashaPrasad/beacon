/**
 * Formatting for the workspace screens (sources, alerts, tracker). DESIGN §2 / §8 rule 7: mono numbers,
 * explicit units, ISO-like dates ("Tue 28 Oct"), Indian digit grouping, zones on absolute times.
 * Local until `@kestrel/ui` re-exports its `format` helpers (see DECISIONS, web-workspace).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatCount(n: number): string {
  return grouping.format(Math.round(n));
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "just now", "12 min ago", "3 h ago", "2d ago", "5 wk ago", "in 3d". */
export function formatRelative(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return '—';
  const diff = now.getTime() - date.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return 'just now';
  let text: string;
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)} h`;
  else if (abs < 14 * DAY) text = `${Math.round(abs / DAY)}d`;
  else if (abs < 60 * DAY) text = `${Math.round(abs / (7 * DAY))} wk`;
  else text = `${Math.round(abs / (30 * DAY))} mo`;
  return diff < 0 ? `in ${text}` : `${text} ago`;
}

/** Whole days since (floor, ≥ 0). */
export function daysSince(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY));
}

/** "Tue 28 Oct". */
export function formatShortDate(
  value: Date | string | null | undefined,
  timeZone = 'Asia/Kolkata',
): string {
  const date = toDate(value);
  if (!date) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** "28 Oct" (no weekday) for prose like "I applied … on 14 Oct". */
export function formatDayMonth(
  value: Date | string | null | undefined,
  timeZone = 'Asia/Kolkata',
): string {
  return formatShortDate(value, timeZone).replace(/^\S+\s/, '');
}

const ZONE_ABBR: Record<string, string> = {
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  UTC: 'UTC',
};

/** "Tue 28 Oct, 23:59 IST". */
export function formatAbsolute(
  value: Date | string | null | undefined,
  timeZone = 'Asia/Kolkata',
): string {
  const date = toDate(value);
  if (!date) return '—';
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
  const zone =
    ZONE_ABBR[timeZone] ??
    new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ??
    timeZone;
  return `${formatShortDate(date, timeZone)}, ${time} ${zone}`;
}

/** "10:42" (24 h) in a zone; for "Showing results from 10:42". */
export function formatTime(value: Date | string | number, timeZone = 'Asia/Kolkata'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

/** `yyyy-mm-dd` in a zone, for `<input type="date">`. */
export function toDateInputValue(
  value: Date | string | null | undefined,
  timeZone = 'Asia/Kolkata',
): string {
  const date = toDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
  return parts;
}

/** Midday IST on a `yyyy-mm-dd` string (stable across zones for date-only fields). */
export function fromDateInputValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function percent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}
