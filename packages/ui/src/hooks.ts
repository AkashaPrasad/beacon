import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

// ── Reduced motion: OS preference unless <html data-motion> overrides it ─────────────────────────

function readReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  const attr = document.documentElement.getAttribute('data-motion');
  if (attr === 'reduced') return true;
  if (attr === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const mq =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', onChange);
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(onChange) : null;
  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  });
  return () => {
    mq?.removeEventListener('change', onChange);
    observer?.disconnect();
  };
}

/** True when motion should be reduced (OS setting or Settings > Appearance > Motion). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

// ── A clock that re-renders every `intervalMs` (one shared timer per interval) ─────────────────────

interface ClockStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
}

const clocks = new Map<number, ClockStore>();

function createClock(intervalMs: number): ClockStore {
  let now = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(onChange) {
      listeners.add(onChange);
      if (!timer) {
        now = Date.now();
        timer = setInterval(() => {
          now = Date.now();
          listeners.forEach((listener) => listener());
        }, intervalMs);
      }
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => now,
  };
}

function clockFor(intervalMs: number): ClockStore {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = createClock(intervalMs);
    clocks.set(intervalMs, clock);
  }
  return clock;
}

const frozen: ClockStore = { subscribe: () => () => undefined, getSnapshot: () => 0 };

/** Current time, refreshed every `intervalMs` (default 60 s). Pass `fixed` to freeze it (demo/tests). */
export function useNow(intervalMs = 60_000, fixed?: Date): Date {
  const clock = fixed ? frozen : clockFor(intervalMs);
  const value = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  return useMemo(() => fixed ?? new Date(value), [fixed, value]);
}

/** Becomes true after `delayMs` (used so skeletons never flash for fast loads). */
export function useDelayedTrue(delayMs: number): boolean {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return undefined;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return visible;
}

// ── Platform ───────────────────────────────────────────────────────────────────────────────

function readIsApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /Mac OS X/.test(navigator.userAgent);
}

/** True on macOS/iOS (⌘ instead of Ctrl). SSR snapshot is false, so hydration never mismatches. */
export function useIsApple(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    readIsApple,
    () => false,
  );
}
