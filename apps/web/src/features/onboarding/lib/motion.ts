/**
 * Variants for the onboarding, welcome, profile, settings and notifications screens. Every value comes
 * from the design-owned motion system (`@kestrel/ui` → packages/ui/src/motion.ts, docs/MOTION.md);
 * nothing here defines a spring or duration of its own.
 */
import type { Transition, Variants } from 'motion/react';

import { durations, easings, MOTION_LIMITS, press, springs, stagger, tweens, variants } from '@kestrel/ui';

export { durations, easings, MOTION_LIMITS, press, springs, stagger, tweens, variants };

/**
 * Directional step transition (wizard steps, Settings mobile push pages: MOTION.md §5.15 "slide x 24→0
 * on push and reverse on back"). `custom` = +1 forward, -1 back. Exits are faster than enters (§6.7).
 */
export const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: (dir >= 0 ? 1 : -1) * 24 }),
  center: { opacity: 1, x: 0, transition: { x: springs.smooth, opacity: tweens.fadeIn } },
  exit: (dir: number) => ({
    opacity: 0,
    x: (dir >= 0 ? -1 : 1) * MOTION_LIMITS.distanceMd * 2,
    transition: tweens.exit,
  }),
};

/** Skeleton → content (MOTION.md §5.7): same box, content fades in with no movement. */
export const contentFade: Variants = variants.fade;

/** Chips and other non-virtualised list items (§5.5, chip row in §4). */
export const chipMotion = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: springs.snappy },
  exit: { opacity: 0, scale: 0.9, transition: tweens.exit },
  transition: { layout: springs.gentle } as Transition,
} as const;

/** Rows in a short list (notifications, packs): `custom={index}`; staggered for the first 12 only. */
export const rowVariants: Variants = variants.row;

/** Inline reveals (detection result, saved hint, AI result): small y + fade, `snappy`. */
export const inlineReveal = {
  initial: { opacity: 0, y: -MOTION_LIMITS.distanceSm },
  animate: { opacity: 1, y: 0, transition: { y: springs.snappy, opacity: tweens.fadeIn } },
  exit: { opacity: 0, transition: tweens.fadeOut },
} as const;
