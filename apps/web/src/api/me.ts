import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, isApiError } from '@/lib/api';
import { sessionHint } from '@/lib/storage';

import { queryKeys } from './keys';
import type { GoogleAuthBody, GoogleAuthResponse, MePatch, MeResponse } from './types';

/** `/v1/me` with `auth: 'optional'`: a 401 means "signed out" (null), never a redirect. */
export async function fetchMe(signal?: AbortSignal): Promise<MeResponse | null> {
  try {
    const me = await api.get<MeResponse>('/v1/me', { signal, auth: 'optional' });
    sessionHint.set(true);
    return me;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      sessionHint.set(false);
      return null;
    }
    throw error;
  }
}

/**
 * The signed-in user, onboarding state and settings summary. `data === null` means signed out.
 * Set `enabled: false` on public pages when there is no session hint (no request at all).
 */
export function useMe(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

/** True once onboarding is complete (`completedAt` set or step `done`). */
export function isOnboarded(me: MeResponse | null | undefined): boolean {
  return Boolean(me && (me.onboarding.completedAt || me.onboarding.step === 'done'));
}

/** Where a signed-in user should land next (consent → onboarding step → radar). */
export function nextPathFor(me: MeResponse): string {
  if (!me.onboarding.consent || me.onboarding.step === 'consent') return '/welcome';
  if (!isOnboarded(me)) {
    const step = me.onboarding.step === 'done' ? 'resume' : me.onboarding.step;
    return `/onboarding/${step}`;
  }
  return '/radar';
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MePatch) => api.patch<MeResponse>('/v1/me', patch),
    onSuccess: (me) => qc.setQueryData(queryKeys.me, me),
  });
}

/** POST /v1/auth/google with a GIS ID token (`{ credential }`) or an auth code. */
export function useGoogleSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoogleAuthBody) => api.post<GoogleAuthResponse>('/v1/auth/google', body, { auth: 'optional' }),
    onSuccess: async () => {
      sessionHint.set(true);
      await qc.fetchQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => fetchMe(signal), staleTime: 0 });
    },
  });
}

/** Sign out: clears the cookie, every cached query (memory + IndexedDB) and the session hint. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/v1/auth/logout', undefined, { auth: 'optional' }),
    onSettled: () => {
      sessionHint.set(false);
      qc.clear();
      qc.setQueryData(queryKeys.me, null);
      window.dispatchEvent(new Event('beacon:signed-out'));
    },
  });
}
