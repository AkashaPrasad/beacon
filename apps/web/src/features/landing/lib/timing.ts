/**
 * Landing-only timings from MOTION.md §8 that `landing` in packages/ui/src/motion.ts does not carry
 * yet. They live here, in one place, so components never inline a number. Candidates to move into
 * `landing` (reported to web-foundation): heroStart, staleAt, liveStart, countUp, chipStagger,
 * headlineY, storyRearm, mobileBeamTo.
 */
import { durations, easings, landing, type TweenTransition } from '@kestrel/ui';

export const timing = {
  /** L1: first row starts assembling this long after hydration (s). */
  heroStart: 0.2,
  /** L1: row 3 receives its "Possibly stale" stamp (s). */
  staleAt: 1.1,
  /** L1: live mode starts (s); then a row every `landing.feed.liveInterval`. */
  liveStart: 1.4,
  /** L1: header counters 0 → value (s), the landing-only decorative exception. */
  countUp: 0.6,
  /** L1: chips slide in 30 ms apart. */
  chipStagger: 0.03,
  /** L1 scroll-out: headline y 0 → −40 px. */
  headlineY: -40,
  /** L2: the ping re-arms below this progress. */
  storyRearm: 0.7,
  /** L3 mobile agenda and L4 bars: 40 ms stagger. */
  revealStagger: 0.04,
  /** L6 phones: the cone points down at the button. */
  mobileBeamTo: 90,
} as const;

/** 240 ms ease-out tween for clip-path reveals and divider draws (MOTION §8 L1 beats a, c). */
export const drawTween: TweenTransition = { type: 'tween', duration: durations.slow, ease: easings.out };

/** Header count-up (decorative, landing only). */
export const countTween: TweenTransition = { type: 'tween', duration: timing.countUp, ease: easings.out };

/** Beacon ping: one ring 0.4 → 1.6, opacity 0.24 → 0, ease-out. */
export const pingTween: TweenTransition = {
  type: 'tween',
  duration: landing.feed.pingDuration,
  ease: easings.out,
};
