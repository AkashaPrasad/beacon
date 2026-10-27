import { z } from 'zod';

import { DEFAULT_WEIGHTS, SCORE_COMPONENTS, type ScoreComponent } from '../constants';

/** One slider value. Any non-negative scale works (0..1 or 0..100); weights are normalised. */
const weightValue = z.number().min(0).max(100);

const weightShape = Object.fromEntries(SCORE_COMPONENTS.map((c) => [c, weightValue])) as Record<
  ScoreComponent,
  typeof weightValue
>;

export type Weights = Record<ScoreComponent, number>;

/**
 * Normalise weights so they sum to 1. Missing keys fall back to SPEC defaults; a
 * zero (or negative/NaN) total falls back to the defaults entirely.
 */
export function normaliseWeights(weights?: Partial<Weights> | null): Weights {
  const merged = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const clean = Object.fromEntries(
    SCORE_COMPONENTS.map((c) => {
      const v = merged[c];
      return [c, Number.isFinite(v) && v > 0 ? v : 0];
    }),
  ) as Weights;
  const total = SCORE_COMPONENTS.reduce((sum, c) => sum + clean[c], 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(SCORE_COMPONENTS.map((c) => [c, clean[c] / total])) as Weights;
}

/** Raw slider values (validated, not normalised). */
export const weightsInputSchema = z
  .object(weightShape)
  .refine((w) => SCORE_COMPONENTS.some((c) => w[c] > 0), 'At least one weight must be positive');
export type WeightsInput = z.infer<typeof weightsInputSchema>;

/** Partial slider update (PATCH). */
export const weightsPatchSchema = z.object(weightShape).partial();

/** Validated and normalised weights (sum = 1). */
export const weightsSchema = weightsInputSchema.transform((w) => normaliseWeights(w));
