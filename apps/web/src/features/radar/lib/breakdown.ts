/**
 * Fit breakdown display math (DESIGN §6.2 `FitBreakdown`). Turns a `FitResult` into rows that read
 * top-to-bottom as the score's arithmetic: Σ contributions − ghost penalty, then caps.
 *
 * - Bar fill = the component's own 0..1 value ("how well you match on this"), so a small-weight
 *   factor you fully meet still shows a full bar; the weight is printed beside the label.
 * - Contribution = points added to the raw score (100 · weight · component), printed `+34.1`.
 * - The largest contributor is drawn in the band colour, everything else in `fg-secondary`.
 */
import {
  SCORE_COMPONENT_LABELS,
  SCORE_COMPONENTS,
  type FitResult,
  type ScoreComponent,
} from '@kestrel/shared';

export interface BreakdownRow {
  key: ScoreComponent;
  label: string;
  /** Normalised weight actually used, 0..1. */
  weight: number;
  /** Component value 0..1 (bar fill). */
  value: number;
  /** Points contributed to the raw score. */
  contribution: number;
  isLargest: boolean;
}

export interface FitBreakdownView {
  rows: BreakdownRow[];
  /** Σ contributions (equals `rawScore` up to float rounding). */
  rawScore: number;
  ghostPenalty: number;
  /** Lowest active cap (if any) and its reason. */
  cap: { max: number; reason: string } | null;
  /** Final integer score shown in the ring. */
  score: number;
  /** True when the arithmetic shown does not reach `score` without the cap explaining it. */
  capped: boolean;
  semanticAvailable: boolean;
}

const MINUS = '−';

/** `+34.1`, `+0.0`, `−4.0` (true minus sign, one decimal, mono in the UI). */
export function formatPoints(points: number, { signed = true }: { signed?: boolean } = {}): string {
  const rounded = Math.round(Math.abs(points) * 10) / 10;
  const text = rounded.toFixed(1);
  if (!signed) return text;
  if (rounded === 0) return `+${text}`;
  return points < 0 ? `${MINUS}${text}` : `+${text}`;
}

/** `40%` for a 0..1 weight. */
export function formatWeight(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function buildFitBreakdown(fit: FitResult): FitBreakdownView {
  const visible = SCORE_COMPONENTS.filter((key) => (fit.weights[key] ?? 0) > 0);
  let largest: ScoreComponent | null = null;
  for (const key of visible) {
    if (largest == null || fit.contributions[key] > fit.contributions[largest]) largest = key;
  }
  const rows: BreakdownRow[] = visible.map((key) => ({
    key,
    label: SCORE_COMPONENT_LABELS[key],
    weight: fit.weights[key],
    value: clamp01(fit.components[key]),
    contribution: fit.contributions[key],
    isLargest: key === largest && fit.contributions[key] > 0,
  }));
  const rawScore = SCORE_COMPONENTS.reduce((sum, key) => sum + (fit.contributions[key] ?? 0), 0);
  const cap =
    fit.caps.length === 0
      ? null
      : fit.caps.reduce((lowest, c) => (c.max < lowest.max ? c : lowest), fit.caps[0]!);
  const uncapped = Math.round(Math.min(100, Math.max(0, rawScore - fit.ghostPenalty)));
  return {
    rows,
    rawScore,
    ghostPenalty: fit.ghostPenalty,
    cap: cap ? { max: cap.max, reason: cap.reason } : null,
    score: fit.score,
    capped: cap != null && uncapped > fit.score,
    semanticAvailable: fit.semanticAvailable,
  };
}

/** Bar fill in percent, for `scaleX` (0..1) or width styles. */
export function barScale(value: number): number {
  return clamp01(value);
}

/** Screen-reader sentence for one row: "Skills, weight 25%, contributes 21.0 points". */
export function describeRow(row: BreakdownRow): string {
  return `${row.label}, weight ${formatWeight(row.weight)}, match ${Math.round(row.value * 100)}%, contributes ${formatPoints(row.contribution, { signed: false })} points`;
}
