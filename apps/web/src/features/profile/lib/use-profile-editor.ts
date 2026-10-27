import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { queryKeys, useProfile } from '@/api';
import { usePatchProfileOptimistic } from '@/api/profile';
import type { ProfileResponse } from '@/api/types';
import { diffPatch, toDraft, type ProfileDraft } from '@/features/profile/lib/profile-model';
import { errorMessage } from '@/lib/api';
import { withUndo } from '@/lib/undo';
import type { ProfilePatch } from '@kestrel/shared';

export type ProfileUpdate = (draft: ProfileDraft) => ProfileDraft;

/** The inverse of `forward`: the previous values of exactly the keys it changes. */
export function inversePatch(before: ProfileDraft, forward: ProfilePatch): ProfilePatch {
  return Object.fromEntries(
    Object.keys(forward).map((key) => [key, before[key as keyof ProfileDraft]]),
  );
}

/**
 * Inline editing for the Profile screen: every commit is optimistic (the cache changes on the same
 * frame), sent as a minimal PATCH, and — when it has a message — offered back as an undo toast
 * ("Removed React. Undo"; `u` / ⌘Z also undo). Updates are functions of the latest cached draft, so two
 * quick edits never overwrite each other.
 */
export function useProfileEditor() {
  const qc = useQueryClient();
  const profile = useProfile();
  const patch = usePatchProfileOptimistic();
  const pending = useIsMutating({ mutationKey: ['profile', 'patch'] }) > 0;
  const draft = useMemo(() => (profile.data ? toDraft(profile.data.profile) : null), [profile.data]);

  const latest = useCallback((): ProfileDraft | null => {
    const data = qc.getQueryData<ProfileResponse>(queryKeys.profile);
    return data ? toDraft(data.profile) : null;
  }, [qc]);

  const commit = useCallback(
    (update: ProfileUpdate, message?: string | null) => {
      const before = latest();
      if (!before) return;
      const forward = diffPatch(before, update(before));
      if (Object.keys(forward).length === 0) return;
      const backward = inversePatch(before, forward);
      if (message) {
        // withUndo shows the error toast (with Retry) itself; the rejection is handled there.
        withUndo({
          message,
          run: () => patch.mutateAsync(forward),
          undo: () => patch.mutateAsync(backward),
        }).promise.catch(() => undefined);
      } else {
        patch.mutate(forward, {
          onError: (error) => toast.error(errorMessage(error, 'Couldn’t save that change. Try again.'), { duration: 8000 }),
        });
      }
    },
    [latest, patch],
  );

  return { profile, draft, commit, pending };
}
