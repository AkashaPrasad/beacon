import { describe, expect, it } from 'vitest';

import {
  crossedThreshold,
  resolveSwipe,
  SWIPE_DISTANCE_RATIO,
  SWIPE_VELOCITY,
  swipeProgress,
} from './swipe';

const width = 400; // commit distance = 120 px

describe('resolveSwipe', () => {
  it('right past 30 % saves, left past 30 % hides', () => {
    expect(resolveSwipe({ offsetX: width * SWIPE_DISTANCE_RATIO, velocityX: 0, width })).toBe('save');
    expect(resolveSwipe({ offsetX: -130, velocityX: 0, width })).toBe('hide');
  });

  it('snaps back below the distance without a fling', () => {
    expect(resolveSwipe({ offsetX: 119, velocityX: 100, width })).toBeNull();
    expect(resolveSwipe({ offsetX: -60, velocityX: -499, width })).toBeNull();
    expect(resolveSwipe({ offsetX: 0, velocityX: 900, width })).toBeNull();
  });

  it('a fast fling in the drag direction commits early', () => {
    expect(resolveSwipe({ offsetX: 40, velocityX: SWIPE_VELOCITY, width })).toBe('save');
    expect(resolveSwipe({ offsetX: -40, velocityX: -800, width })).toBe('hide');
  });

  it('a fling against the drag direction does not commit', () => {
    expect(resolveSwipe({ offsetX: 60, velocityX: -900, width })).toBeNull();
  });

  it('a tiny flick is ignored even when fast', () => {
    expect(resolveSwipe({ offsetX: 10, velocityX: 2000, width })).toBeNull();
  });

  it('survives degenerate input', () => {
    expect(resolveSwipe({ offsetX: Number.NaN, velocityX: 0, width })).toBeNull();
    expect(resolveSwipe({ offsetX: 5, velocityX: 0, width: 0 })).toBe('save');
  });
});

describe('swipe progress', () => {
  it('reaches 1 at the commit point and stays clamped', () => {
    expect(swipeProgress(0, width)).toBe(0);
    expect(swipeProgress(60, width)).toBeCloseTo(0.5);
    expect(swipeProgress(-120, width)).toBe(1);
    expect(swipeProgress(500, width)).toBe(1);
  });

  it('crossedThreshold matches the distance rule', () => {
    expect(crossedThreshold(119, width)).toBe(false);
    expect(crossedThreshold(-120, width)).toBe(true);
  });
});
