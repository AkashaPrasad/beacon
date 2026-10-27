/**
 * Command palette registry. Screens contribute items while mounted:
 *
 *   useCommandItems(() => [
 *     { id: 'radar.view.list', group: 'Views', label: 'List view', shortcut: '1', perform: () => setView('list') },
 *   ], [setView]);
 *
 * Open/close from anywhere with `openPalette()` / `closePalette()` (⌘K / Ctrl K is wired by the shell).
 */
import type { LucideIcon } from 'lucide-react';
import { useEffect, useSyncExternalStore, type DependencyList } from 'react';

import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';

export type CommandGroup =
  'Listings' | 'Recent' | 'Go to' | 'Actions' | 'Views' | 'Settings' | (string & {});

export interface CommandItem {
  /** Unique, stable id (`<feature>.<action>`). Later registrations with the same id replace earlier ones. */
  id: string;
  group: CommandGroup;
  label: string;
  /** Extra search terms (synonyms). */
  keywords?: string[];
  icon?: LucideIcon;
  /** Shown as Kbd on the right and exposed via `aria-keyshortcuts` (e.g. "g r", "mod+k", "s"). */
  shortcut?: string;
  /** Secondary text (company, path…). */
  hint?: string;
  perform: () => void;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const sources = new Map<number, CommandItem[]>();
let nextToken = 1;
let snapshot: readonly CommandItem[] = [];
let open = false;
let initialQuery = '';

function emit() {
  const byId = new Map<string, CommandItem>();
  for (const items of sources.values()) for (const item of items) byId.set(item.id, item);
  snapshot = [...byId.values()];
  listeners.forEach((l) => l());
}

export function registerCommandItems(items: CommandItem[]): () => void {
  const token = nextToken++;
  sources.set(token, items);
  emit();
  return () => {
    sources.delete(token);
    emit();
  };
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCommandItemsSnapshot(): readonly CommandItem[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** Register palette items for the lifetime of the calling component. */
export function useCommandItems(factory: () => CommandItem[], deps: DependencyList): void {
  useEffect(() => registerCommandItems(factory()), deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Open state ──────────────────────────────────────────────────────────────────

export function openPalette(query = ''): void {
  initialQuery = query;
  open = true;
  listeners.forEach((l) => l());
}

export function closePalette(): void {
  open = false;
  listeners.forEach((l) => l());
}

export function togglePalette(): void {
  if (open) closePalette();
  else openPalette();
}

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

export function takeInitialQuery(): string {
  const q = initialQuery;
  initialQuery = '';
  return q;
}

// ── Recent listings (palette "Recent" group) ────────────────────────────────────

export interface RecentListing {
  id: string;
  title: string;
  company: string;
}

/** Call when a listing's detail is opened. Keeps the last 8, newest first. */
export function rememberRecentListing(listing: RecentListing): void {
  const current = readJson<RecentListing[]>(STORAGE_KEYS.recentListings, []);
  writeJson(
    STORAGE_KEYS.recentListings,
    [listing, ...current.filter((l) => l.id !== listing.id)].slice(0, 8),
  );
}

export function readRecentListings(): RecentListing[] {
  return readJson<RecentListing[]>(STORAGE_KEYS.recentListings, []);
}
