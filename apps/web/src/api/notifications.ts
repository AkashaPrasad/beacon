import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { queryKeys } from './keys';
import type { MeResponse, NotificationsResponse } from './types';

/** Newest first, with `unreadCount`. Polls every 60 s while the tab is visible. */
export function useNotifications(options: { unreadOnly?: boolean; enabled?: boolean } = {}) {
  const { unreadOnly = false, enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    queryFn: ({ signal }) =>
      api.get<NotificationsResponse>('/v1/notifications', { signal, query: { unreadOnly: unreadOnly || undefined } }),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Mark ids (or everything) read, optimistically; keeps the bell badge in sync. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api.post<{ updated: number; unreadCount: number }>('/v1/notifications/read', body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.all });
      const now = new Date();
      const lists = qc.getQueriesData<NotificationsResponse>({ queryKey: queryKeys.notifications.all });
      for (const [key, data] of lists) {
        if (!data) continue;
        const items = data.items.map((n) =>
          'all' in body || body.ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n,
        );
        qc.setQueryData(key, { ...data, items, unreadCount: items.filter((n) => !n.readAt).length });
      }
      return { lists };
    },
    onError: (_e, _v, context) => context?.lists.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: ({ unreadCount }) => {
      qc.setQueryData<MeResponse | null>(queryKeys.me, (me) => (me ? { ...me, unreadNotifications: unreadCount } : me));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

// ── Screen extension: the /notifications centre (infinite, cursor pages) ─────────────────────────

/**
 * Kept under its own key prefix: the bell's single-page cache (`queryKeys.notifications`) and this
 * paged cache have different shapes, so each mark-read updater only touches its own shape.
 */
export const notificationCentreKeys = {
  all: ['notification-centre'] as const,
  list: (filter: { unreadOnly?: boolean }) => ['notification-centre', filter] as const,
};

type CentrePages = InfiniteData<NotificationsResponse, string | null>;

const CENTRE_PAGE_SIZE = 30;

export function useNotificationCentre(filter: { unreadOnly?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: notificationCentreKeys.list(filter),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.get<NotificationsResponse>('/v1/notifications', {
        signal,
        query: { cursor: pageParam, limit: CENTRE_PAGE_SIZE, unreadOnly: filter.unreadOnly || undefined },
      }),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
  });
}

function markCentre(data: CentrePages, body: { ids: string[] } | { all: true }, at: Date): CentrePages {
  const ids = 'ids' in body ? new Set(body.ids) : null;
  let newlyRead = 0;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((n) => {
      if (n.readAt || (ids && !ids.has(n.id))) return n;
      newlyRead += 1;
      return { ...n, readAt: at };
    }),
  }));
  return {
    ...data,
    pages: pages.map((p) => ({ ...p, unreadCount: ids ? Math.max(0, p.unreadCount - newlyRead) : 0 })),
  };
}

/** Mark read from the centre: optimistic on the paged cache, then syncs the bell and its cache. */
export function useMarkCentreRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['notifications', 'read', 'centre'],
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api.post<{ updated: number; unreadCount: number }>('/v1/notifications/read', body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: notificationCentreKeys.all });
      const snapshot = qc.getQueriesData<CentrePages>({ queryKey: notificationCentreKeys.all });
      const at = new Date();
      for (const [key, data] of snapshot) if (data?.pages) qc.setQueryData(key, markCentre(data, body, at));
      return { snapshot };
    },
    onError: (_e, _b, context) => context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: ({ unreadCount }) => {
      qc.setQueryData<MeResponse | null>(queryKeys.me, (me) => (me ? { ...me, unreadNotifications: unreadCount } : me));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      void qc.invalidateQueries({ queryKey: notificationCentreKeys.all });
    },
  });
}
