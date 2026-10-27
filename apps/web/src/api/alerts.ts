/**
 * Alert rule hooks (docs/API.md §8). Cache shape is the raw response (`{ items }`); hooks `select`.
 *
 * - `useAlerts()`        GET    /v1/alerts
 * - `useCreateAlert()`   POST   /v1/alerts           optimistic card at the top
 * - `useUpdateAlert()`   PATCH  /v1/alerts/:id       optimistic (enable switch, edits)
 * - `useDeleteAlert()`   DELETE /v1/alerts/:id       (screens defer it for Undo: removeAlertFromCache)
 * - `useTestAlert()`     POST   /v1/alerts/:id/test  → 202 queued; the in-app notification arrives via the bell
 * - `useAlertPreview()`  POST   /v1/alerts/preview   "Would have matched N listings in the last 7 days"
 *                                                   (requested in SHARED-REQUESTS; hidden when the route 404s)
 */
import type { AlertRule, AlertRuleInput, AlertRulePatch } from '@kestrel/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, isApiError } from '@/lib/api';

import { queryKeys } from './keys';

/** Optional per-rule stats (fixture/API when available): matches per day for the last 7 days, oldest first. */
export type AlertRuleDTO = AlertRule & { stats?: { matchesByDay: number[]; matchesLast7d: number } | null };
type AlertList = { items: AlertRuleDTO[] };

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: ({ signal }) => api.get<AlertList>('/v1/alerts', { signal }),
    select: (data) => data.items,
  });
}

function setRules(qc: QueryClient, update: (rules: AlertRuleDTO[]) => AlertRuleDTO[]) {
  qc.setQueryData<AlertList>(queryKeys.alerts, (data) => ({ items: update(data?.items ?? []) }));
}

let tempIds = 0;

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['alerts', 'create'],
    mutationFn: (rule: Partial<AlertRuleInput>) => api.post<{ rule: AlertRuleDTO }>('/v1/alerts', rule),
    onMutate: async (rule) => {
      await qc.cancelQueries({ queryKey: queryKeys.alerts });
      const previous = qc.getQueryData<AlertList>(queryKeys.alerts);
      const tempId = `optimistic-${(tempIds += 1)}`;
      const now = new Date();
      const optimistic = {
        id: tempId,
        userId: 'me',
        name: rule.name ?? 'New rule',
        enabled: rule.enabled ?? true,
        conditions: {
          minFit: 70,
          types: [],
          maxDeadlineDays: null,
          locations: [],
          remote: 'any',
          keywords: [],
          ...rule.conditions,
        },
        channels: rule.channels ?? ['inapp'],
        cadence: rule.cadence ?? 'instant',
        digestTime: rule.digestTime ?? '09:00',
        digestDay: rule.digestDay ?? 1,
        quietHours: rule.quietHours ?? null,
        timezone: rule.timezone ?? 'Asia/Kolkata',
        lastTriggeredAt: null,
        createdAt: now,
        updatedAt: now,
        stats: null,
      } as AlertRuleDTO;
      setRules(qc, (rules) => [optimistic, ...rules]);
      return { previous, tempId };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.alerts, context.previous);
    },
    onSuccess: ({ rule }, _v, context) => setRules(qc, (rules) => rules.map((r) => (r.id === context.tempId ? rule : r))),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.alerts }),
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['alerts', 'update'],
    mutationFn: ({ id, patch }: { id: string; patch: AlertRulePatch }) =>
      api.patch<{ rule: AlertRuleDTO }>(`/v1/alerts/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.alerts });
      const previous = qc.getQueryData<AlertList>(queryKeys.alerts);
      setRules(qc, (rules) =>
        rules.map((r) =>
          r.id === id
            ? ({ ...r, ...patch, conditions: { ...r.conditions, ...patch.conditions } } as AlertRuleDTO)
            : r,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.alerts, context.previous);
    },
    onSuccess: ({ rule }) => setRules(qc, (rules) => rules.map((r) => (r.id === rule.id ? { ...r, ...rule } : r))),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.alerts }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/v1/alerts/${id}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.alerts }),
  });
}

/** Optimistic removal for a deferred (undoable) delete; returns the previous list. */
export function removeAlertFromCache(qc: QueryClient, id: string): AlertList | undefined {
  const previous = qc.getQueryData<AlertList>(queryKeys.alerts);
  setRules(qc, (rules) => rules.filter((r) => r.id !== id));
  return previous;
}

export function restoreAlertsCache(qc: QueryClient, previous: AlertList | undefined) {
  if (previous) qc.setQueryData(queryKeys.alerts, previous);
}

export async function deleteAlertRequest(qc: QueryClient, id: string): Promise<void> {
  await api.delete<void>(`/v1/alerts/${id}`);
  void qc.invalidateQueries({ queryKey: queryKeys.alerts });
}

export function useTestAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['alerts', 'test'],
    mutationFn: (id: string) => api.post<{ queued: boolean; jobId: string }>(`/v1/alerts/${id}/test`),
    onSuccess: () => {
      // The worker writes the in-app notification within a second or two; nudge the bell to look.
      setTimeout(() => void qc.invalidateQueries({ queryKey: queryKeys.notifications.all }), 1_500);
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export interface AlertPreview {
  matchesLast7d: number;
  sample: { id: string; title: string; company: string; score: number }[];
}

/** Live "would have matched" count for the builder. `conditions` should already be debounced. */
export function useAlertPreview(conditions: AlertRuleInput['conditions'] | null) {
  return useQuery({
    queryKey: [...queryKeys.alerts, 'preview', conditions] as const,
    queryFn: async ({ signal }) => {
      try {
        return await api.post<AlertPreview>('/v1/alerts/preview', { conditions }, { signal });
      } catch (error) {
        if (isApiError(error) && (error.status === 404 || error.status === 405)) return null;
        throw error;
      }
    },
    enabled: conditions !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
    meta: { persist: false },
  });
}
