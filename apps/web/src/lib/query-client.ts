import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

import { isApiError } from './api';
import { env } from './env';
import { STORAGE_KEYS } from './storage';

export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * One QueryClient for the app.
 * - 30 s stale time (lists feel instant on revisit, then revalidate in the background).
 * - gcTime 24 h so the persisted cache (IndexedDB) can rehydrate yesterday's radar offline.
 * - Retries only transient failures (network, timeout, 5xx), at most twice.
 * - Mutations pause while offline and resume in order on reconnect (QA → web #5); a row whose
 *   mutation is paused can read it with `useMutationState({ filters: { status: 'pending' } })` +
 *   `mutation.state.isPaused` to render `data-pending="true"`.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: CACHE_MAX_AGE,
        refetchOnWindowFocus: true,
        retry: (count, error) => count < 2 && isApiError(error) && error.isTransient,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      // Offline (USERFLOW §5.4): optimistic updates apply at once (`onMutate` runs), the request
      // pauses until the browser is back online, then paused mutations resume in order.
      mutations: { retry: 0, networkMode: 'online' },
    },
  });
}

/**
 * IndexedDB persister (idb-keyval). Stores the dehydrated client with structured clone, so `Date`
 * values survive a reload (a JSON persister would turn them into strings). Writes are throttled to 1 s.
 */
export function createIdbPersister(
  key: string = STORAGE_KEYS.queryCache,
  throttleMs = 1000,
): Persister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    timer = null;
    const client = pending;
    pending = null;
    if (client) await set(key, client).catch(() => undefined);
  };
  return {
    persistClient: (client) => {
      pending = client;
      if (!timer) timer = setTimeout(() => void flush(), throttleMs);
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(key);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await del(key).catch(() => undefined);
    },
  };
}

export const persistOptions = (persister: Persister) => ({
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: env.appVersion,
  dehydrateOptions: {
    // Opt out per query with `meta: { persist: false }` (e.g. live detection, push state).
    shouldDehydrateQuery: (query: { state: { status: string }; meta?: Record<string, unknown> }) =>
      query.state.status === 'success' && query.meta?.persist !== false,
  },
});
