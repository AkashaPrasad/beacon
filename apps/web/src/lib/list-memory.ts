/**
 * List memory: the one "Back restores your place" mechanism for every list (UX restructure v2 §1.1,
 * D1). When a row opens its full page, the list remembers which row it was and where its scroll
 * containers were (sessionStorage, 30 min). Coming back with Back (a POP navigation) restores the
 * offsets, focuses that row without scrolling and flashes a 600 ms selection highlight (none under
 * reduced motion). Any other arrival (a link, the tab bar) or an older memory starts at the top.
 * Window scroll is restored by the router's <ScrollRestoration>; this covers inner scrollers (a
 * virtualised table, the tracker board) and the selected row.
 *
 *   // on open (before navigating; the row stays a real <a href>)
 *   rememberOpened('tracker', item.id, { board: boardRef.current });
 *   // in the list, once its rows render
 *   useListMemory('tracker', { ready: !loading, scrollers: { board: boardRef }, focus: (id) => `[data-item-id="${cssEscape(id)}"]` });
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useNavigationType } from 'react-router';

interface Memory {
  id: string;
  scroll: Record<string, { top: number; left: number }>;
  /** Window offset at open time. The router restores it too, but only once, and a browser clamps
   *  that restore when the list is still a short skeleton (WebKit does): re-applied once the data
   *  is ready so Back lands where the reader left off. */
  window?: { top: number; left: number };
  at: number;
}

/** Memories older than this are ignored (a Back an hour later should not jump around). */
const MAX_AGE_MS = 30 * 60_000;
const key = (list: string) => `beacon:list-memory:${list}`;

function read(list: string): Memory | null {
  try {
    const raw = sessionStorage.getItem(key(list));
    if (!raw) return null;
    const value = JSON.parse(raw) as Memory;
    return Date.now() - value.at < MAX_AGE_MS ? value : null;
  } catch {
    return null;
  }
}

function clear(list: string): void {
  try {
    sessionStorage.removeItem(key(list));
  } catch {
    /* storage blocked: nothing to clear */
  }
}

/** Call when a row opens its page (before navigating). */
export function rememberOpened(
  list: string,
  id: string,
  scrollers: Record<string, HTMLElement | null | undefined> = {},
): void {
  const scroll: Memory['scroll'] = {};
  for (const [name, el] of Object.entries(scrollers)) {
    if (el) scroll[name] = { top: el.scrollTop, left: el.scrollLeft };
  }
  try {
    sessionStorage.setItem(
      key(list),
      JSON.stringify({
        id,
        scroll,
        window: { top: window.scrollY, left: window.scrollX },
        at: Date.now(),
      } satisfies Memory),
    );
  } catch {
    /* storage blocked: Back still works, it just starts at the top */
  }
}

/**
 * Restores the remembered scroll positions and focuses the remembered row once `ready` (data
 * rendered) on a POP navigation. Any other arrival (a link, the tab bar) forgets the memory.
 */
export function useListMemory(
  list: string,
  {
    ready,
    scrollers = {},
    focus,
  }: {
    ready: boolean;
    scrollers?: Record<string, RefObject<HTMLElement | null>>;
    /** CSS selector for the remembered row's focus target. */
    focus?: (id: string) => string;
  },
): void {
  const navigationType = useNavigationType();
  const done = useRef(false);
  const scrollersRef = useRef(scrollers);
  const focusRef = useRef(focus);
  useEffect(() => {
    scrollersRef.current = scrollers;
    focusRef.current = focus;
  });

  useEffect(() => {
    if (done.current || !ready) return undefined;
    done.current = true;
    if (String(navigationType) !== 'POP') {
      clear(list);
      return undefined;
    }
    const memory = read(list);
    if (!memory) return undefined;
    clear(list);
    const restoreWindow = () => {
      if (memory.window) {
        window.scrollTo({ top: memory.window.top, left: memory.window.left, behavior: 'instant' });
      }
    };
    restoreWindow();
    for (const [name, pos] of Object.entries(memory.scroll)) {
      const el = scrollersRef.current[name]?.current;
      if (el) el.scrollTo({ top: pos.top, left: pos.left, behavior: 'instant' });
    }
    // Virtualised rows render a frame after the scroll position is set. Not cancelled on cleanup:
    // the memory is consumed once, and a StrictMode re-run must not lose the focus.
    requestAnimationFrame(() => {
      restoreWindow();
      const selector = focusRef.current?.(memory.id);
      const target = selector ? document.querySelector<HTMLElement>(selector) : null;
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      flashSelection(target);
    });
    return undefined;
  }, [ready, navigationType, list]);
}

function reducedMotion(): boolean {
  const pref = document.documentElement.dataset['motion'];
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 600 ms selection highlight on the restored row (accent-subtle fading out). */
function flashSelection(target: HTMLElement): void {
  if (reducedMotion() || typeof target.animate !== 'function') return;
  const tint = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-accent-subtle')
    .trim();
  if (!tint) return;
  target.animate([{ backgroundColor: tint }, { backgroundColor: 'transparent' }], {
    duration: 600,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  });
}

/** `CSS.escape` with a fallback for test environments. */
export function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}
