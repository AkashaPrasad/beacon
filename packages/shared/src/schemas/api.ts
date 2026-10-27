import { z } from 'zod';

import { LIMITS, SOURCE_KINDS } from '../constants';
import { idSchema, opportunityTypeSchema, remoteModeSchema } from './common';
import { fitResultSchema } from './fit';
import { listingPublicSchema } from './listing';
import { profileInputSchema } from './profile';

// ── Helpers for query strings ────────────────────────────────────────────────

/** Accepts `a,b,c`, repeated params (`?t=a&t=b`) or an array. */
export function csvArray<T extends z.ZodType>(item: T) {
  return z.preprocess((value) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return value;
  }, z.array(item));
}

/** Accepts true/false, "true"/"false", "1"/"0". */
export const booleanishSchema = z.preprocess((value) => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0' || value === '') return false;
  return value;
}, z.boolean());

// ── Cursor pagination ────────────────────────────────────────────────────────

/** Opaque base64url cursor (see `encodeCursor` / `decodeCursor`). */
export const cursorSchema = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Malformed cursor');

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.feedPageMax).default(LIMITS.feedPageDefault),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
    total: z.number().int().min(0).optional(),
  });
}
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

type CursorValue = string | number | boolean | null;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(cursor: string): string {
  const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a keyset position (e.g. `{ s: 87.5, id: '...' }`) as an opaque cursor. */
export function encodeCursor(position: Record<string, CursorValue>): string {
  return toBase64Url(JSON.stringify(position));
}

/** Decode a cursor; returns null for anything malformed (treat as "first page" or 400). */
export function decodeCursor(cursor: string): Record<string, CursorValue> | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const t = typeof value;
      if (value !== null && t !== 'string' && t !== 'number' && t !== 'boolean') return null;
    }
    return parsed as Record<string, CursorValue>;
  } catch {
    return null;
  }
}

// ── Feed ─────────────────────────────────────────────────────────────────────

export const FEED_SORTS = ['fit', 'deadline', 'posted'] as const;

/** GET /feed query string. */
export const feedQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  types: csvArray(opportunityTypeSchema).optional(),
  remote: csvArray(remoteModeSchema).optional(),
  locations: csvArray(z.string().trim().min(1).max(120)).optional(),
  /** Deadline within N days from now. */
  deadlineWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Posted within N days (freshness filter). */
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Minimum monthly stipend in `stipendCurrency` (default INR). */
  minStipend: z.coerce.number().min(0).optional(),
  stipendCurrency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
  /** Only listings open to this graduation year (or unrestricted). */
  gradYear: z.coerce.number().int().min(1950).max(2100).optional(),
  company: z.string().trim().min(1).max(200).optional(),
  sourceId: idSchema.optional(),
  minFit: z.coerce.number().int().min(0).max(100).optional(),
  includeExpired: booleanishSchema.default(false),
  includeHidden: booleanishSchema.default(false),
  sort: z.enum(FEED_SORTS).default('fit'),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

export const feedItemSchema = z.object({
  listing: listingPublicSchema,
  fit: fitResultSchema,
  saved: z.boolean(),
  hidden: z.boolean(),
  trackerItemId: idSchema.nullable(),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

export const feedResponseSchema = cursorPageSchema(feedItemSchema);
export type FeedResponse = z.infer<typeof feedResponseSchema>;

// ── Sources ──────────────────────────────────────────────────────────────────

/** POST /sources/detect body. Scheme optional ("jobs.lever.co/acme" is fine). */
export const detectSourceRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});
export type DetectSourceRequest = z.infer<typeof detectSourceRequestSchema>;

/** e.g. "Detected: Greenhouse board `stripe` → 142 jobs". */
export const detectSourceResponseSchema = z.object({
  /** Normalised input URL. */
  url: z.string(),
  kind: z.enum(SOURCE_KINDS),
  /** 0..1: 1 for an exact ATS URL pattern, lower for HTML sniffing / crawl fallback. */
  confidence: z.number().min(0).max(1),
  boardToken: z.string().nullable(),
  company: z.string().nullable(),
  /** Suggested source name. */
  name: z.string().nullable(),
  /** Number of listings found in the preview fetch; null when not fetched. */
  previewCount: z.number().int().min(0).nullable(),
  sampleTitles: z.array(z.string()).max(5),
  /** Whether refreshing this source spends Firecrawl credits. */
  costsCredits: z.boolean(),
  message: z.string(),
});
export type DetectSourceResponse = z.infer<typeof detectSourceResponseSchema>;

// ── Resume ───────────────────────────────────────────────────────────────────

export const RESUME_PARSE_METHODS = ['deterministic', 'llm', 'hybrid'] as const;

export const extractedSkillSchema = z.object({
  canonical: z.string(),
  matchedAlias: z.string(),
  count: z.number().int().min(1),
});

/** POST /profile/resume response: an editable draft, never auto-saved. */
export const resumeParseResultSchema = z.object({
  profile: profileInputSchema,
  method: z.enum(RESUME_PARSE_METHODS),
  /** Section headings detected ("education", "projects", ...). */
  sections: z.array(z.string()),
  skills: z.array(extractedSkillSchema),
  emails: z.array(z.string()),
  warnings: z.array(z.string()),
  /** Characters of extracted text (0 = scanned/image-only PDF). */
  textChars: z.number().int().min(0),
});
export type ResumeParseResult = z.infer<typeof resumeParseResultSchema>;

// ── Errors ───────────────────────────────────────────────────────────────────

export const API_ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  'quota_exceeded',
  'upstream_error',
  'internal',
] as const;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
