/**
 * Live insert for sources the user just added (MOTION §5.5): the new row enters once (`variants.row`)
 * and carries a 2 px `accent-strong` bar that fades out over 4 s. Keyed by the normalised URL, so the
 * optimistic row (temp id) and the saved row (server id) are the same entry: a remount when the id
 * swaps continues the fade from where it was instead of replaying the enter.
 */
import { tryNormaliseUrl } from '@kestrel/shared';

/** MOTION §5.5 "the 2 px accent-strong bar fades out over 4 s" (not in motion.ts; see DECISIONS). */
export const LIVE_INSERT_BAR_MS = 4_000;
/** A row mounted within this long after the add plays the enter; later remounts don't. */
const ENTER_WINDOW_MS = 400;

const added = new Map<string, number>();

/** Stable identity for a personal source URL (scheme, `www.`, tracking params and slash ignored). */
export function normaliseUrlKey(url: string): string {
  return tryNormaliseUrl(url) ?? url;
}

const keyOf = normaliseUrlKey;

export function markSourceJustAdded(url: string, at: number = Date.now()): void {
  added.set(keyOf(url), at);
}

/** Milliseconds since the source was added this session, or null. */
export function justAddedAge(url: string, now: number = Date.now()): number | null {
  const at = added.get(keyOf(url));
  if (at === undefined) return null;
  const age = now - at;
  if (age > LIVE_INSERT_BAR_MS) {
    added.delete(keyOf(url));
    return null;
  }
  return age;
}

export function shouldPlayEnter(age: number | null): boolean {
  return age !== null && age < ENTER_WINDOW_MS;
}

/** Remaining bar opacity (1 → 0 linearly over LIVE_INSERT_BAR_MS). */
export function barOpacity(age: number | null): number {
  if (age === null) return 0;
  return Math.max(0, 1 - age / LIVE_INSERT_BAR_MS);
}

export function clearSourceJustAdded(url: string): void {
  added.delete(keyOf(url));
}
