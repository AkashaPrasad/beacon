import { z } from 'zod';

import {
  REFRESH_INTERVALS,
  SOURCE_HEALTH,
  SOURCE_KINDS,
  SOURCE_PACK_IDS,
  SOURCE_SCOPES,
} from '../constants';
import { dateSchema, idSchema, nonEmptyTrimmed, opportunityTypeSchema } from './common';

export const sourceKindSchema = z.enum(SOURCE_KINDS);
export const sourceScopeSchema = z.enum(SOURCE_SCOPES);
export const refreshIntervalSchema = z.enum(REFRESH_INTERVALS);
export const sourceHealthSchema = z.enum(SOURCE_HEALTH);
export const sourcePackIdSchema = z.enum(SOURCE_PACK_IDS);

/** Kind-specific fetch configuration discovered by detection. */
export const sourceConfigSchema = z.object({
  /** ATS board token / company slug, e.g. greenhouse "stripe", lever "netflix". */
  boardToken: z.string().trim().max(200).nullable().default(null),
  /** Resolved feed/sitemap/API URL when it differs from `url`. */
  feedUrl: z.string().trim().max(2048).nullable().default(null),
  /** Public API provider id for kind=publicapi ("remotive", "devpost", ...). */
  provider: z.string().trim().max(64).nullable().default(null),
});
export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export const sourceBaseSchema = z.object({
  id: idSchema,
  /** Canonicalised with `normaliseUrl`. Unique per (scope, ownerId). */
  url: z.string().trim().min(1).max(2048),
  name: nonEmptyTrimmed(160),
  kind: sourceKindSchema,
  scope: sourceScopeSchema,
  /** Owner for personal sources; null for community sources (crawled once, shared). */
  ownerId: idSchema.nullable().default(null),
  packId: sourcePackIdSchema.nullable().default(null),
  /** Default opportunity type for listings from this source (overrides inference). */
  typeTag: opportunityTypeSchema.nullable().default(null),
  enabled: z.boolean().default(true),
  refreshInterval: refreshIntervalSchema.default('daily'),
  health: sourceHealthSchema.default('pending'),
  lastCheckedAt: dateSchema.nullable().default(null),
  listingsFound: z.number().int().min(0).default(0),
  errorReason: z.string().max(500).nullable().default(null),
  config: sourceConfigSchema.prefault({}),
  /** HTTP validators for conditional polling (ETag / If-Modified-Since). */
  etag: z.string().max(500).nullable().default(null),
  lastModified: z.string().max(100).nullable().default(null),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const sourceSchema = sourceBaseSchema.refine(
  (s) => (s.scope === 'personal' ? s.ownerId !== null : true),
  { message: 'Personal sources need an ownerId', path: ['ownerId'] },
);
export type Source = z.infer<typeof sourceSchema>;

/** POST /sources */
export const sourceCreateSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  name: nonEmptyTrimmed(160).optional(),
  typeTag: opportunityTypeSchema.nullable().optional(),
  refreshInterval: refreshIntervalSchema.optional(),
  enabled: z.boolean().optional(),
});
export type SourceCreate = z.infer<typeof sourceCreateSchema>;

/** PATCH /sources/:id */
export const sourceUpdateSchema = z.object({
  name: nonEmptyTrimmed(160).optional(),
  typeTag: opportunityTypeSchema.nullable().optional(),
  refreshInterval: refreshIntervalSchema.optional(),
  enabled: z.boolean().optional(),
});
export type SourceUpdate = z.infer<typeof sourceUpdateSchema>;
