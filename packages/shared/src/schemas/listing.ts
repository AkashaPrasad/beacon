import { z } from 'zod';

import { DEADLINE_KINDS, EMBEDDING_DIM, LIMITS } from '../constants';
import {
  countryCodeSchema,
  currencyCodeSchema,
  dateSchema,
  httpUrlSchema,
  idSchema,
  nonEmptyTrimmed,
  opportunityTypeSchema,
  payPeriodSchema,
  remoteModeSchema,
} from './common';

export const eligibilitySchema = z.object({
  /** Accepted graduation years; empty means unrestricted. */
  gradYears: z.array(z.number().int().min(1950).max(2100)).max(20).default([]),
  /** Accepted degrees as written ("B.Tech", "Any graduate"); empty means unrestricted. */
  degrees: z.array(nonEmptyTrimmed(120)).max(20).default([]),
  /** Minimum years of experience; null means not stated. */
  minExperienceYears: z.number().min(0).max(50).nullable().default(null),
  /** Required citizenship(s), ISO alpha-2; empty means unrestricted. */
  citizenship: z.array(countryCodeSchema).max(30).default([]),
  /** Any other stated requirement ("women in tech", "first-year only"), shown verbatim. */
  other: z.array(nonEmptyTrimmed(300)).max(20).default([]),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

export const GHOST_SIGNAL_CODES = [
  'age',
  'very_old',
  'reposted',
  'apply_link_dead',
  'apply_link_redirect_home',
  'apply_link_error',
  'boilerplate',
  'identical_roles',
  'not_seen_recently',
] as const;
export type GhostSignalCode = (typeof GHOST_SIGNAL_CODES)[number];

export const ghostReasonSchema = z.object({
  code: z.enum(GHOST_SIGNAL_CODES),
  message: z.string().min(1).max(300),
  points: z.number().min(0).max(100),
});
export type GhostReason = z.infer<typeof ghostReasonSchema>;

export const ghostRiskSchema = z.object({
  /** 0 (looks live) .. 100 (very likely ghost/stale). */
  score: z.number().min(0).max(100),
  reasons: z.array(ghostReasonSchema).default([]),
});
export type GhostRisk = z.infer<typeof ghostRiskSchema>;

export const embeddingSchema = z
  .array(z.number())
  .refine(
    (v) => v.length === 0 || v.length === EMBEDDING_DIM,
    `Embedding must be empty or ${EMBEDDING_DIM}-dimensional`,
  );

/**
 * The single normalised listing shape (SPEC §9 "All listings normalise to one schema").
 * Fields after the SPEC block are documented extensions (docs/DECISIONS.md).
 */
export const listingBaseSchema = z.object({
  id: idSchema,
  type: opportunityTypeSchema,
  title: nonEmptyTrimmed(LIMITS.titleMax),
  company: nonEmptyTrimmed(LIMITS.companyMax),
  companyDomain: z.string().trim().toLowerCase().max(253).nullable().default(null),
  location: z.array(nonEmptyTrimmed(200)).max(50).default([]),
  remote: remoteModeSchema.default('unknown'),
  country: countryCodeSchema.nullable().default(null),
  stipendMin: z.number().min(0).nullable().default(null),
  stipendMax: z.number().min(0).nullable().default(null),
  currency: currencyCodeSchema.nullable().default(null),
  period: payPeriodSchema.nullable().default(null),
  postedAt: dateSchema.nullable().default(null),
  deadlineAt: dateSchema.nullable().default(null),
  eligibility: eligibilitySchema.prefault({}),
  /** Canonical skill names (taxonomy). */
  skillsRequired: z.array(nonEmptyTrimmed(80)).max(100).default([]),
  skillsNice: z.array(nonEmptyTrimmed(80)).max(100).default([]),
  /** Sanitised Markdown. */
  descriptionMd: z.string().max(LIMITS.descriptionMax).default(''),
  applyUrl: httpUrlSchema,
  sourceId: idSchema,
  /** normaliseCompany|normaliseTitle|primaryLocation, see `canonicalKey()`. */
  canonicalKey: z.string().min(1).max(1_000),
  /** sha256 hex of the normalised description (unchanged text costs zero LLM calls). */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a sha256 hex digest'),
  firstSeenAt: dateSchema,
  lastSeenAt: dateSchema,
  seenCount: z.number().int().min(1).default(1),
  ghostRisk: ghostRiskSchema.prefault({ score: 0 }),
  embedding: embeddingSchema.default([]),

  // ── Extensions beyond the SPEC shape ──
  /** Distinguishes "rolling/ASAP" from "no deadline found" when deadlineAt is null. */
  deadlineKind: z.enum(DEADLINE_KINDS).default('unknown'),
  /** Set by the cleanup queue after 60 days unseen; excluded from the feed + vector search. */
  archived: z.boolean().default(false),
  /** Role family id from `classifyRole(title)` at ingest (null when unclassified). */
  roleFamily: z.string().max(64).nullable().default(null),
});

function stipendRangeOk(v: { stipendMin: number | null; stipendMax: number | null }): boolean {
  return v.stipendMin === null || v.stipendMax === null || v.stipendMin <= v.stipendMax;
}

export const listingSchema = listingBaseSchema.refine(stipendRangeOk, {
  message: 'stipendMin must be <= stipendMax',
  path: ['stipendMin'],
});
export type Listing = z.infer<typeof listingSchema>;
export type ListingInput = z.input<typeof listingSchema>;

/**
 * A fetched + normalised listing before it is stored: no id yet, and the derived
 * fields (keys, timestamps, ghost risk, embedding) are optional.
 */
export const listingDraftSchema = listingBaseSchema
  .omit({ id: true })
  .partial({
    canonicalKey: true,
    contentHash: true,
    firstSeenAt: true,
    lastSeenAt: true,
  })
  .refine(stipendRangeOk, { message: 'stipendMin must be <= stipendMax', path: ['stipendMin'] });
export type ListingDraft = z.infer<typeof listingDraftSchema>;

/** Listing as returned to the browser (no embedding / internal hash). */
export const listingPublicSchema = listingBaseSchema.omit({ embedding: true, contentHash: true });
export type ListingPublic = z.infer<typeof listingPublicSchema>;
