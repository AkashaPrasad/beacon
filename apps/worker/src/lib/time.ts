import type { QuietHours } from '@kestrel/shared';
import { DateTime } from 'luxon';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Local wall-clock parts in an IANA zone. */
export function localParts(at: Date, timeZone: string): { date: string; hour: number; minute: number; weekday: number } {
  const dt = DateTime.fromJSDate(at, { zone: timeZone });
  const zoned = dt.isValid ? dt : DateTime.fromJSDate(at, { zone: 'Asia/Kolkata' });
  // luxon weekday: 1 = Monday … 7 = Sunday; the shared schema uses 0 = Sunday.
  return { date: zoned.toISODate() ?? '', hour: zoned.hour, minute: zoned.minute, weekday: zoned.weekday % 7 };
}

/** True when `at` falls inside the quiet window (which may wrap midnight, e.g. 22:00 → 07:00). */
export function inQuietHours(at: Date, quiet: QuietHours | null | undefined, timeZone: string): boolean {
  if (!quiet) return false;
  const { hour, minute } = localParts(at, timeZone);
  const now = hour * 60 + minute;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** When the current quiet window ends (the next `end` wall-clock time in the zone). */
export function quietHoursEnd(at: Date, quiet: QuietHours, timeZone: string): Date {
  const [h, m] = quiet.end.split(':').map(Number);
  let dt = DateTime.fromJSDate(at, { zone: timeZone }).set({ hour: h ?? 0, minute: m ?? 0, second: 0, millisecond: 0 });
  if (dt.toJSDate() <= at) dt = dt.plus({ days: 1 });
  return dt.toJSDate();
}

/** "HH:mm" matches the current local hour (digests run on an hourly tick). */
export function isLocalHour(at: Date, hhmm: string, timeZone: string): boolean {
  return localParts(at, timeZone).hour === Math.floor(toMinutes(hhmm) / 60);
}
