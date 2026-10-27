import { Types } from 'mongoose';
import type { z } from 'zod';

import { notFound, ValidationError, type RequestLocation } from './errors.js';

/** Validate a request part with zod; throws a 400 `VALIDATION` error on failure. */
export function parse<S extends z.ZodType>(
  schema: S,
  value: unknown,
  location: RequestLocation = 'body',
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error, location);
  return result.data;
}

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

/** Path id → ObjectId. Malformed ids are a 404 (same as missing; ids never leak existence). */
export function objectIdParam(value: unknown, what = 'Resource'): Types.ObjectId {
  if (!isObjectId(value)) throw notFound(what);
  return new Types.ObjectId(value);
}

export function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

/** Escape a user string for use inside a RegExp. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
