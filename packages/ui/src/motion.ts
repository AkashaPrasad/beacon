/**
 * Beacon motion system: the only place spring, duration and easing values live.
 * Spec: docs/MOTION.md (authoritative). Values mirror the CSS tokens in ../tokens.css.
 *
 * Dependency-free on purpose: these are plain objects that are structurally valid Motion v12
 * (`motion/react`) transitions and variants, so this package does not need `motion` installed.
 *
 *   import { m } from 'motion/react';
 *   import { press, springs, variants } from '@kestrel/ui';
 *   <m.button {...press.button}>Save</m.button>
 *   <m.div layoutId={layoutIds.segmentIndicator('view')} transition={springs.snappy} />
 */

export type CubicBezier = [number, number, number, number];

export interface SpringTransition {
  type: 'spring';
  /** Perceived duration in seconds (Motion's `visualDuration`): when the motion *looks* finished. */
  visualDuration: number;
  /** 0 = critically damped (no overshoot); 0.1–0.2 = brisk; never above MOTION_LIMITS.maxBounce. */
  bounce: number;
}

export interface TweenTransition {
  type: 'tween';
  duration: number;
  ease: CubicBezier | 'linear';
}

/** Seconds. Mirrors --duration-* in tokens.css. */
export const durations = {
  fast: 0.12,
  base: 0.18,
  slow: 0.24,
  fade: 0.12,
} as const;

export const easings: Record<'out' | 'in' | 'inOut', CubicBezier> = {
  out: [0.16, 1, 0.3, 1],
  in: [0.4, 0, 1, 1],
  inOut: [0.65, 0, 0.35, 1],
};

/** Hard limits that every value in this file obeys (enforced by motion.test.ts). */
export const MOTION_LIMITS = {
  /** Product UI never exceeds this perceived duration (seconds). */
  maxVisualDuration: 0.24,
  maxBounce: 0.25,
  /** List-enter stagger: 20 ms per item, first 12 items only. */
  staggerStep: 0.02,
  staggerMax: 12,
  /** Above this many moving siblings, crossfade instead of a layout (FLIP) animation. */
  layoutMaxItems: 30,
  pressScale: 0.97,
  iconPressScale: 0.92,
  cardPressScale: 0.985,
  liftY: -2,
  distanceSm: 4,
  distanceMd: 8,
} as const;

const spring = (visualDuration: number, bounce: number): SpringTransition => ({
  type: 'spring',
  visualDuration,
  bounce,
});

/**
 * Spring catalogue. Every animated movement in product UI uses one of these.
 * Springs keep velocity when retargeted, so any interruption continues smoothly from where it is.
 */
export const springs = {
  /** Pointer-down: the control yields immediately. */
  press: spring(0.1, 0),
  /** Pointer-up: returns with a small, tactile overshoot. Small controls only. */
  release: spring(0.22, 0.2),
  /** Indicators, toggles, chips, popovers, palette, toasts. */
  snappy: spring(0.18, 0.1),
  /** Large surfaces: drawer, sheet, shared-element morphs. No bounce on big things. */
  smooth: spring(0.24, 0),
  /** List reorder/layout, Kanban settle, toast stack shuffle. */
  gentle: spring(0.24, 0.15),
  /** Hover lift on cards. */
  lift: spring(0.16, 0),
  /** Data: score ring, fit bars, weights. Never overshoots; a score must not read higher than it is. */
  data: spring(0.24, 0),
} as const satisfies Record<string, SpringTransition>;

export const tweens = {
  fadeIn: { type: 'tween', duration: durations.fade, ease: easings.out },
  fadeOut: { type: 'tween', duration: durations.fast, ease: easings.in },
  /** Exits: quicker than enters, accelerating away. */
  exit: { type: 'tween', duration: durations.fast, ease: easings.in },
  /** Number count-up in product UI. */
  count: { type: 'tween', duration: durations.slow, ease: easings.out },
} as const satisfies Record<string, TweenTransition>;

/**
 * The same spring as `--ease-spring` (stiffness 400, damping 34, zeta 0.85), sampled for CSS/WAAPI.
 * Use for dnd-kit `dropAnimation`, Sonner and Vaul overrides, and View Transition pseudo-elements.
 */
