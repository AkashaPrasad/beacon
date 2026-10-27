import { useSyncExternalStore } from 'react';

import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';

/** Rail (left pane) collapsed-to-icons state, persisted per browser. `[` toggles it. */
let collapsed = readJson<boolean>(STORAGE_KEYS.rail, false);
const listeners = new Set<() => void>();

export function setRailCollapsed(next: boolean): void {
  collapsed = next;
  writeJson(STORAGE_KEYS.rail, next);
  listeners.forEach((l) => l());
}

export function toggleRail(): void {
  setRailCollapsed(!collapsed);
}

export function useRailCollapsed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => collapsed,
    () => false,
  );
}

// ── Shortcut sheet (`?`) and the mobile "Me" sheet ────────────────────────────────
type SheetName = 'shortcuts' | 'me' | null;
let sheet: SheetName = null;
const sheetListeners = new Set<() => void>();
export function openSheet(name: SheetName): void {
  sheet = name;
  sheetListeners.forEach((l) => l());
}
export function useOpenSheet(): SheetName {
  return useSyncExternalStore(
    (l) => {
      sheetListeners.add(l);
      return () => sheetListeners.delete(l);
    },
    () => sheet,
    () => null,
  );
}
