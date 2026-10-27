/**
 * Tracker hooks (docs/API.md §7). Cache shape is the raw response (`{ items }`); hooks `select`.
 *
 * - `useTracker()`            GET   /v1/tracker            refetched on window focus (two-tab consistency)
 * - `useTrackerAnalytics()`   GET   /v1/tracker/analytics
 * - `useMoveTrackerItem()`    POST  /v1/tracker/:id/move   optimistic; adopts the server's column order;
 *                                                          a stale move (404/409) refetches the board
 * - `useCreateTrackerItem()`  POST  /v1/tracker            from a listing (`a`) or manual; optimistic for manual
 * - `useUpdateTrackerItem()`  PATCH /v1/tracker/:id        notes, contacts, documents, dates, stage
 * - `useDeleteTrackerItem()`  DELETE /v1/tracker/:id
 */
import type { TrackerStage } from '@kestrel/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, isApiError } from '@/lib/api';

import { patchListingEverywhere } from './feed-cache';
import { queryKeys } from './keys';
import type { TrackerAnalytics, TrackerCreateBody, TrackerItemDTO, TrackerMoveResponse } from './types';

type TrackerList = { items: TrackerItemDTO[] };

/** PATCH body: shared `trackerUpdateSchema` + the api extras (API §7). */
export interface TrackerPatch {
  notes?: string;
  contacts?: TrackerItemDTO['contacts'];
  documents?: TrackerItemDTO['documents'];
  appliedAt?: Date | null;
  deadlineAt?: Date | null;
  stage?: TrackerStage;
  title?: string;
  company?: string;
  applyUrl?: string | null;
}

/** All tracker items in stage order, then position (group by `stage` for the board). */
export function useTracker() {
  return useQuery({
    queryKey: queryKeys.tracker.list,
    queryFn: ({ signal }) => api.get<TrackerList>('/v1/tracker', { signal }),
    select: (data) => data.items,
    // Another tab may have moved cards: always revalidate on focus, even inside staleTime.
    refetchOnWindowFocus: 'always',
  });
}

export function useTrackerAnalytics() {
  return useQuery({
    queryKey: queryKeys.tracker.analytics,
    queryFn: ({ signal }) => api.get<TrackerAnalytics>('/v1/tracker/analytics', { signal }),
    refetchOnWindowFocus: 'always',
  });
}

/** Reorder locally the way the server will (0-based target index, both columns re-indexed). */
export function applyMove(items: TrackerItemDTO[], id: string, stage: TrackerStage, position: number): TrackerItemDTO[] {
  const moving = items.find((i) => i.id === id);
  if (!moving) return items;
  const now = new Date();
  const stageChanged = moving.stage !== stage;
  const moved: TrackerItemDTO = stageChanged
    ? {
        ...moving,
        stage,
        lastActivityAt: now,
        appliedAt: stage === 'applied' && !moving.appliedAt ? now : moving.appliedAt,
        history: [...moving.history, { stage, at: now }],
        // The server clears pending nudges on any stage change.
        nudges: moving.nudges.filter((n) => n.sentAt || n.dismissedAt),
      }
    : moving;
  const rest = items.filter((i) => i.id !== id);
  const target = rest.filter((i) => i.stage === stage).sort((a, b) => a.position - b.position);
  const index = Math.max(0, Math.min(Number.isFinite(position) ? Math.trunc(position) : target.length, target.length));
  target.splice(index, 0, moved);
  const reindexed = new Map(target.map((item, i) => [item.id, { ...item, position: i }]));
  const source = rest
    .filter((i) => i.stage === moving.stage && stageChanged)
    .sort((a, b) => a.position - b.position)
    .map((item, i) => ({ ...item, position: i }));
  const sourceMap = new Map(source.map((s) => [s.id, s]));
  const others = rest.filter((i) => i.stage !== stage && !sourceMap.has(i.id));
  return [...others, ...sourceMap.values(), ...reindexed.values()];
}

function setItems(qc: QueryClient, update: (items: TrackerItemDTO[]) => TrackerItemDTO[]) {
  qc.setQueryData<TrackerList>(queryKeys.tracker.list, (data) => (data ? { items: update(data.items) } : data));
}

