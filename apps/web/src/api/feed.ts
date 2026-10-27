import { keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import { api, type QueryParams } from '@/lib/api';

import type { FeedFilters, FeedItemDTO, FeedResponse, FeedSummary } from './types';

/** A feed row (`GET /v1/feed` item). */
export type FeedItem = FeedItemDTO;
export type FeedPages = InfiniteData<FeedResponse, string | null>;

/**
 * Feed query keys. Lists are `['feed', 'list', filters]`; invalidate `feedKeys.all` after anything that
 * changes ranking (profile, weights, sources), `feedKeys.summary()` after save/hide.
 */
export const feedKeys = {
  all: ['feed'] as const,
  lists: () => ['feed', 'list'] as const,
  list: (filters: FeedFilters) => ['feed', 'list', filters] as const,
  summary: () => ['feed', 'summary'] as const,
};

export function feedQueryParams(filters: FeedFilters): QueryParams {
  return { ...filters } as QueryParams;
}

export function fetchFeedPage(filters: FeedFilters, cursor: string | null, signal?: AbortSignal) {
  return api.get<FeedResponse>('/v1/feed', {
    signal,
    query: { ...feedQueryParams(filters), cursor: cursor ?? undefined },
  });
}

/**
 * Infinite, cursor-paginated radar feed (API §6). Rows: `data.pages.flatMap((p) => p.items)`;
 * `warmingUp` is on every page. Filters are part of the key; the previous result stays on screen while
 * a new filter loads (no flash).
 */
export function useFeed(filters: FeedFilters = {}, options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: feedKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchFeedPage(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useFeedSummary(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: feedKeys.summary(),
    queryFn: ({ signal }) => api.get<FeedSummary>('/v1/feed/summary', { signal }),
    enabled: options.enabled ?? true,
  });
}

/** First cached feed row for a listing across every feed list in the cache. */
export function findFeedItem(qc: QueryClient, listingId: string): FeedItem | undefined {
  for (const [, data] of qc.getQueriesData<FeedPages>({ queryKey: feedKeys.lists() })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((item) => item.listing.id === listingId);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Update one listing's row in every cached feed list (optimistic updates; immutable). */
export function patchFeedItem(qc: QueryClient, listingId: string, update: (item: FeedItem) => FeedItem): void {
  for (const [key, data] of qc.getQueriesData<FeedPages>({ queryKey: feedKeys.lists() })) {
    if (!data?.pages) continue;
    let changed = false;
    const pages = data.pages.map((page) => {
      if (!page.items.some((item) => item.listing.id === listingId)) return page;
      changed = true;
      return { ...page, items: page.items.map((item) => (item.listing.id === listingId ? update(item) : item)) };
    });
    if (changed) qc.setQueryData<FeedPages>(key, { ...data, pages });
  }
}
