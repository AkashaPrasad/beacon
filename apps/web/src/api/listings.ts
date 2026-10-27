/**
 * Listing detail and listing actions (docs/API.md §6–§7). Owned by the radar screens; this is the
 * only module defining `useListing`, `useSaveListing`, `useHideListing`, `useExplain` and
 * `useTrackListing` (docs/WEB.md data layer).
 *
 *   GET  /v1/listings/:id                     → ListingDetail (drawer)
 *   POST /v1/listings/:id/{save,unsave}       → saved flag
 *   POST /v1/listings/:id/{hide,unhide}       → hidden flag (the row keeps its slot, so Undo restores it in place)
 *   POST /v1/listings/:id/explain             → why / gaps / tailoring tips (deterministic when AI is off)
 *   POST /v1/tracker { listingId, stage }     → Add to tracker as Saved; undo = DELETE /v1/tracker/:id
 *
 * Every mutation is optimistic: every cached feed page and the detail query change first, the request
 * follows, and a failure restores the snapshot. Undo toasts are composed by the UI with `withUndo`.
 *
 * The cache helpers below only rely on the `['feed', …]` key prefix and the `{ pages: [{ items }] }`
 * infinite-query shape, so they keep working however the feed module names its keys.
 */
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { api, isApiError } from '@/lib/api';

import type {
  Explanation,
  FeedItemDTO,
  FeedResponse,
  InteractionResponse,
  ListingDetail,
  TrackerItemDTO,
} from './types';

export type { Explanation, ListingDetail };

const FEED_PREFIX = ['feed'] as const;

export const listingKeys = {
  all: ['listing'] as const,
  detail: (id: string) => ['listing', id] as const,
  explain: (id: string) => ['listing', id, 'explain'] as const,
};

const enc = encodeURIComponent;

// ── Cache helpers ────────────────────────────────────────────────────────────

type FeedData = InfiniteData<FeedResponse>;
type Patch = Partial<Pick<FeedItemDTO, 'saved' | 'hidden' | 'trackerItemId'>>;
type Snapshot = [QueryKey, unknown][];

function isFeedData(data: unknown): data is FeedData {
  return Boolean(data && typeof data === 'object' && Array.isArray((data as FeedData).pages));
}

/** A cached feed row for `id`, from any feed query (drawer placeholder, toasts, palette). */
export function findCachedListing(qc: QueryClient, id: string): FeedItemDTO | undefined {
  for (const [, data] of qc.getQueriesData({ queryKey: FEED_PREFIX })) {
    if (!isFeedData(data)) continue;
    for (const page of data.pages) {
      const hit = page.items.find((item) => item.listing.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Patch one listing in every feed page and the detail query; returns a rollback snapshot. */
function patchEverywhere(qc: QueryClient, id: string, patch: Patch): Snapshot {
  const snapshot: Snapshot = [];
  for (const [key, data] of qc.getQueriesData({ queryKey: FEED_PREFIX })) {
    if (!isFeedData(data)) continue;
    if (!data.pages.some((page) => page.items.some((item) => item.listing.id === id))) continue;
    snapshot.push([key, data]);
    qc.setQueryData<FeedData>(key, {
      ...data,
      pages: data.pages.map((page) =>
        page.items.some((item) => item.listing.id === id)
          ? { ...page, items: page.items.map((item) => (item.listing.id === id ? { ...item, ...patch } : item)) }
          : page,
      ),
    });
  }
  const detailKey = listingKeys.detail(id);
  const detail = qc.getQueryData<ListingDetail>(detailKey);
  if (detail) {
    snapshot.push([detailKey, detail]);
    qc.setQueryData<ListingDetail>(detailKey, { ...detail, ...patch });
  }
  return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined): void {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}

async function cancelFor(qc: QueryClient, id: string): Promise<void> {
  await Promise.all([
    qc.cancelQueries({ queryKey: FEED_PREFIX }),
    qc.cancelQueries({ queryKey: listingKeys.detail(id), exact: true }),
  ]);
}

// ── Detail ───────────────────────────────────────────────────────────────────

/** A detail-shaped placeholder from a feed row, so the drawer header renders on the first frame. */
export function listingDetailFromFeedItem(item: FeedItemDTO): ListingDetail {
  const skills = item.fit?.details.skills;
  return {
    listing: item.listing,
    descriptionHtml: '',
    fit: item.fit,
    matchedSkills: skills ? [...skills.matchedRequired, ...skills.matchedNice] : [],
    missingSkills: skills ? [...skills.missingRequired, ...skills.missingNice] : [],
    saved: item.saved,
    hidden: item.hidden,
    trackerItemId: item.trackerItemId,
    source: null,
    applyLinkHealth: { status: 'unknown', httpStatus: null, checkedAt: null, reasons: [] },
    similar: [],
  };
}

export function fetchListing(id: string, signal?: AbortSignal): Promise<ListingDetail> {
  return api.get<ListingDetail>(`/v1/listings/${enc(id)}`, { signal });
}

/** Detail for the drawer (`/radar/:listingId`). Placeholder = the cached feed row. */
export function useListing(id: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery<ListingDetail, Error, ListingDetail, ReturnType<typeof listingKeys.detail>>({
    queryKey: listingKeys.detail(id ?? ''),
    queryFn: ({ signal }) => fetchListing(id!, signal),
    enabled: Boolean(id),
    staleTime: 60_000,
    placeholderData: () => {
      const hit = id ? findCachedListing(qc, id) : undefined;
      return hit ? listingDetailFromFeedItem(hit) : undefined;
    },
  });
}

/**
 * Ids of listings whose save/hide/track write is queued while offline (`isPaused`). Rows show
 * `data-pending="true"` plus an sr-only "Waiting to sync" (MOTION §5.18 pending dot).
 */
export function usePendingListingIds(): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey: ['listing'], predicate: (mutation) => mutation.state.isPaused },
    select: (mutation) => {
      const vars = mutation.state.variables as { id?: string; listingId?: string } | undefined;
      return vars?.id ?? vars?.listingId ?? null;
    },
  });
  const key = ids.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Set(ids.filter((id): id is string => Boolean(id))), [key]);
}

