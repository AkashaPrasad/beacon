/**
 * What the radar list shows, as pure functions over the cached feed pages:
 * - de-duplicated by listing id across pages (ranks can shift between page requests),
 * - hidden rows dropped (unless "Show hidden"), except rows still playing their exit animation,
 * - "New since last visit" narrowed client-side (the API has no first-seen filter),
 * - live inserts held back while the user is reading (scrolled or keyboard cursor set), so the list
 *   never jumps under them; the held rows surface behind a "N new fits · Show" pill (MOTION §5.5).
 */
import type { FeedItemDTO, FeedResponse } from '@/api/types';

export function dedupeFeedItems(pages: readonly Pick<FeedResponse, 'items'>[] | undefined): FeedItemDTO[] {
  if (!pages?.length) return [];
  const seen = new Set<string>();
  const out: FeedItemDTO[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.listing.id)) continue;
      seen.add(item.listing.id);
      out.push(item);
    }
  }
  return out;
}

export interface VisibleOptions {
  showHidden: boolean;
  /** Rows mid-exit (a hide was just made): kept on screen for the 120 ms exit. */
  leaving: ReadonlySet<string>;
  /** "New since last visit": only rows first seen after this. */
  newSince: Date | null;
}

export function visibleFeedItems(items: readonly FeedItemDTO[], { showHidden, leaving, newSince }: VisibleOptions): FeedItemDTO[] {
  return items.filter((item) => {
    if (item.hidden && !showHidden && !leaving.has(item.listing.id)) return false;
    if (newSince && !(item.listing.firstSeenAt > newSince)) return false;
    return true;
  });
}

/** Hidden rows still in the cache (hidden after the page was fetched): the total excludes them. */
export function locallyHiddenCount(items: readonly FeedItemDTO[], showHidden: boolean): number {
  if (showHidden) return 0;
  let n = 0;
  for (const item of items) if (item.hidden) n += 1;
  return n;
}

export interface LiveHoldInput {
  /** Ids on screen after the previous render. */
  previous: readonly string[];
  /** Ids the data says should be on screen now. */
  next: readonly string[];
  /** The held order, if rows are being held. */
  held: readonly string[] | null;
  /** Same filters as the previous render (a filter change always shows the new list). */
  sameList: boolean;
  /** The user is reading: scrolled down, or the keyboard cursor is on a row. */
  reading: boolean;
}

export interface LiveHoldResult {
  display: string[];
  held: string[] | null;
  /** New rows waiting above the reader (the pill count). */
  queued: number;
}

/**
 * Decide the on-screen order. New ids that land above rows already on screen are inserted in place
 * when the reader is at the top (they animate in as live rows); otherwise the previous order is kept,
 * rows appended after it (the next page) still show, and the inserts are counted as queued.
 */
export function applyLiveHold({ previous, next, held, sameList, reading }: LiveHoldInput): LiveHoldResult {
  if (!sameList) return { display: [...next], held: null, queued: 0 };
  const base = held ?? previous;
  const baseSet = new Set(base);
  const nextIndex = new Map(next.map((id, index) => [id, index] as const));
  let lastBase = -1;
  for (const id of base) {
    const index = nextIndex.get(id);
    if (index != null && index > lastBase) lastBase = index;
  }
  const insertedAbove = next.filter((id, index) => !baseSet.has(id) && index < lastBase);
  if (insertedAbove.length === 0 || (!reading && !held)) {
    return { display: [...next], held: null, queued: 0 };
  }
  const kept = base.filter((id) => nextIndex.has(id));
  const appended = next.filter((id, index) => !baseSet.has(id) && index > lastBase);
  return { display: [...kept, ...appended], held: kept, queued: insertedAbove.length };
}
