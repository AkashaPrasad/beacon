import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError, buildUrl, isApiError } from '@/lib/api';
import { sessionHint } from '@/lib/storage';
import type { AiProvider, AiSettings, Settings, SettingsPatch } from '@kestrel/shared';

import { queryKeys } from './keys';
import type { AiTestResult, WeightsResponse } from './types';

export function useSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: ({ signal }) => api.get<Settings>('/v1/settings', { signal }),
    enabled: options.enabled ?? true,
  });
}

function mergePatch(current: Settings, patch: SettingsPatch): Settings {
  return {
    ...current,
    appearance: { ...current.appearance, ...patch.appearance },
    ai: { ...current.ai, ...(patch.ai ? { ...patch.ai, consent: undefined } : {}) },
    notifications: { ...current.notifications, ...patch.notifications },
    privacy: { ...current.privacy, ...patch.privacy },
    weights: { ...current.weights, ...patch.weights },
  };
}

/** PATCH /v1/settings, optimistic. Settings screens save on change (no Save buttons). */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.patch<Settings>('/v1/settings', patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.settings });
      const previous = qc.getQueryData<Settings>(queryKeys.settings);
      if (previous) qc.setQueryData(queryKeys.settings, mergePatch(previous, patch));
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.settings, context.previous);
    },
    onSuccess: (settings) => qc.setQueryData(queryKeys.settings, settings),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useTestAiKey() {
  return useMutation({
    mutationFn: (body: { provider?: string; baseUrl?: string; model?: string; apiKey?: string } = {}) =>
      api.post<AiTestResult>('/v1/settings/ai/test', body, { timeoutMs: 20_000 }),
  });
}

export function useUpdateWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weights: Settings['weights']) => api.put<WeightsResponse>('/v1/settings/weights', weights),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.settings });
      void qc.invalidateQueries({ queryKey: queryKeys.feed.all });
    },
  });
}

// ── Screen extensions (Settings > AI & keys, Privacy & data) ──────────────────────────────────────

export interface AiSettingsPut {
  provider: AiProvider;
  baseUrl?: string | null;
  model?: string | null;
  /** Write-only: sent once, never cached, never echoed back (only `hasKey` + `keyLast4`). */
  apiKey?: string;
  enabled: boolean;
}

function setCachedAi(qc: ReturnType<typeof useQueryClient>, ai: AiSettings) {
  qc.setQueryData<Settings>(queryKeys.settings, (current) => (current ? { ...current, ai } : current));
}

/** PUT /v1/settings/ai: provider, base URL, model and (optionally) a new key. */
export function usePutAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'ai', 'put'],
    mutationFn: (body: AiSettingsPut) => api.put<{ ai: AiSettings }>('/v1/settings/ai', body),
    onSuccess: ({ ai }) => setCachedAi(qc, ai),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

/** DELETE /v1/settings/ai/key: falls back to the consent choice (USERFLOW §5.2). */
export function useRemoveAiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'ai', 'remove-key'],
    mutationFn: () => api.delete<{ ai: AiSettings }>('/v1/settings/ai/key'),
    onSuccess: ({ ai }) => setCachedAi(qc, ai),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export interface AiUsage {
  date: string;
  calls: number;
  cap: number;
  tokens?: { prompt: number; completion: number; total: number };
}

/**
 * Today's AI usage. `GET /v1/settings/ai/usage` is requested in docs/SHARED-REQUESTS.md (web → api);
 * until it exists a 404 resolves to `null` and the meter is hidden.
 */
export function useAiUsage(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...queryKeys.settings, 'ai-usage'] as const,
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 60_000,
    meta: { persist: false },
    queryFn: async ({ signal }) => {
      try {
        return await api.get<AiUsage>('/v1/settings/ai/usage', { signal });
      } catch (error) {
        if (isApiError(error) && (error.status === 404 || error.status === 405)) return null;
        throw error;
      }
    },
  });
}

/** GET /v1/settings/export → saves `beacon-export-YYYY-MM-DD.json`. Resolves with the file name. */
export async function downloadExport(now: Date = new Date()): Promise<string> {
  let res: Response;
  try {
    res = await fetch(buildUrl('/v1/settings/export'), { credentials: 'include', headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK', message: "Couldn't reach Beacon. Check your connection." });
  }
  if (!res.ok) {
    throw new ApiError({ status: res.status, code: `HTTP_${res.status}`, message: "The export didn't finish. Try again." });
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  const name = fromHeader ? decodeURIComponent(fromHeader) : `beacon-export-${now.toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return name;
}

/** DELETE /v1/account: 204 + cookie cleared. Clears every cached query afterwards. */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['account', 'delete'],
    mutationFn: () => api.delete<void>('/v1/account'),
    onSuccess: () => {
      sessionHint.set(false);
      qc.clear();
      qc.setQueryData(queryKeys.me, null);
    },
  });
}
