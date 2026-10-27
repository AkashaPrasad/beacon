import { describe, expect, it } from 'vitest';

import {
  MOTION_LIMITS,
  createOnceTracker,
  cssSpring,
  durations,
  landing,
  nearestSnap,
  press,
  springs,
  stagger,
  toReducedMotion,
  tweens,
  variants,
} from './motion';

describe('motion constants', () => {
  it('keeps every spring within the perceived-duration and bounce limits', () => {
    for (const [name, s] of Object.entries(springs)) {
      expect(s.type, name).toBe('spring');
      expect(s.visualDuration, name).toBeGreaterThan(0);
      expect(s.visualDuration, name).toBeLessThanOrEqual(MOTION_LIMITS.maxVisualDuration);
      expect(s.bounce, name).toBeGreaterThanOrEqual(0);
      expect(s.bounce, name).toBeLessThanOrEqual(MOTION_LIMITS.maxBounce);
    }
  });

  it('never overshoots data or large surfaces', () => {
    expect(springs.data.bounce).toBe(0);
    expect(springs.smooth.bounce).toBe(0);
  });

  it('keeps tweens inside the token durations', () => {
    for (const t of Object.values(tweens)) expect(t.duration).toBeLessThanOrEqual(durations.slow);
  });

  it('mirrors tokens.css durations', () => {
    expect(durations).toEqual({ fast: 0.12, base: 0.18, slow: 0.24, fade: 0.12 });
  });

  it('exposes a CSS linear() spring that settles at 1', () => {
    expect(cssSpring.startsWith('linear(0,')).toBe(true);
    expect(cssSpring.endsWith(', 1)')).toBe(true);
  });
});

describe('stagger', () => {
  it('steps 20 ms and stops after 12 items', () => {
    expect(stagger(0)).toBe(0);
    expect(stagger(5)).toBe(0.1);
    expect(stagger(11)).toBe(0.22);
    expect(stagger(12)).toBeNull();
    expect(stagger(-1)).toBeNull();
  });

  it('feeds the row variant delay', () => {
    const visible = variants.row.visible(3);
    expect(visible.transition.delay).toBe(0.06);
    expect(variants.row.visible(40).transition.delay).toBe(0);
  });
});

describe('gesture helpers', () => {
  it('projects velocity when choosing a snap point', () => {
    const snaps = [0, 0.6, 1];
    expect(nearestSnap(0.55, 0, snaps)).toBe(0.6);
    expect(nearestSnap(0.55, 3, snaps)).toBe(1);
    expect(nearestSnap(0.55, -3, snaps)).toBe(0);
  });

  it('presses with the fast spring and releases with the tactile one', () => {
    expect(press.button.whileTap.transition).toBe(springs.press);
    expect(press.button.transition).toBe(springs.release);
  });
});

describe('preferences and session helpers', () => {
  it('maps the Settings motion preference to MotionConfig', () => {
    expect(toReducedMotion('system')).toBe('user');
    expect(toReducedMotion('reduced')).toBe('always');
    expect(toReducedMotion('full')).toBe('never');
  });

  it('plays one-time animations once per id', () => {
    const once = createOnceTracker();
    expect(once.first('a')).toBe(true);
    expect(once.first('a')).toBe(false);
    once.reset();
    expect(once.first('a')).toBe(true);
  });

  it('keeps landing acts contiguous from 0 to 1', () => {
    const { sources, fit, alerts } = landing.story.acts;
    expect(sources[0]).toBe(0);
    expect(sources[1]).toBe(fit[0]);
    expect(fit[1]).toBe(alerts[0]);
    expect(alerts[1]).toBe(1);
  });
});
