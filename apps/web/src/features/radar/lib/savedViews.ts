/**
 * Saved radar views: a name + the radar's search string, kept in localStorage (per browser) and
 * exposed in the filter rail and the command palette ("Views"). Pure store + a React hook.
 */
import { useSyncExternalStore } from 'react';

import { readJson, writeJson } from '@/lib/storage';

export const SAVED_VIEWS_KEY = 'beacon:radar:saved-views';
const MAX_VIEWS = 20;

export interface SavedView {
  id: string;
  name: string;
  /** URLSearchParams string (filters + view), without the listing id. */
  search: string;
  createdAt: number;
}

let views: SavedView[] = readJson<SavedView[]>(SAVED_VIEWS_KEY, []).filter(
  (v) => v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.search === 'string',
);
const listeners = new Set<() => void>();

function commit(next: SavedView[]) {
  views = next;
  writeJson(SAVED_VIEWS_KEY, next);
  listeners.forEach((l) => l());
}

export function listSavedViews(): readonly SavedView[] {
  return views;
}

/** Saves (or renames, when the same search already exists) a view; newest first. */
export function saveView(name: string, search: string): SavedView {
  const clean = name.trim().slice(0, 60) || 'Untitled view';
  const existing = views.find((v) => v.search === search);
  if (existing) {
    const updated = { ...existing, name: clean };
    commit([updated, ...views.filter((v) => v.id !== existing.id)]);
    return updated;
  }
  const view: SavedView = {
    id: `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    search,
    createdAt: Date.now(),
  };
  commit([view, ...views].slice(0, MAX_VIEWS));
  return view;
}

export function deleteView(id: string): SavedView | undefined {
  const removed = views.find((v) => v.id === id);
  commit(views.filter((v) => v.id !== id));
  return removed;
}

/** Re-insert a deleted view at its old position (undo). */
export function restoreView(view: SavedView, index = 0): void {
  if (views.some((v) => v.id === view.id)) return;
  const next = [...views];
  next.splice(Math.min(index, next.length), 0, view);
  commit(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSavedViews(): readonly SavedView[] {
  return useSyncExternalStore(subscribe, listSavedViews, listSavedViews);
}

/** Test hook. */
export function resetSavedViews(): void {
  commit([]);
}
