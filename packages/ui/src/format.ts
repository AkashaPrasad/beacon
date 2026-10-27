/** Formatting helpers shared by every surface (DESIGN §2 rules, §8 rule 7). Pure and SSR-safe. */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹45,000 (Indian digit grouping). */
export function formatInr(amount: number): string {
  return `₹${inr.format(Math.round(amount))}`;
}

/** ₹45k / ₹1.2L — compact form for dense rows. */
export function formatInrShort(amount: number): string {
  const a = Math.round(amount);
  if (a >= 100_000) {
    const lakhs = a / 100_000;
    return `₹${lakhs >= 10 ? Math.round(lakhs) : Number(lakhs.toFixed(1))}L`;
  }
  if (a >= 1_000) {
    const k = a / 1_000;
    return `₹${k >= 10 ? Math.round(k) : Number(k.toFixed(1))}k`;
  }
  return `₹${a}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 min ago", "3 h ago", "2d ago", "5 wk ago". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MINUTE) return 'just now';
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)} h`;
  else if (abs < 14 * DAY) text = `${Math.round(abs / DAY)}d`;
  else if (abs < 60 * DAY) text = `${Math.round(abs / (7 * DAY))} wk`;
  else text = `${Math.round(abs / (30 * DAY))} mo`;
  return future ? `in ${text}` : `${text} ago`;
}

/** "Tue 28 Oct" (DESIGN §2: ISO-like dates in mono). */
export function formatShortDate(date: Date, timeZone?: string): string {
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

const TZ_ABBR: Record<string, string> = {
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  UTC: 'UTC',
};

/** "Tue 28 Oct, 23:59 IST" — absolute time with the zone, for tooltips. */
export function formatAbsolute(date: Date, timeZone = 'Asia/Kolkata'): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
  const zone =
    TZ_ABBR[timeZone] ??
    new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ??
    timeZone;
  return `${formatShortDate(date, timeZone)}, ${time} ${zone}`;
}
