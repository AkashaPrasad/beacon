/**
 * Time-zone helpers for Settings > Notifications (quiet hours, digest time, absolute times everywhere:
 * SHARED-REQUESTS qa → web #10). IANA ids only; labels say the city and the current UTC offset.
 */
import { DEFAULT_TIMEZONE, isValidTimeZone } from '@kestrel/shared';

/** Zones most Beacon students pick, shown first. India first. */
export const POPULAR_TIME_ZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const;

/** Old ICU ids some browsers still report, mapped to the names people know. */
const ALIASES: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh' };

export function canonicalZone(zone: string): string {
  return ALIASES[zone] ?? zone;
}

/** The device's zone (falls back to IST). */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? canonicalZone(zone) : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** "New York" from "America/New_York"; "UTC" stays "UTC". */
export function zoneCity(zone: string): string {
  if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

/** "GMT+05:30" (the offset right now, so it follows daylight saving). */
export function zoneOffset(zone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    return !part || part === 'GMT' ? 'GMT+00:00' : part;
  } catch {
    return '';
  }
}

/** Minutes east of UTC, for sorting ("GMT+05:30" → 330). */
function offsetMinutes(label: string): number {
  const m = /GMT([+-−])(\d{2}):(\d{2})/.exec(label);
  if (!m) return 0;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

export interface ZoneOption {
  value: string;
  label: string;
  offset: number;
}

export function zoneLabel(zone: string, at: Date = new Date()): string {
  const offset = zoneOffset(zone, at).replace('-', '−');
  return offset ? `${zoneCity(zone)} · ${offset}` : zoneCity(zone);
}

function supportedZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    const list = intl.supportedValuesOf?.('timeZone');
    if (list && list.length > 0) return list;
  } catch {
    /* older engines */
  }
  return [...POPULAR_TIME_ZONES];
}

/**
 * Options for the time-zone select: popular zones first, then every zone the browser knows, grouped by
 * region and sorted by offset. `current` is always included (it may not be in the browser's list).
 */
export function timeZoneGroups(current: string, at: Date = new Date()): { label: string; options: ZoneOption[] }[] {
  const make = (zone: string): ZoneOption => {
    const offset = zoneOffset(zone, at);
    return { value: zone, label: zoneLabel(zone, at), offset: offsetMinutes(offset) };
  };
  const popular = [...new Set([canonicalZone(current), ...POPULAR_TIME_ZONES])].filter(isValidTimeZone);
  const seen = new Set(popular);
  const byRegion = new Map<string, ZoneOption[]>();
  for (const raw of supportedZones()) {
    const zone = canonicalZone(raw);
    if (seen.has(zone) || !zone.includes('/') || !isValidTimeZone(zone)) continue;
    seen.add(zone);
    const region = zone.split('/')[0] ?? 'Other';
    const list = byRegion.get(region) ?? [];
    list.push(make(zone));
    byRegion.set(region, list);
  }
  const groups = [{ label: 'Common', options: popular.map(make) }];
  for (const region of [...byRegion.keys()].sort()) {
    const options = (byRegion.get(region) ?? []).sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));
    groups.push({ label: region, options });
  }
  return groups;
}

/** "22:00" → minutes after midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Quiet-hours length in minutes (handles windows that wrap past midnight). */
export function quietLength(start: string, end: string): number {
  const a = minutesOf(start);
  const b = minutesOf(end);
  return b > a ? b - a : 24 * 60 - a + b;
}

/** "9 h" / "7 h 30 min". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
