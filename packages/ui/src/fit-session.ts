import { createOnceTracker } from './motion';

/** Listing ids whose fit ring already filled this session (MOTION §5.9: first view only). */
export const fitRingOnce = createOnceTracker();

/** Test hook: forget which rings already animated. */
export function resetFitRingSession(): void {
  fitRingOnce.reset();
}
