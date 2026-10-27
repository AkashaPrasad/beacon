import { z } from 'zod';

import { SCORE_COMPONENTS, type ScoreComponent } from '../constants';

export const FIT_CAP_CODES = [
  'eligibility_hard_fail',
  'remote_only_onsite',
  'deadline_passed',
] as const;
export type FitCapCode = (typeof FIT_CAP_CODES)[number];

export const HARD_FAIL_CODES = ['grad_year', 'citizenship', 'min_experience'] as const;
export type HardFailCode = (typeof HARD_FAIL_CODES)[number];

function componentRecord<T extends z.ZodType>(value: T) {
  return z.object(
    Object.fromEntries(SCORE_COMPONENTS.map((c) => [c, value])) as Record<ScoreComponent, T>,
  );
}

export const fitCapSchema = z.object({
  code: z.enum(FIT_CAP_CODES),
  /** The final score can not exceed this. */
  max: z.number().min(0).max(100),
  reason: z.string(),
});
export type FitCap = z.infer<typeof fitCapSchema>;

export const hardFailSchema = z.object({
  code: z.enum(HARD_FAIL_CODES),
  reason: z.string(),
});
export type HardFail = z.infer<typeof hardFailSchema>;

export const fitResultSchema = z.object({
  /** Final 0..100 integer: round(clamp(min(rawScore - ghostPenalty, ...caps))). */
  score: z.number().int().min(0).max(100),
  /** 100 * Σ weight·component, before ghost penalty and caps. */
  rawScore: z.number().min(0).max(100),
  /** Each component in 0..1. */
  components: componentRecord(z.number().min(0).max(1)),
  /** Points each component contributed to rawScore (100 · weight · component). */
  contributions: componentRecord(z.number().min(0).max(100)),
  /** Normalised weights actually used (semantic redistributed when unavailable). */
  weights: componentRecord(z.number().min(0).max(1)),
  caps: z.array(fitCapSchema),
  ghostPenalty: z.number().min(0).max(20),
  hardFails: z.array(hardFailSchema),
  /** False when no embedding similarity was supplied (its weight was redistributed). */
  semanticAvailable: z.boolean(),
  details: z.object({
    skills: z.object({
      matchedRequired: z.array(z.string()),
      missingRequired: z.array(z.string()),
      matchedNice: z.array(z.string()),
      missingNice: z.array(z.string()),
    }),
    /** Role family of the listing title (null when unclassified). */
    roleFamily: z.string().nullable(),
  }),
  explain: z.object({
    /** Most important positive reasons first (UI shows 3). */
    whyFit: z.array(z.string()),
    /** Most severe gaps first (UI shows 1–2). */
    gaps: z.array(z.string()),
  }),
});
export type FitResult = z.infer<typeof fitResultSchema>;
export type FitComponents = FitResult['components'];
