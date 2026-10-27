/**
 * Sources hooks (docs/API.md §5). Cache shapes are the raw responses (`{ items }`), hooks `select`.
 *
 * - `useSources()`          GET  /v1/sources            personal sources (newest first); polls while a row is pending
 * - `useCommunitySources()` GET  /v1/sources/community  every page (≤ 200 each) with the `subscribed` flag
 * - `usePacks()`            GET  /v1/sources/packs
 * - `useCredits()`          GET  /v1/sources/credits    polled every 60 s
 * - `useDetectSource(url)` / `detectSource(qc, url)`   POST /v1/sources/detect (cached per URL, never persisted)
 * - `useCreateSource()`     POST /v1/sources            optimistic insert at the top
 * - `useUpdateSource()`     PATCH /v1/sources/:id       optimistic (enabled, refreshInterval, typeTag, name)
 * - `useRefreshSource()`    POST /v1/sources/:id/refresh (requested in SHARED-REQUESTS; falls back to PATCH enabled)
 * - `removeSourceFromCache` + `deleteSourceRequest`     DELETE with a deferred commit, so Undo restores the same source
 * - `useTogglePack()`       POST /v1/sources/packs/:id/enable|disable, optimistic (packs + community rows)
 * - `useSourceRuns(id)`     GET  /v1/sources/:id/runs   recent checks (requested in SHARED-REQUESTS; hidden when absent)
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, isApiError } from '@/lib/api';
import type { OpportunityType, RefreshInterval } from '@kestrel/shared';

import { queryKeys } from './keys';
import type {
  CommunitySourceDTO,
  CreditsResponse,
  DetectResult,
  FeedResponse,
  PackDTO,
  SourceCreateBody,
  SourceDTO,
} from './types';

export type {
  CommunitySourceDTO,
  CreditsResponse,
  DetectResult,
  PackDTO,
  SourceCreateBody,
  SourceDTO,
};

/** Worker extras the API may expose (SHARED-REQUESTS qa → api #1). */
export type SourceRow = SourceDTO & {
  healthCode?: string | null;
  lastSuccessAt?: Date | null;
  /** Client-only: true while an optimistic insert is in flight. */
  optimistic?: boolean;
};
export type CommunityRow = CommunitySourceDTO & {
  healthCode?: string | null;
  lastSuccessAt?: Date | null;
  /** Every pack containing it (API §5); `packId` is the first. */
  packIds?: string[];
  consecutiveFailures?: number;
};

/** True when a community source belongs to `packId` (first pack or any of `packIds`). */
export function isInPack(s: Pick<CommunityRow, 'packId' | 'packIds'>, packId: string): boolean {
  return s.packId === packId || Boolean(s.packIds?.includes(packId));
}

export interface SourcePatch {
  name?: string;
  typeTag?: OpportunityType | null;
  refreshInterval?: RefreshInterval;
  enabled?: boolean;
}

type SourceList = { items: SourceRow[] };
type PackList = { items: PackDTO[] };
type CommunityList = { items: CommunityRow[] };

const COMMUNITY_KEY = queryKeys.sources.community({ all: true });

// ── Queries ──────────────────────────────────────────────────────────────────────────────────

/** The user's personal sources (newest first). */
export function useSources() {
  return useQuery({
    queryKey: queryKeys.sources.mine,
    queryFn: ({ signal }) => api.get<SourceList>('/v1/sources', { signal }),
    select: (data) => data.items,
    // A new source turns healthy within a minute: poll while any saved row is still being checked.
    refetchInterval: (query) =>
      query.state.data?.items.some((s) => s.health === 'pending' && !s.optimistic) ? 3_000 : false,
  });
}

const COMMUNITY_PAGE = 200;
const COMMUNITY_MAX_PAGES = 10;

