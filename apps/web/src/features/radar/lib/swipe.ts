/**
 * Mobile swipe rows (DESIGN §6.1 "Mobile swipe rows"): swipe right = Save, swipe left = Hide.
 * The action commits past 30 % of the row width, or on a fling faster than 500 px/s in the same
 * direction as the drag. Pure so the thresholds are unit-tested; the component only feeds it
 * Motion's pan info.
 */

export type SwipeAction = 'save' | 'hide';

export const SWIPE_DISTANCE_RATIO = 0.3;
export const SWIPE_VELOCITY = 500;
/** A fling must still travel this far, so a twitchy tap-and-flick does not hide a row. */
export const SWIPE_MIN_FLING_PX = 24;
/** Horizontal intent: ignore drags that are mostly vertical (the user is scrolling). */
export const SWIPE_DIRECTION_LOCK_PX = 8;

export interface SwipeInput {
  /** Horizontal offset from the drag start, px (positive = right). */
  offsetX: number;
  /** Horizontal velocity at release, px/s. */
  velocityX: number;
  /** Row width, px. */
  width: number;
}

export function actionForDirection(direction: number): SwipeAction | null {
  if (direction > 0) return 'save';
  if (direction < 0) return 'hide';
  return null;
}

/** What a release does: commit an action, or snap back (null). */
export function resolveSwipe({ offsetX, velocityX, width }: SwipeInput): SwipeAction | null {
  if (!Number.isFinite(offsetX) || offsetX === 0) return null;
  const safeWidth = Math.max(width, 1);
  const distance = Math.abs(offsetX);
  if (distance >= safeWidth * SWIPE_DISTANCE_RATIO) return actionForDirection(offsetX);
  const sameDirection = Math.sign(velocityX) === Math.sign(offsetX);
  if (sameDirection && Math.abs(velocityX) >= SWIPE_VELOCITY && distance >= SWIPE_MIN_FLING_PX) {
    return actionForDirection(offsetX);
  }
  return null;
}

/** 0..1 reveal progress toward the commit point (drives the action label's opacity/scale). */
export function swipeProgress(offsetX: number, width: number): number {
  const threshold = Math.max(width, 1) * SWIPE_DISTANCE_RATIO;
  return Math.min(1, Math.abs(offsetX) / threshold);
}

/** True once the drag passes the commit point (fires the haptic tick exactly once per crossing). */
export function crossedThreshold(offsetX: number, width: number): boolean {
  return Math.abs(offsetX) >= Math.max(width, 1) * SWIPE_DISTANCE_RATIO;
}

/** Light haptic where supported (`navigator.vibrate(8)`); silently does nothing elsewhere. */
export function hapticTick(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
    }
  } catch {
    // Some browsers throw when called without a user gesture; haptics are decorative.
  }
}