/** True when the server says the card moved or vanished in another tab. */
export function isStaleTrackerError(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

/** Move a card (optimistic; Kanban drops and "Move to…" both use this). Pair with `withUndo`. */
export function useMoveTrackerItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['tracker', 'move'],
    mutationFn: ({ id, stage, position }: { id: string; stage: TrackerStage; position: number }) =>
      api.post<TrackerMoveResponse>(`/v1/tracker/${id}/move`, { stage, position }),
    onMutate: async ({ id, stage, position }) => {
      await qc.cancelQueries({ queryKey: queryKeys.tracker.list });
      const previous = qc.getQueryData<TrackerList>(queryKeys.tracker.list);
      if (previous) qc.setQueryData<TrackerList>(queryKeys.tracker.list, { items: applyMove(previous.items, id, stage, position) });
      return { previous };
    },
    onError: (error, _v, context) => {
      // Stale (another tab won): keep nothing local, take the server's board.
      if (isStaleTrackerError(error)) return;
      if (context?.previous) qc.setQueryData(queryKeys.tracker.list, context.previous);
    },
    onSuccess: ({ item, column }) => {
      // Adopt the server's order for the destination column (it re-indexes to 0..n-1).
      const order = new Map(column.map((c) => [c.id, c.position]));
      setItems(qc, (items) =>
        items.map((i) => {
          if (i.id === item.id) return { ...i, ...item };
          const p = order.get(i.id);
          return p === undefined ? i : { ...i, stage: item.stage, position: p };
        }),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.tracker.all });
    },
  });
}

let tempIds = 0;

/** `a` on a listing: add to tracker as Saved. Manual entries appear at the top of their column at once. */
export function useCreateTrackerItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['tracker', 'create'],
    mutationFn: (body: TrackerCreateBody) => api.post<{ item: TrackerItemDTO }>('/v1/tracker', body),
    onMutate: async (body) => {
      if (!('manual' in body)) return { previous: undefined, tempId: null };
      await qc.cancelQueries({ queryKey: queryKeys.tracker.list });
      const previous = qc.getQueryData<TrackerList>(queryKeys.tracker.list);
      const tempId = `optimistic-${(tempIds += 1)}`;
      const stage = body.stage ?? 'saved';
      const now = new Date();
      const optimistic: TrackerItemDTO = {
        id: tempId,
        userId: 'me',
        listingId: null,
        title: body.manual.title,
        company: body.manual.company,
        type: body.manual.type ?? null,
        applyUrl: body.manual.url ?? null,
        deadlineAt: body.manual.deadlineAt ?? null,
        sourceId: null,
        stage,
        position: -1,
        notes: body.notes ?? '',
        contacts: [],
        documents: [],
        appliedAt: stage === 'applied' ? now : null,
        lastActivityAt: now,
        nudges: [],
        createdAt: now,
        updatedAt: now,
        history: [{ stage, at: now }],
      };
      setItems(qc, (items) => applyMove([...items, optimistic], tempId, stage, 0));
      return { previous, tempId };
    },
    onError: (_e, _b, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.tracker.list, context.previous);
    },
    onSuccess: ({ item }, _b, context) => {
      if (item.listingId) patchListingEverywhere(qc, item.listingId, { trackerItemId: item.id });
      if (context?.tempId) setItems(qc, (items) => items.map((i) => (i.id === context.tempId ? item : i)));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.tracker.all }),
  });
}

/** Notes (autosave), contacts, documents, applied date… Optimistic, no refetch flash. */
export function useUpdateTrackerItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['tracker', 'update'],
    mutationFn: ({ id, patch }: { id: string; patch: TrackerPatch }) =>
      api.patch<{ item: TrackerItemDTO }>(`/v1/tracker/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.tracker.list });
      const previous = qc.getQueryData<TrackerList>(queryKeys.tracker.list);
      setItems(qc, (items) => items.map((i) => (i.id === id ? ({ ...i, ...patch } as TrackerItemDTO) : i)));
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.tracker.list, context.previous);
    },
    onSuccess: ({ item }) => setItems(qc, (items) => items.map((i) => (i.id === item.id ? { ...i, ...item } : i))),
    onSettled: (_d, _e, { patch }) => {
      if (patch.stage || patch.appliedAt !== undefined) void qc.invalidateQueries({ queryKey: queryKeys.tracker.analytics });
    },
  });
}

/** Optimistic removal; returns the previous list for Undo (the DELETE goes through a deferred commit). */
export function removeTrackerItemFromCache(qc: QueryClient, id: string): TrackerList | undefined {
  const previous = qc.getQueryData<TrackerList>(queryKeys.tracker.list);
  setItems(qc, (items) => items.filter((i) => i.id !== id));
  return previous;
}

export function restoreTrackerCache(qc: QueryClient, previous: TrackerList | undefined) {
  if (previous) qc.setQueryData(queryKeys.tracker.list, previous);
}

export function useDeleteTrackerItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/v1/tracker/${id}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.tracker.all }),
  });
}