export const cssSpring =
  'linear(0, 0.047, 0.154, 0.287, 0.423, 0.548, 0.658, 0.749, 0.822, 0.878, 0.92, 0.951, 0.972, 0.987, 0.996, 1.002, 1.005, 1.006, 1.006, 1.006, 1.005, 1.004, 1.003, 1.003, 1)';

export const cssEase = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

/**
 * Delay (seconds) for the i-th item of an entering list, or `null` when the item is past the stagger cap.
 * A `null` item must mount without animating (`initial={false}`).
 */
export function stagger(
  index: number,
  step: number = MOTION_LIMITS.staggerStep,
  max: number = MOTION_LIMITS.staggerMax,
): number | null {
  if (index < 0 || index >= max) return null;
  return Math.round(index * step * 1000) / 1000;
}

/** Variants. Use with `initial="hidden" animate="visible" exit="exit"`. */
export const variants = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: tweens.fadeIn },
    exit: { opacity: 0, transition: tweens.fadeOut },
  },
  /** Feed/list rows. Pass `custom={index}` for the stagger. */
  row: {
    hidden: { opacity: 0, y: MOTION_LIMITS.distanceSm },
    visible: (index: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { ...springs.gentle, delay: stagger(index) ?? 0 },
    }),
    exit: { opacity: 0, x: -MOTION_LIMITS.distanceMd, transition: tweens.exit },
  },
  popover: {
    hidden: { opacity: 0, scale: 0.98 },
    visible: { opacity: 1, scale: 1, transition: springs.snappy },
    exit: { opacity: 0, transition: tweens.fadeOut },
  },
  palette: {
    hidden: { opacity: 0, scale: 0.97, y: -6 },
    visible: { opacity: 1, scale: 1, y: 0, transition: springs.snappy },
    exit: { opacity: 0, scale: 0.99, transition: tweens.fadeOut },
  },
  /** Drawer *content* (the panel itself appears via grid/sheet). */
  drawerContent: {
    hidden: { opacity: 0, x: 16 },
    visible: { opacity: 1, x: 0, transition: springs.smooth },
    exit: { opacity: 0, transition: tweens.fadeOut },
  },
  /** Overlay side panel (lg) and Sheet (md). */
  sidePanel: {
    hidden: { x: '100%' },
    visible: { x: 0, transition: springs.smooth },
    exit: { x: '100%', transition: { type: 'tween', duration: durations.base, ease: easings.in } },
  },
  scrim: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: tweens.fadeIn },
    exit: { opacity: 0, transition: tweens.fadeOut },
  },
  toast: {
    hidden: { opacity: 0, y: 12, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: springs.snappy },
    exit: { opacity: 0, scale: 0.97, transition: tweens.exit },
  },
  /** Children revealed after a shared-element container morph lands. */
  morphContent: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { ...tweens.fadeIn, delay: 0.06 } },
    exit: { opacity: 0, transition: { ...tweens.fadeOut, duration: 0.08 } },
  },
  /** Landing and empty-state reveals on scroll (`whileInView`, viewport once). Never in product lists. */
  reveal: {
    hidden: { opacity: 0, y: MOTION_LIMITS.distanceMd },
    visible: { opacity: 1, y: 0, transition: springs.smooth },
  },
} as const;

/** Gesture props: spread onto `m.*` elements. Press uses `springs.press`, and release uses the element's transition. */
export const press = {
  button: {
    whileTap: { scale: MOTION_LIMITS.pressScale, transition: springs.press },
    transition: springs.release,
  },
  icon: {
    whileTap: { scale: MOTION_LIMITS.iconPressScale, transition: springs.press },
    transition: springs.release,
  },
  card: {
    whileTap: { scale: MOTION_LIMITS.cardPressScale, transition: springs.press },
    transition: springs.release,
  },
} as const;

/** Hover lift for cards (Motion ignores hover on touch). Pair with the ::after shadow-fade technique (MOTION.md §7). */
export const hoverLift = {
  whileHover: { y: MOTION_LIMITS.liftY, transition: springs.lift },
  transition: springs.lift,
} as const;

