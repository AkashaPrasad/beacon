/**
 * Filters live in a popover by default; "Pin as a sidebar" turns them into the shell's left rail
 * (≥ lg). Persisted per browser.
 */
import { useSyncExternalStore } from 'react';

import { readJson, writeJson } from '@/lib/storage';

const KEY = 'beacon:radar:filters-pinned';
let pinned = readJson<boolean>(KEY, false);
const listeners = new Set<() => void>();

export function setFiltersPinned(next: boolean): void {
  pinned = next;
  writeJson(KEY, next);
  listeners.forEach((l) => l());
}

export function useFiltersPinned(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pinned,
    () => false,
  );
}
