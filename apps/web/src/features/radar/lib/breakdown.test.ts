import { computeFit, type FitResult } from '@kestrel/shared';
import { FIXTURE_NOW, sampleListings, sampleProfiles } from '@kestrel/shared/fixtures';
import { describe, expect, it } from 'vitest';

import { barScale, buildFitBreakdown, describeRow, formatPoints, formatWeight } from './breakdown';

const profile = sampleProfiles[0]!;
const fitFor = (index: number, semantic: number | null = 0.72): FitResult =>
  computeFit({ profile, listing: sampleListings[index]!, now: FIXTURE_NOW, semantic });

describe('formatPoints / formatWeight', () => {
  it('formats signed points with one decimal and a true minus sign', () => {
    expect(formatPoints(34.123)).toBe('+34.1');
    expect(formatPoints(0)).toBe('+0.0');
    expect(formatPoints(-4)).toBe('−4.0');
    expect(formatPoints(-0.01)).toBe('+0.0');
    expect(formatPoints(21, { signed: false })).toBe('21.0');
    expect(formatWeight(0.4)).toBe('40%');
    expect(formatWeight(0.0499)).toBe('5%');
  });
});

describe('buildFitBreakdown', () => {
  it('contributions add up to the raw score', () => {
    const fit = fitFor(0);
    const view = buildFitBreakdown(fit);
    const sum = view.rows.reduce((s, r) => s + r.contribution, 0);
    expect(sum).toBeCloseTo(fit.rawScore, 1);
    expect(view.rawScore).toBeCloseTo(fit.rawScore, 1);
  });

  it('each contribution equals 100 · weight · component', () => {
    const view = buildFitBreakdown(fitFor(1));
    for (const row of view.rows) {
      // The library rounds contributions and components independently, so allow ±0.1.
      expect(Math.abs(row.contribution - 100 * row.weight * row.value)).toBeLessThanOrEqual(0.1);
    }
  });

  it('hides zero-weight components (stipend by default) and keeps SCORE_COMPONENTS order', () => {
    const view = buildFitBreakdown(fitFor(0));
    expect(view.rows.map((r) => r.key)).toEqual([
      'semantic',
      'skills',
      'role',
      'eligibility',
      'location',
      'freshness',
    ]);
  });

  it('marks exactly one largest contributor', () => {
    const view = buildFitBreakdown(fitFor(0));
    const largest = view.rows.filter((r) => r.isLargest);
    expect(largest).toHaveLength(1);
    const max = Math.max(...view.rows.map((r) => r.contribution));
    expect(largest[0]!.contribution).toBe(max);
  });

  it('redistributes semantic weight when unavailable', () => {
    const view = buildFitBreakdown(fitFor(0, null));
    expect(view.semanticAvailable).toBe(false);
    expect(view.rows.some((r) => r.key === 'semantic')).toBe(false);
    const weightSum = view.rows.reduce((s, r) => s + r.weight, 0);
    expect(weightSum).toBeCloseTo(1, 5);
  });

  it('shows the ghost penalty and explains caps', () => {
    // lst_12: ghost risk 85, US-citizens only → hard fail cap for an Indian student.
    const fit = fitFor(11);
    const view = buildFitBreakdown(fit);
    expect(view.ghostPenalty).toBeGreaterThan(0);
    expect(view.cap).not.toBeNull();
    expect(view.score).toBeLessThanOrEqual(view.cap!.max);
    // lst_08: deadline passed → capped at 20.
    const expired = buildFitBreakdown(fitFor(7));
    expect(expired.cap?.max).toBeLessThanOrEqual(35);
  });

  it('final score equals round(raw − ghost) when nothing caps it', () => {
    const fit = fitFor(0);
    const view = buildFitBreakdown(fit);
    if (!view.cap) {
      expect(view.score).toBe(Math.round(Math.max(0, Math.min(100, view.rawScore - view.ghostPenalty))));
      expect(view.capped).toBe(false);
    }
  });

  it('bar scale is clamped and rows have an accessible description', () => {
    expect(barScale(1.4)).toBe(1);
    expect(barScale(-1)).toBe(0);
    expect(barScale(Number.NaN)).toBe(0);
    const row = buildFitBreakdown(fitFor(0)).rows[1]!;
    expect(describeRow(row)).toMatch(/^Skills, weight \d+%, match \d+%, contributes \d+\.\d points$/);
  });
});
