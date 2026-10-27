import { describe, expect, it } from 'vitest';

import {
  barOpacity,
  clearSourceJustAdded,
  justAddedAge,
  LIVE_INSERT_BAR_MS,
  markSourceJustAdded,
  shouldPlayEnter,
} from './just-added';

describe('live insert (MOTION §5.5)', () => {
  it('matches the optimistic and saved row by normalised URL', () => {
    markSourceJustAdded('https://www.boards.greenhouse.io/stripe/?utm_source=x', 1_000);
    expect(justAddedAge('https://boards.greenhouse.io/stripe', 1_100)).toBe(100);
    clearSourceJustAdded('boards.greenhouse.io/stripe');
    expect(justAddedAge('https://boards.greenhouse.io/stripe', 1_100)).toBeNull();
  });

  it('plays the enter only on the first mount, and fades the bar over 4 s', () => {
    markSourceJustAdded('https://jobs.lever.co/cred', 0);
    const first = justAddedAge('https://jobs.lever.co/cred', 50);
    const remount = justAddedAge('https://jobs.lever.co/cred', 900);
    expect(shouldPlayEnter(first)).toBe(true);
    expect(shouldPlayEnter(remount)).toBe(false);
    expect(barOpacity(first)).toBeGreaterThan(0.98);
    expect(barOpacity(LIVE_INSERT_BAR_MS / 2)).toBeCloseTo(0.5);
    expect(justAddedAge('https://jobs.lever.co/cred', LIVE_INSERT_BAR_MS + 1)).toBeNull();
    expect(barOpacity(null)).toBe(0);
  });
});
