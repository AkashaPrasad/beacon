/**
 * Filters live in the shell's left rail by default (≥ lg; owner: "the sidebar on the left with all filters
 * was good"). "Unpin" moves them into a popover. Persisted per browser.
 */
import { useSyncExternalStore } from 'react';

import { readJson, writeJson } from '@/lib/storage';

const KEY = 'beacon:radar:filters-pinned';
let pinned = readJson<boolean>(KEY, true);
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
    () => true,
  );
}
