/**
 * Radar-specific timing and the row → drawer morph. Springs, tweens and variants come from
 * `@kestrel/ui` (docs/MOTION.md is authoritative); the few constants below are MOTION.md values
 * that have no shared token yet (recorded in docs/DECISIONS.md).
 */
import { layoutIds } from '@kestrel/ui';
import { flushSync } from 'react-dom';

/** MOTION §5.5: the live-insert bar fades out over 4 s. */
export const LIVE_BAR_FADE_MS = 4000;
/** MOTION §5.5: rows below a removed row glide up while `data-settling` is set (300 ms). */
export const SETTLE_MS = 300;
/** MOTION §5.7 / DESIGN §6.1: skeletons appear after 150 ms and then stay at least 300 ms. */
export const SKELETON_DELAY_MS = 150;
export const SKELETON_MIN_MS = 300;
/** MOTION §4: a shortcut's on-screen control shows its press state for 100 ms. */
export const ECHO_MS = 100;
/** USERFLOW §1.7: warming-up summary poll. */
export const WARMING_POLL_MS = 10_000;

// ── Row enter bookkeeping (MOTION §5.5: once per session per id) ────────────

const entered = new Set<string>();

/** True once a row has played (or skipped) its enter animation this session. */
export function hasEntered(id: string): boolean {
  return entered.has(id);
}

/** Called from effects (after commit), never during render. */
export function markEntered(ids: Iterable<string>): void {
  for (const id of ids) entered.add(id);
}

/** Test hook. */
export function resetEntered(): void {
  entered.clear();
}

// ── Row → drawer morph (MOTION §5.6: View Transition, progressive enhancement) ──

type MorphPart = 'logo' | 'title' | 'ring';
const NAME: Record<MorphPart, (id: string) => string> = {
  logo: layoutIds.listingLogo,
  title: layoutIds.listingTitle,
  ring: layoutIds.listingRing,
};

let morphingId: string | null = null;
const listeners = new Set<() => void>();

/** The listing whose drawer header should carry the shared names right now (null otherwise). */
export function getMorphingId(): string | null {
  return morphingId;
}

export function subscribeMorph(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setMorphing(id: string | null) {
  morphingId = id;
  listeners.forEach((l) => l());
}

/** CSS-safe `view-transition-name` (listing ids are hex, but fixtures may contain other characters). */
export function viewTransitionName(part: MorphPart, id: string): string {
  return NAME[part](id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function canMorph(): boolean {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return false;
  const root = document.documentElement;
  if (root.getAttribute('data-motion') === 'reduced') return false;
  if (root.getAttribute('data-motion') !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  return true;
}

/**
 * Open the drawer for `id`, morphing the row's logo, title and ring into the drawer header when the
 * browser supports View Transitions. `open` must update state synchronously (it runs in flushSync).
 */
export function openWithMorph(rowEl: HTMLElement | null, id: string, open: () => void): void {
  if (!rowEl || !canMorph()) {
    open();
    return;
  }
  const parts = (['logo', 'title', 'ring'] as const)
    .map((part) => [part, rowEl.querySelector<HTMLElement>(`[data-vt="${part}"]`)] as const)
    .filter((entry): entry is readonly [MorphPart, HTMLElement] => entry[1] != null);
  for (const [part, el] of parts) el.style.viewTransitionName = viewTransitionName(part, id);
  try {
    const transition = document.startViewTransition(() => {
      for (const [, el] of parts) el.style.viewTransitionName = '';
      flushSync(() => {
        setMorphing(id);
        open();
      });
    });
    void transition.finished.finally(() => setMorphing(null));
  } catch {
    for (const [, el] of parts) el.style.viewTransitionName = '';
    setMorphing(null);
    open();
  }
}
