import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEIGHTS,
  fitBand,
  ghostRiskLevel,
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
} from './constants';

describe('constants', () => {
  it('labels every opportunity type', () => {
    for (const type of OPPORTUNITY_TYPES) expect(OPPORTUNITY_TYPE_LABELS[type]).toBeTruthy();
  });

  it('default weights sum to 1 (SPEC §4)', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('bands scores and ghost risk', () => {
    expect(fitBand(91)).toBe('Strong fit');
    expect(fitBand(60)).toBe('Good fit');
    expect(fitBand(10)).toBe('Weak fit');
    expect(ghostRiskLevel(0)).toBe('low');
    expect(ghostRiskLevel(45)).toBe('medium');
    expect(ghostRiskLevel(75)).toBe('high');
  });
});
