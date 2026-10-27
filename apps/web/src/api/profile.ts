import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError, buildUrl, CSRF_HEADER, CSRF_VALUE } from '@/lib/api';
import { parseJson } from '@/lib/json';
import type { ProfilePatch } from '@kestrel/shared';

import { queryKeys } from './keys';
import type { ProfileResponse, ResumeUploadResponse } from './types';

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => api.get<ProfileResponse>('/v1/profile', { signal }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => api.patch<ProfileResponse>('/v1/profile', patch),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.profile, data);
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      void qc.invalidateQueries({ queryKey: queryKeys.feed.all });
    },
  });
}

/**
 * Upload a PDF/DOCX (≤ 10 MB server limit; the UI caps at 5 MB per USERFLOW §1.4). Returns an editable
 * draft; pass `save: true` to merge it into the stored profile. Errors: 413, 415, 422 RESUME_NO_TEXT /
 * RESUME_UNREADABLE (see ApiError.code).
 */
export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, save = false }: { file: File; save?: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<ResumeUploadResponse>('/v1/profile/resume', form, {
        query: { save: save || undefined },
        timeoutMs: 45_000,
      });
    },
    onSuccess: (result) => {
      if (result.saved) {
        void qc.invalidateQueries({ queryKey: queryKeys.profile });
        void qc.invalidateQueries({ queryKey: queryKeys.me });
      }
    },
  });
}

// ── Screen extensions (onboarding + Profile screen) ──────────────────────────────────────────────

/** Merges a patch into the cached profile; returns the previous value for rollback. */
function optimisticProfilePatch(qc: ReturnType<typeof useQueryClient>, patch: ProfilePatch) {
  const previous = qc.getQueryData<ProfileResponse>(queryKeys.profile);
  if (previous) {
    qc.setQueryData<ProfileResponse>(queryKeys.profile, {
      ...previous,
      exists: true,
      profile: { ...previous.profile, ...patch },
    });
  }
  return previous;
}

/**
 * PATCH /v1/profile, optimistic: the cache changes before the request and rolls back on error.
 * Used by the Profile screen's inline edits together with `withUndo`.
 */
export function usePatchProfileOptimistic() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['profile', 'patch'],
    mutationFn: (patch: ProfilePatch) => api.patch<ProfileResponse>('/v1/profile', patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.profile });
      return { previous: optimisticProfilePatch(qc, patch) };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.profile, context.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.profile, data);
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      void qc.invalidateQueries({ queryKey: queryKeys.feed.all });
    },
  });
}

export interface ResumeUploadOptions {
  /** Merge the parsed result into the stored profile (`?save=true`). */
  save?: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * POST /v1/profile/resume over XHR, because `fetch` cannot report upload progress (USERFLOW §1.4:
 * "a progress bar on the file chip"). Same CSRF header, cookie and error envelope as `api.*`;
 * rejects with `ApiError` (status 0 = network, timeout or cancelled).
 */
export function uploadResumeWithProgress(
  file: File,
  { save = false, onProgress, signal }: ResumeUploadOptions = {},
): Promise<ResumeUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl('/v1/profile/resume', save ? { save: 'true' } : undefined));
    xhr.withCredentials = true;
    xhr.timeout = 60_000;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader(CSRF_HEADER, CSRF_VALUE);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => onProgress?.(1);

    const fail = (code: string, message: string) => reject(new ApiError({ status: 0, code, message }));
    xhr.onerror = () => fail('NETWORK', "Couldn't reach Beacon. Check your connection.");
    xhr.ontimeout = () => fail('TIMEOUT', "The server didn't respond within 60 seconds.");
    xhr.onabort = () => fail('ABORTED', 'The upload was cancelled.');
    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? parseJson(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as ResumeUploadResponse);
        return;
      }
      const envelope =
        body && typeof body === 'object' && 'error' in body
          ? ((body as { error: Record<string, unknown> }).error ?? {})
          : {};
      const retryAfter = Number(xhr.getResponseHeader('Retry-After'));
      reject(
        new ApiError({
          status: xhr.status,
          code: typeof envelope.code === 'string' ? envelope.code.toUpperCase() : `HTTP_${xhr.status}`,
          message: typeof envelope.message === 'string' ? envelope.message : 'The upload failed.',
          details: envelope.details,
          requestId: xhr.getResponseHeader('X-Request-Id'),
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        }),
      );
    };

    if (signal?.aborted) {
      fail('ABORTED', 'The upload was cancelled.');
      return;
    }
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}
