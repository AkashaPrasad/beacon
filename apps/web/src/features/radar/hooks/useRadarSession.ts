/**
 * Small session hooks for the radar screen, written as "derive state while rendering" or
 * timer-driven updates (no synchronous setState in effects, no ref reads during render), so the
 * React Compiler rules hold and nothing cascades into extra renders.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { applyLiveHold, type LiveHoldResult } from '../lib/feedItems';

/** The `lastSeenFeedAt` the user arrived with (the server value moves once we mark the visit seen). */
export function useArrivalLastSeen(loaded: boolean, lastSeen: Date | null): Date | null {
  const [arrival, setArrival] = useState<{ lastSeen: Date | null } | null>(null);
  if (arrival === null && loaded) {
    const value = { lastSeen };
    setArrival(value);
    return value.lastSeen;
  }
  return arrival?.lastSeen ?? null;
}

/**
 * Warming-up phases (USERFLOW §1.7): `slow` after 30 s, and a "Radar ready" strip for 8 s once the
 * ranking finishes during this visit.
 */
export function useWarmingPhase(warming: boolean, { slowAfterMs, readyForMs }: { slowAfterMs: number; readyForMs: number }) {
  const [previous, setPrevious] = useState(warming);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  if (previous !== warming) {
    setPrevious(warming);
    setReady(previous && !warming);
  }
  useEffect(() => {
    if (!warming) return undefined;
    const t = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(t);
  }, [warming, slowAfterMs]);
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => setReady(false), readyForMs);
    return () => clearTimeout(t);
  }, [ready, readyForMs]);
  return { slow: warming && slow, showReady: !warming && ready, dismissReady: () => setReady(false) };
}

/** True once the window has scrolled past `threshold` px (passive listener, updates on change only). */
export function useScrolledPast(threshold: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const read = () => setPast(window.scrollY > threshold);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, [threshold]);
  return past;
}

/** A function identity that never changes but always calls the latest `fn` (keeps memoised rows memoised). */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

interface HoldState extends LiveHoldResult {
  key: string;
  next: readonly string[];
  tick: number;
}

/**
 * The on-screen order with live inserts held while the user reads (see `applyLiveHold`). `release()`
 * (the "N new fits · Show" pill) lets the held rows in.
 */
export function useLiveHold(next: readonly string[], listKey: string, reading: boolean) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<HoldState>(() => ({
    key: listKey,
    next,
    tick: 0,
    display: [...next],
    held: null,
    queued: 0,
  }));
  if (state.next !== next || state.key !== listKey || state.tick !== tick) {
    const released = state.tick !== tick;
    const result = applyLiveHold({
      previous: state.display,
      next,
      held: released ? null : state.held,
      sameList: state.key === listKey && !released,
      reading,
    });
    const value = { key: listKey, next, tick, ...result };
    setState(value);
    return { ...result, release: () => setTick((n) => n + 1) };
  }
  return { display: state.display, held: state.held, queued: state.queued, release: () => setTick((n) => n + 1) };
}
