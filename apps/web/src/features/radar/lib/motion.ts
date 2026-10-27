/**
 * Radar-specific timing and the row ⇄ listing-page morph. Springs, tweens and variants come from
 * `@kestrel/ui` (docs/MOTION.md is authoritative); the few constants below are MOTION.md values
 * that have no shared token yet (recorded in docs/DECISIONS.md).
 */
import { flushSync } from 'react-dom';

import { layoutIds } from '@kestrel/ui';

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

/** Poll (timers: rendering is paused inside a View Transition update) until `ready()` or ~200 ms pass. */
function until(ready: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      if (ready() || tries++ > 24) resolve();
      else setTimeout(check, 8);
    };
    check();
  });
}

const PARTS = ['logo', 'title', 'ring'] as const;

function rowParts(id: string): (readonly [MorphPart, HTMLElement])[] {
  const row = document.querySelector<HTMLElement>(
    `[data-testid="radar-row"][data-listing-id="${CSS.escape(id)}"], [data-testid="radar-board-card"][data-listing-id="${CSS.escape(id)}"]`,
  );
  if (!row) return [];
  return PARTS.map((part) => [part, row.querySelector<HTMLElement>(`[data-vt="${part}"]`)] as const).filter(
    (entry): entry is readonly [MorphPart, HTMLElement] => entry[1] != null,
  );
}

function name(parts: readonly (readonly [MorphPart, HTMLElement])[], id: string | null) {
  for (const [part, el] of parts) el.style.viewTransitionName = id ? viewTransitionName(part, id) : '';
}

/**
 * Open the listing page for `id`, morphing the row's logo, title and ring into the page header when
 * the browser supports View Transitions (MOTION §5.6 shared element; progressive enhancement). The
 * row and the page are never on screen together, so the names move from one to the other inside the
 * transition. `open` may return a promise (router navigation); the new snapshot waits for the page.
 */
export function openWithMorph(_rowEl: HTMLElement | null, id: string, open: () => void | Promise<void>): void {
  const parts = canMorph() && matchMedia('(min-width: 768px)').matches ? rowParts(id) : [];
  if (!parts.length) {
    void open();
    return;
  }
  name(parts, id);
  try {
    const transition = document.startViewTransition(async () => {
      name(parts, null);
      flushSync(() => setMorphing(id));
      await open();
      await until(() => Boolean(document.querySelector('[data-testid="listing-page"]')));
    });
    void transition.finished.finally(() => setMorphing(null));
  } catch {
    name(parts, null);
    setMorphing(null);
    void open();
  }
}

/**
 * Back from the listing page: the page header morphs back into its row (once the list has restored
 * its scroll position and the row is mounted). Falls back to a plain navigation.
 */
export function closeWithMorph(id: string, close: () => void | Promise<void>): void {
  if (!canMorph() || !matchMedia('(min-width: 768px)').matches) {
    void close();
    return;
  }
  flushSync(() => setMorphing(id));
  let parts: (readonly [MorphPart, HTMLElement])[] = [];
  try {
    const transition = document.startViewTransition(async () => {
      flushSync(() => setMorphing(null));
      await close();
      await until(() => {
        const found = rowParts(id);
        if (found.length && found[0]![1].offsetParent !== null) {
          parts = found;
          return true;
        }
        return false;
      });
      name(parts, id);
    });
    void transition.finished.finally(() => name(parts, null));
  } catch {
    setMorphing(null);
    void close();
  }
}