export async function fetchAllCommunitySources(signal?: AbortSignal): Promise<CommunityList> {
  const items: CommunityRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < COMMUNITY_MAX_PAGES; page += 1) {
    const res: { items: CommunityRow[]; nextCursor: string | null } = await api.get(
      '/v1/sources/community',
      {
        signal,
        query: { limit: COMMUNITY_PAGE, cursor },
      },
    );
    items.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return { items };
}

/** Every community source (all packs) with `subscribed`; ~340 rows, refreshed every 5 min. */
export function useCommunitySources() {
  return useQuery({
    queryKey: COMMUNITY_KEY,
    queryFn: ({ signal }) => fetchAllCommunitySources(signal),
    select: (data) => data.items,
    staleTime: 5 * 60_000,
  });
}

export function usePacks() {
  return useQuery({
    queryKey: queryKeys.sources.packs,
    queryFn: ({ signal }) => api.get<PackList>('/v1/sources/packs', { signal }),
    select: (data) => data.items,
  });
}

const sourceKey = (id: string) => [...queryKeys.sources.all, 'detail', id] as const;
const sourceListingsKey = (id: string) => [...queryKeys.sources.all, 'listings', id] as const;

/**
 * One source (`GET /v1/sources/:id`, own personal or any community source). The source page reads
 * the list caches first (instant, and they carry optimistic edits); this fetch covers deep links to
 * a source that is in neither list (e.g. a pack you haven't turned on).
 */
export function useSource(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: sourceKey(id),
    queryFn: ({ signal }) =>
      api.get<{ source: SourceRow | CommunityRow }>(`/v1/sources/${encodeURIComponent(id)}`, {
        signal,
      }),
    select: (data) => data.source,
    enabled: options.enabled ?? true,
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
    meta: { persist: false },
  });
}

export interface SourceListing {
  id: string;
  title: string;
  company: string;
  postedAt: Date | string | null;
  score: number | null;
}

const sourceListingsQuery = (id: string) => ({
  queryKey: sourceListingsKey(id),
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<SourceListing[]> => {
    const res = await api.get<FeedResponse>('/v1/feed', {
      signal,
      query: { sourceIds: id, sort: 'posted', limit: 5 },
    });
    return res.items.map((i) => ({
      id: i.listing.id,
      title: i.listing.title,
      company: i.listing.company,
      postedAt: i.listing.postedAt ?? null,
      score: i.score,
    }));
  },
  staleTime: 60_000,
  retry: false,
  meta: { persist: false },
});

/** The newest few listings from one source (`GET /v1/feed?sourceIds=…&sort=posted`). */
export function useSourceListings(id: string) {
  return useQuery(sourceListingsQuery(id));
}

/** Hover/focus prefetch for a source page link (cheap: one small feed page). */
export function prefetchSourcePage(qc: QueryClient, id: string): void {
  void qc.prefetchQuery(sourceListingsQuery(id));
}

/**
 * One check of a source, as the worker records it in `sourceRuns` (WORKER.md; the same shape the
 * admin overview's `recentRuns` uses). `status`: ok | not_modified | error | deferred.
 */
export interface SourceRunDTO {
  id: string;
  sourceId: string;
  reason: string | null;
  status: 'ok' | 'not_modified' | 'error' | 'deferred' | (string & {});
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  durationMs: number | null;
  found: number;
  new: number;
  updated: number;
  unchanged: number;
  errors: { kind: string; message: string }[];
  backend: string | null;
  creditsUsed: number;
}

const sourceRunsKey = (id: string) => [...queryKeys.sources.all, 'runs', id] as const;

/**
 * Recent checks of one source (`GET /v1/sources/:id/runs`, newest first). The route is requested in
 * SHARED-REQUESTS (web-workspace → api); until it ships the query resolves to `null` on 404 and the
 * source page falls back to the last-check facts it already has.
 */
