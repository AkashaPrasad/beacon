import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError, buildUrl, CSRF_HEADER, CSRF_VALUE, isApiError } from '@/lib/api';
import { parseJson } from '@/lib/json';
import type { ProfilePatch } from '@kestrel/shared';

import { queryKeys } from './keys';
import type { MeResponse, ProfileResponse, ResumeUploadResponse } from './types';

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
        timeoutMs: 95_000,
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
      // While other inline edits are still in flight, keep their optimistic values: the last response wins.
      if (qc.isMutating({ mutationKey: ['profile', 'patch'] }) <= 1)
        qc.setQueryData(queryKeys.profile, data);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['profile', 'patch'] }) > 1) return;
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
    // Scans are read with OCR and can take up to ~85 s (API.md §4); never give up before 90 s.
    xhr.timeout = 95_000;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader(CSRF_HEADER, CSRF_VALUE);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => onProgress?.(1);

    const fail = (code: string, message: string) =>
      reject(new ApiError({ status: 0, code, message }));
    xhr.onerror = () => fail('NETWORK', "Couldn't reach Beacon. Check your connection.");
    xhr.ontimeout = () => fail('TIMEOUT', "The server didn't respond within 95 seconds.");
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
          code:
            typeof envelope.code === 'string' ? envelope.code.toUpperCase() : `HTTP_${xhr.status}`,
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

// ── Onboarding save-and-resume (API §3/§4 additions: PATCH /v1/profile/onboarding, POST …/complete) ──────

/**
 * Answers the conversational onboarding saves between visits. Profile-shaped answers live in the
 * profile itself (`PATCH /v1/profile`); this holds the rest plus the bookkeeping the flow needs.
 */
export interface OnboardingAnswers {
  /** Steps auto-skipped because the answer was already known (never shown, never counted). */
  auto?: string[];
  /** Steps the student chose to skip. */
  skipped?: string[];
  /** Steps the student has answered at least once. */
  answered?: string[];
  /** A resume was parsed during onboarding (shows "Here's what we found"). */
  resumeParsed?: boolean;
  interests?: string[];
  targetCompanies?: { name: string; domain: string | null }[];
  [key: string]: unknown;
}

export interface OnboardingProgress {
  /** Last saved step slug (`/onboarding/<step>`), or null before the first save. */
  step: string | null;
  answers: OnboardingAnswers;
  updatedAt: Date | null;
}

/** `/v1/me.onboarding` with the save-and-resume fields (`answers`, `updatedAt`), all optional. */
type MeOnboardingExtras = {
  answers?: OnboardingAnswers | null;
  updatedAt?: Date | string | null;
  /** Older mock shape. */
  progress?: {
    step?: string | null;
    answers?: OnboardingAnswers | null;
    updatedAt?: Date | string | null;
  } | null;
};

/** Reads the saved progress from `/v1/me` (null when nothing was saved yet). */
export function progressFromMe(me: MeResponse | null | undefined): OnboardingProgress | null {
  if (!me) return null;
  const o = me.onboarding as MeResponse['onboarding'] & MeOnboardingExtras;
  const answers = o.answers ?? o.progress?.answers ?? null;
  if (!answers) return null;
  const updated = o.updatedAt ?? o.progress?.updatedAt ?? null;
  return {
    step: o.progress?.step ?? (o.step && o.step !== 'consent' && o.step !== 'done' ? o.step : null),
    answers,
    updatedAt: updated ? new Date(updated) : null,
  };
}

export interface OnboardingSaveBody {
  step?: string;
  answers?: OnboardingAnswers;
}

/** True when the API predates the onboarding endpoints (the flow then keeps progress locally). */
function isMissingRoute(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 405);
}

/**
 * `PATCH /v1/profile/onboarding { step?, answers? }` → `MeResponse` (or `{ onboarding }`). The `me` cache
 * is patched in place so the guards and the next visit see the same step. A 404 (older API) resolves
 * to null: the caller's local mirror keeps the progress.
 */
export async function saveOnboardingProgress(
  qc: QueryClient,
  body: OnboardingSaveBody,
): Promise<MeResponse | null> {
  try {
    const res = await api.patch<MeResponse | { onboarding: MeResponse['onboarding'] }>(
      '/v1/profile/onboarding',
      body,
    );
    if ('user' in res) {
      qc.setQueryData(queryKeys.me, res);
      return res;
    }
    qc.setQueryData<MeResponse | null>(queryKeys.me, (prev) =>
      prev ? { ...prev, onboarding: { ...prev.onboarding, ...res.onboarding } } : prev,
    );
    return qc.getQueryData<MeResponse>(queryKeys.me) ?? null;
  } catch (error) {
    if (isMissingRoute(error)) return null;
    throw error;
  }
}

/**
 * `POST /v1/profile/onboarding/complete` → `MeResponse`: marks onboarding done and enqueues the
 * profile embed + match (API §13). Falls back to `PATCH /v1/me { onboardingCompleted: true }` on an
 * API without the route.
 */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MeResponse> => {
      try {
        const res = await api.post<MeResponse | { onboarding: MeResponse['onboarding'] }>(
          '/v1/profile/onboarding/complete',
        );
        if ('user' in res) return res;
        return api.get<MeResponse>('/v1/me');
      } catch (error) {
        if (!isMissingRoute(error)) throw error;
        return api.patch<MeResponse>('/v1/me', {
          onboardingStep: 'done',
          onboardingCompleted: true,
        });
      }
    },
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.me, me);
      void qc.invalidateQueries({ queryKey: queryKeys.feed.all });
    },
  });
}
