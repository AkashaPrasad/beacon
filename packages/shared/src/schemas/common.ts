import { z } from 'zod';

import { DEFAULT_TIMEZONE, OPPORTUNITY_TYPES, PAY_PERIODS, REMOTE_MODES } from '../constants';

/** Opaque string id (Mongo ObjectId hex in practice; kept generic for fixtures/tests). */
export const idSchema = z.string().trim().min(1).max(64);

/** 24-char hex Mongo ObjectId. */
export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Expected a 24-character ObjectId');

/** Accepts a Date or an ISO string (JSON transport) and outputs a Date. */
export const dateSchema = z.coerce.date();

/** ISO 3166-1 alpha-2 country code, upper-cased. */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 country code');

/** ISO 4217 currency code, upper-cased. */
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');

export const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

/** 24-hour wall-clock time "HH:mm". */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour time "HH:mm"');

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** IANA time zone name (validated with Intl). */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, 'Unknown IANA time zone');

export const timeZoneWithDefaultSchema = timeZoneSchema.default(DEFAULT_TIMEZONE);

/** Quiet hours window in the owner's time zone; may wrap midnight (22:00 → 07:00). */
export const quietHoursSchema = z.object({
  start: timeOfDaySchema,
  end: timeOfDaySchema,
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const opportunityTypeSchema = z.enum(OPPORTUNITY_TYPES);
export const remoteModeSchema = z.enum(REMOTE_MODES);
export const payPeriodSchema = z.enum(PAY_PERIODS);

export const nonEmptyTrimmed = (max: number) => z.string().trim().min(1).max(max);