export function useSourceRuns(id: string) {
  return useQuery({
    queryKey: sourceRunsKey(id),
    queryFn: async ({ signal }): Promise<SourceRunDTO[] | null> => {
      try {
        const res = await api.get<{ items: SourceRunDTO[] }>(
          `/v1/sources/${encodeURIComponent(id)}/runs`,
          { signal, query: { limit: 10 } },
        );
        return res.items;
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
    meta: { persist: false },
  });
}

export function useCredits() {
  return useQuery({
    queryKey: queryKeys.sources.credits,
    queryFn: ({ signal }) => api.get<CreditsResponse>('/v1/sources/credits', { signal }),
    refetchInterval: 60_000,
    meta: { persist: false },
  });
}

const detectQuery = (url: string) => ({
  queryKey: queryKeys.sources.detect(url),
  queryFn: ({ signal }: { signal?: AbortSignal }) =>
    api.post<DetectResult>('/v1/sources/detect', { url }, { signal, timeoutMs: 20_000 }),
  staleTime: 5 * 60_000,
  retry: false,
  meta: { persist: false },
});

/**
 * Live source detection. Pass the debounced (400 ms) URL; `null` disables it. Results are cached
 * per URL for 5 minutes and never persisted.
 */
export function useDetectSource(url: string | null) {
  return useQuery({ ...detectQuery(url ?? ''), enabled: Boolean(url) });
}

/** Imperative detection (the add-source state machine), sharing the same per-URL cache. */
export function detectSource(qc: QueryClient, url: string): Promise<DetectResult> {
  return qc.fetchQuery(detectQuery(url));
}

// ── Mutations ────────────────────────────────────────────────────────────────────────────────

function setMine(qc: QueryClient, update: (rows: SourceRow[]) => SourceRow[]) {
  qc.setQueryData<SourceList>(queryKeys.sources.mine, (data) => ({
    items: update(data?.items ?? []),
  }));
}

function invalidateDownstream(qc: QueryClient) {
  // Source changes re-rank the radar (API §5 side effects).
  void qc.invalidateQueries({ queryKey: queryKeys.feed.all });
  void qc.invalidateQueries({ queryKey: queryKeys.me });
}

let tempIds = 0;

export type CreateSourceVariables = SourceCreateBody & {
  /** The detection shown in the dialog (names the optimistic row). Not sent. */
  preview?: DetectResult | null;
  /**
   * Default true: the row appears at the top immediately ("Checking…"). Pass false when the dialog
   * already suspects a duplicate, so a 409 never flashes a row in and out. Not sent.
   */
  optimistic?: boolean;
};

function optimisticRow(body: CreateSourceVariables, id: string): SourceRow {
  const now = new Date();
  let host = body.url;
  try {
    host = new URL(body.url).hostname.replace(/^www\./, '');
  } catch {
    /* keep the raw text */
  }
  return {
    id,
    url: body.url,
    name: body.name ?? body.preview?.name ?? body.preview?.companyName ?? host,
    kind: body.kind ?? body.preview?.kind ?? 'firecrawl',
    scope: 'personal',
    ownerId: 'me',
    packId: null,
    typeTag: body.typeTag ?? null,
    enabled: true,
    refreshInterval: body.refreshInterval ?? 'daily',
    health: 'pending',
    lastCheckedAt: null,
    listingsFound: 0,
    errorReason: null,
    config: { boardToken: body.boardToken ?? null, feedUrl: body.feedUrl ?? null, provider: null },
    etag: null,
    lastModified: null,
    createdAt: now,
    updatedAt: now,
    companyDomain: body.preview?.companyDomain ?? null,
    optimistic: true,
  };
}

/** Add a personal source. The row appears at the top immediately ("Checking…"). */
export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['sources', 'create'],
    mutationFn: ({ preview: _preview, optimistic: _optimistic, ...body }: CreateSourceVariables) =>
      api.post<{ source: SourceRow; detection: DetectResult | null }>('/v1/sources', body),
    onMutate: async (body) => {
      if (body.optimistic === false) return { previous: undefined, tempId: null };
      await qc.cancelQueries({ queryKey: queryKeys.sources.mine });
      const previous = qc.getQueryData<SourceList>(queryKeys.sources.mine);
      const tempId = `optimistic-${(tempIds += 1)}`;
      setMine(qc, (rows) => [optimisticRow(body, tempId), ...rows]);
      return { previous, tempId };
    },
    onError: (_error, _body, context) => {
      if (context?.tempId) qc.setQueryData(queryKeys.sources.mine, context.previous);
    },
    onSuccess: ({ source }, _body, context) => {
      setMine(qc, (rows) =>
        context.tempId
          ? rows.map((r) => (r.id === context.tempId ? source : r))
          : [source, ...rows.filter((r) => r.id !== source.id)],
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sources.mine });
      void qc.invalidateQueries({ queryKey: queryKeys.sources.credits });
      invalidateDownstream(qc);
    },
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['sources', 'update'],
    mutationFn: ({ id, patch }: { id: string; patch: SourcePatch }) =>
      api.patch<{ source: SourceRow }>(`/v1/sources/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.sources.mine });
      const previous = qc.getQueryData<SourceList>(queryKeys.sources.mine);
      setMine(qc, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context) qc.setQueryData(queryKeys.sources.mine, context.previous);
    },
    onSuccess: ({ source }) =>
      setMine(qc, (rows) => rows.map((r) => (r.id === source.id ? { ...r, ...source } : r))),
    onSettled: (_d, _e, { patch }) => {
      if (patch.enabled !== undefined) invalidateDownstream(qc);
    },
  });
}

/** "Refresh now". */
export function useRefreshSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['sources', 'refresh'],
    mutationFn: async (id: string) => {
      try {
        await api.post(`/v1/sources/${id}/refresh`);
      } catch (error) {
        // Until the API ships a refresh route, re-enabling queues an ingest (API §5 side effects).
        if (isApiError(error) && error.status === 404)
          await api.patch(`/v1/sources/${id}`, { enabled: true });
        else throw error;
      }
    },
    onMutate: (id) => {
      setMine(qc, (rows) => rows.map((r) => (r.id === id ? { ...r, health: 'pending' } : r)));
    },
    onSettled: (_data, _error, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sources.mine });
      void qc.invalidateQueries({ queryKey: sourceRunsKey(id) });
    },
  });
}

/** Optimistic removal; returns the previous list for Undo. The DELETE is sent by a deferred commit. */
export function removeSourceFromCache(qc: QueryClient, id: string): SourceList | undefined {
  const previous = qc.getQueryData<SourceList>(queryKeys.sources.mine);
  setMine(qc, (rows) => rows.filter((r) => r.id !== id));
  return previous;
}

export function restoreSourcesCache(qc: QueryClient, previous: SourceList | undefined) {
  if (previous) qc.setQueryData(queryKeys.sources.mine, previous);
}

export async function deleteSourceRequest(qc: QueryClient, id: string): Promise<void> {
  await api.delete<void>(`/v1/sources/${id}`);
  void qc.invalidateQueries({ queryKey: queryKeys.sources.mine });
  invalidateDownstream(qc);
}

export function useTogglePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['sources', 'pack'],
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post<{ pack: PackDTO }>(
        `/v1/sources/packs/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`,
      ),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: queryKeys.sources.packs });
      const previous = qc.getQueryData<PackList>(queryKeys.sources.packs);
      if (previous) {
        qc.setQueryData<PackList>(queryKeys.sources.packs, {
          items: previous.items.map((p) => (p.id === id ? { ...p, enabled } : p)),
        });
      }
      const community = qc.getQueryData<CommunityList>(COMMUNITY_KEY);
      if (community) {
        qc.setQueryData<CommunityList>(COMMUNITY_KEY, {
          items: community.items.map((s) => (isInPack(s, id) ? { ...s, subscribed: enabled } : s)),
        });
      }
      return { previous, community };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.sources.packs, context.previous);
      if (context?.community) qc.setQueryData(COMMUNITY_KEY, context.community);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sources.all });
      void qc.invalidateQueries({ queryKey: queryKeys.feed.all });
    },
  });
}