/** Shared names so the same element is matched across views (layoutId / view-transition-name). */
export const layoutIds = {
  listingLogo: (id: string) => `listing-${id}-logo`,
  listingRing: (id: string) => `listing-${id}-ring`,
  listingTitle: (id: string) => `listing-${id}-title`,
  trackerCard: (id: string) => `tracker-${id}-card`,
  segmentIndicator: (group: string) => `segment-${group}-indicator`,
  tabIndicator: (group: string) => `tab-${group}-indicator`,
} as const;

/** dnd-kit `<DragOverlay dropAnimation={dropAnimation}>` (WAAPI accepts linear()). */
export const dropAnimation = { duration: 220, easing: cssSpring } as const;

/** dnd-kit sensor activation constraints. */
export const dragActivation = {
  pointer: { distance: 4 },
  touch: { delay: 200, tolerance: 6 },
} as const;

/** Swipe rows and bottom-sheet thresholds. */
export const gestures = {
  swipeCommitRatio: 0.3,
  swipeCommitVelocity: 500,
  sheetDismissRatio: 0.3,
  sheetDismissVelocity: 500,
  /** Project release velocity this far ahead (s) when choosing a snap point. */
  snapProjection: 0.2,
  /** Rubber-band resistance past the ends of a drag (Motion `dragElastic`). */
  elastic: 0.12,
} as const;

/** Project where a flung value would come to rest, then pick the nearest snap point. */
export function nearestSnap(value: number, velocity: number, snaps: readonly number[]): number {
  const projected = value + velocity * gestures.snapProjection;
  let best = snaps[0] ?? value;
  for (const s of snaps) if (Math.abs(s - projected) < Math.abs(best - projected)) best = s;
  return best;
}

export type MotionPreference = 'system' | 'reduced' | 'full';

/** Settings > Appearance > Motion → `<MotionConfig reducedMotion={...}>`. */
export function toReducedMotion(pref: MotionPreference): 'user' | 'always' | 'never' {
  switch (pref) {
    case 'reduced':
      return 'always';
    case 'full':
      return 'never';
    case 'system':
      return 'user';
  }
}

/** Remembers which ids have already played a one-time animation this session (score ring, row enter). */
export function createOnceTracker() {
  const seen = new Set<string>();
  return {
    /** Returns true the first time an id is seen, false afterwards. */
    first(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
    reset(): void {
      seen.clear();
    },
  };
}

type Edge = 'start' | 'center' | 'end';
export type ScrollIntersection = `${Edge} ${Edge}`;
export type Range = [number, number];

/** Landing storyboard constants (docs/MOTION.md §8). Offsets go straight into `useScroll({ target, offset })`. */
export const landing: {
  heroScrollOut: {
    offset: [ScrollIntersection, ScrollIntersection];
    headlineFade: Range;
    frameScaleTo: number;
    frameY: number;
  };
  story: {
    offset: [ScrollIntersection, ScrollIntersection];
    acts: Record<'sources' | 'fit' | 'alerts', Range>;
    pingAt: number;
  };
  timeline: { offset: [ScrollIntersection, ScrollIntersection]; sweep: Range };
  finale: {
    offset: [ScrollIntersection, ScrollIntersection];
    beamFrom: number;
    beamTo: number;
    lightsAt: number;
  };
  feed: { assembleStep: number; liveInterval: number; pingDuration: number; maxRows: number };
  explainer: { idleBeforeDemo: number; presetInterval: number };
} = {
  heroScrollOut: {
    offset: ['start start', 'end start'],
    headlineFade: [0, 0.6],
    frameScaleTo: 0.94,
    frameY: -48,
  },
  story: {
    offset: ['start start', 'end end'],
    acts: { sources: [0, 0.34], fit: [0.34, 0.68], alerts: [0.68, 1] },
    pingAt: 0.84,
  },
  timeline: { offset: ['start start', 'end end'], sweep: [0, 0.7] },
  finale: { offset: ['start end', 'center center'], beamFrom: -45, beamTo: 0, lightsAt: 0.95 },
  feed: { assembleStep: 0.11, liveInterval: 2.4, pingDuration: 1.6, maxRows: 6 },
  explainer: { idleBeforeDemo: 4, presetInterval: 3.2 },
};