/** Warm the drawer on hover/focus (BRIEF addendum: prefetch on hover/focus). No-op while fresh. */
export function prefetchListing(qc: QueryClient, id: string): void {
  void qc.prefetchQuery({
    queryKey: listingKeys.detail(id),
    queryFn: ({ signal }) => fetchListing(id, signal),
    staleTime: 60_000,
  });
}

/** Why it fits / gaps / tailoring tips. Cached server-side per profile; the limiter is 30/hour. */
export function useExplain(id: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: listingKeys.explain(id ?? ''),
    queryFn: ({ signal }) =>
      api.post<Explanation>(`/v1/listings/${enc(id!)}/explain`, undefined, { signal, timeoutMs: 30_000 }),
    enabled: Boolean(id) && enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    meta: { persist: false },
  });
}

// ── Save / hide ──────────────────────────────────────────────────────────────

function useFlag(flag: 'saved' | 'hidden', on: 'save' | 'hide', off: 'unsave' | 'unhide') {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['listing', flag],
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      api.post<InteractionResponse>(`/v1/listings/${enc(id)}/${value ? on : off}`),
    onMutate: async ({ id, value }) => {
      await cancelFor(qc, id);
      return { snapshot: patchEverywhere(qc, id, { [flag]: value }) };
    },
    onError: (_error, _vars, context) => restore(qc, context?.snapshot),
    onSettled: () => void qc.invalidateQueries({ queryKey: [...FEED_PREFIX, 'summary'] }),
  });
}

/** `mutate({ id, saved })`. */
export function useSaveListing() {
  const m = useFlag('saved', 'save', 'unsave');
  return {
    ...m,
    mutate: (vars: { id: string; saved: boolean }) => m.mutate({ id: vars.id, value: vars.saved }),
    mutateAsync: (vars: { id: string; saved: boolean }) => m.mutateAsync({ id: vars.id, value: vars.saved }),
  };
}

/** `mutate({ id, hidden })`. */
export function useHideListing() {
  const m = useFlag('hidden', 'hide', 'unhide');
  return {
    ...m,
    mutate: (vars: { id: string; hidden: boolean }) => m.mutate({ id: vars.id, value: vars.hidden }),
    mutateAsync: (vars: { id: string; hidden: boolean }) => m.mutateAsync({ id: vars.id, value: vars.hidden }),
  };
}

// ── Add to tracker ───────────────────────────────────────────────────────────

/** Stored in `trackerItemId` while the create request is in flight. */
export const PENDING_TRACKER_ID = 'pending';

export interface TrackVariables {
  listingId: string;
  /** Undo: delete this tracker item instead of creating one. */
  untrackItemId?: string;
}

/** Resolves to the tracker item id (null after an untrack). A 409 adopts the existing item. */
export function useTrackListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['listing', 'track'],
    mutationFn: async ({ listingId, untrackItemId }: TrackVariables): Promise<string | null> => {
      if (untrackItemId) {
        await api.delete<void>(`/v1/tracker/${enc(untrackItemId)}`);
        return null;
      }
      try {
        const res = await api.post<{ item: TrackerItemDTO }>('/v1/tracker', { listingId, stage: 'saved' });
        return res.item.id;
      } catch (error) {
        const existing = isApiError(error) ? (error.details as { existingId?: string } | undefined)?.existingId : undefined;
        if (isApiError(error) && error.status === 409 && existing) return existing;
        throw error;
      }
    },
    onMutate: async ({ listingId, untrackItemId }) => {
      await cancelFor(qc, listingId);
      return {
        snapshot: patchEverywhere(qc, listingId, { trackerItemId: untrackItemId ? null : PENDING_TRACKER_ID }),
      };
    },
    onError: (_error, _vars, context) => restore(qc, context?.snapshot),
    onSuccess: (trackerItemId, { listingId }) => {
      patchEverywhere(qc, listingId, { trackerItemId });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tracker'] }),
  });
}

// ── Feed bookkeeping used by the radar screen ────────────────────────────────

/** `POST /v1/feed/seen` (drives "Since you last visited"). */
export function useMarkFeedSeen() {
  return useMutation({ mutationKey: ['feed', 'seen'], mutationFn: () => api.post<void>('/v1/feed/seen') });
}
