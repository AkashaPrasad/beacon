/**
 * Per-device nudge snoozes ("Snooze 3 days", "I followed up", "Keep waiting"; USERFLOW §4.2/§4.3).
 * The API has no nudge write route yet (SHARED-REQUESTS web-workspace → api), so these live in
 * localStorage, keyed by tracker item id, pruned when they expire.
 */
import { useSyncExternalStore } from 'react';

import { readJson, writeJson } from '@/lib/storage';

import type { Snooze } from './nudges';

export const SNOOZES_KEY = 'beacon:tracker:snoozes';

type SnoozeMap = Record<string, Snooze[]>;

const listeners = new Set<() => void>();
let cache: SnoozeMap | null = null;

function read(): SnoozeMap {
  cache ??= prune(readJson<SnoozeMap>(SNOOZES_KEY, {}), new Date());
  return cache;
}

/** Drop expired snoozes and empty entries (pure). */
export function prune(map: SnoozeMap, now: Date): SnoozeMap {
  const out: SnoozeMap = {};
  for (const [id, list] of Object.entries(map)) {
    const live = (Array.isArray(list) ? list : []).filter((s) => {
      const until = new Date(s.until).getTime();
      return Number.isFinite(until) && until > now.getTime();
    });
    if (live.length) out[id] = live;
  }
  return out;
}

function write(next: SnoozeMap) {
  cache = next;
  writeJson(SNOOZES_KEY, next);
  listeners.forEach((l) => l());
}

export function addSnooze(itemId: string, snooze: Snooze): void {
  const map = read();
  write({ ...map, [itemId]: [...(map[itemId] ?? []), { ...snooze, until: new Date(snooze.until).toISOString() }] });
}

/** Undo for the last snooze of an item. */
export function removeSnooze(itemId: string, snooze: Snooze): void {
  const map = read();
  const until = new Date(snooze.until).toISOString();
  const list = (map[itemId] ?? []).filter((s) => !(s.kind === snooze.kind && new Date(s.until).toISOString() === until));
  const next = { ...map };
  if (list.length) next[itemId] = list;
  else delete next[itemId];
  write(next);
}

export function snoozesFor(itemId: string): Snooze[] {
  return read()[itemId] ?? [];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live snooze map (re-renders when a snooze is added or removed). */
export function useSnoozes(): SnoozeMap {
  return useSyncExternalStore(subscribe, read, read);
}

/** Test helper. */
export function resetSnoozes(): void {
  cache = null;
}
