/**
 * Tour state: whether the first-run tour is owed (per user, localStorage), and the live run (module
 * store, so the user menu, the palette and the Radar's `<SpotlightTour />` share it).
 */
import { useSyncExternalStore } from 'react';

import { readJson, removeKey, writeJson } from '@/lib/storage';

const statusKey = (userId: string) => `beacon:tour:${userId}`;
const REPLAY_KEY = 'beacon:tour:replay';

export type TourStatus = 'pending' | 'done' | null;

export function tourStatus(userId: string): TourStatus {
  const v = readJson<string | null>(statusKey(userId), null);
  return v === 'pending' || v === 'done' ? v : null;
}

/** Called when onboarding finishes: the next Radar visit starts the tour. */
export function requestFirstRunTour(userId: string): void {
  if (tourStatus(userId) !== 'done') writeJson(statusKey(userId), 'pending');
}

export function markTourDone(userId: string): void {
  writeJson(statusKey(userId), 'done');
}

/** "Show me around" from another page: the Radar picks this up on mount. */
export function requestReplay(): void {
  try {
    sessionStorage.setItem(REPLAY_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function takeReplayRequest(): boolean {
  try {
    const v = sessionStorage.getItem(REPLAY_KEY) === '1';
    sessionStorage.removeItem(REPLAY_KEY);
    return v;
  } catch {
    return false;
  }
}

export function resetTourForTests(userId: string): void {
  removeKey(statusKey(userId));
}

interface RunState {
  active: boolean;
  index: number;
}

let run: RunState = { active: false, index: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: RunState) {
  run = next;
  emit();
}

export const tourRun = {
  get: () => run,
  start: () => set({ active: true, index: 0 }),
  stop: () => set({ active: false, index: 0 }),
  go: (index: number) => set({ active: true, index }),
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useTourRun(): RunState {
  return useSyncExternalStore(tourRun.subscribe, tourRun.get, tourRun.get);
}

/** True while the tour runs (coach marks stay quiet). */
export function isTourActive(): boolean {
  return run.active;
}
