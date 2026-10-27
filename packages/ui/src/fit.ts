/**
 * Fit-score bands (DESIGN §3.3). The ramp is monotonic in lightness and is never shown without the
 * number; the band name is always available as text.
 */
export type FitBandKey = 'low' | 'mid' | 'good' | 'great';

export interface FitBand {
  key: FitBandKey;
  /** Inclusive lower bound. */
  min: number;
  /** Sentence-case band name ("Strong fit"). */
  label: string;
  /** CSS custom property holding the band colour. */
  colorVar: `--color-fit-${FitBandKey}`;
  /** CSS custom property holding the band's subtle (chip) background. */
  subtleVar: `--color-fit-${FitBandKey}-subtle`;
}

export const FIT_BANDS: readonly FitBand[] = [
  {
    key: 'great',
    min: 80,
    label: 'Strong fit',
    colorVar: '--color-fit-great',
    subtleVar: '--color-fit-great-subtle',
  },
  {
    key: 'good',
    min: 60,
    label: 'Good fit',
    colorVar: '--color-fit-good',
    subtleVar: '--color-fit-good-subtle',
  },
  {
    key: 'mid',
    min: 40,
    label: 'Worth a look',
    colorVar: '--color-fit-mid',
    subtleVar: '--color-fit-mid-subtle',
  },
  {
    key: 'low',
    min: 0,
    label: 'Long shot',
    colorVar: '--color-fit-low',
    subtleVar: '--color-fit-low-subtle',
  },
] as const;

/** Clamp to an integer 0..100 (NaN → 0). */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function fitBandOf(score: number): FitBand {
  const s = clampScore(score);
  return FIT_BANDS.find((band) => s >= band.min) ?? (FIT_BANDS[FIT_BANDS.length - 1] as FitBand);
}

/** "Fit 86 of 100, strong fit" (DESIGN §6.2 ScoreRing accessible name). */
export function fitAccessibleLabel(score: number): string {
  const s = clampScore(score);
  return `Fit ${s} of 100, ${fitBandOf(s).label.toLowerCase()}`;
}
