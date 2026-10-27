/**
 * Tracker actions shared by the board/table and the item page: optimistic moves with Undo (and a
 * graceful 409), deferred removal with Undo, autosaved patches, manual add, track-similar, snoozes.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { queryKeys } from '@/api/keys';
import {
  deleteTrackerItemRequest,
  isStaleTrackerError,
  removeTrackerItemFromCache,
  restoreTrackerCache,
  useCreateTrackerItem,
  useMoveTrackerItem,
  useUpdateTrackerItem,
  type TrackerPatch,
} from '@/api/tracker';
import type { TrackerCreateBody, TrackerItemDTO } from '@/api/types';
import { deferCommit } from '@/features/sources/lib/deferred';
import { errorMessage, isApiError } from '@/lib/api';
import type { TrackerStage } from '@kestrel/shared';

import { buildColumns, locate, type BoardLocation } from './board';
import { snoozeFor, type NudgeKind } from './nudges';
import { addSnooze, removeSnooze } from './snoozes';
import { STAGE_LABEL } from './stages';
import { withTrackerUndo } from './undo';

export type SnoozeAction = 'snooze' | 'followed_up' | 'keep_waiting';

export function useTrackerActions({
  items,
  onStageShown,
  onRemoved,
}: {
  items: readonly TrackerItemDTO[];
  /** A card landed in (or returned to) a stage: e.g. unfold "More" on the board. */
  onStageShown?: (stage: TrackerStage) => void;
  onRemoved?: (item: TrackerItemDTO) => void;
}) {
  const qc = useQueryClient();
  const move = useMoveTrackerItem();
  const update = useUpdateTrackerItem();
  const create = useCreateTrackerItem();

  const staleRecovered = useCallback(() => {
    toast('This card changed in another tab. Showing the latest board.');
    void qc.invalidateQueries({ queryKey: queryKeys.tracker.all });
  }, [qc]);

  const commitMove = useCallback(
    (item: TrackerItemDTO, to: BoardLocation, origin: BoardLocation) => {
      if (to.stage === origin.stage) {
        // A reorder inside a column: visible and low-stakes, so no toast (still announced).
        move.mutate(
          { id: item.id, stage: to.stage, position: to.index },
          {
            onError: (error) => {
              if (isStaleTrackerError(error)) staleRecovered();
              else toast.error(`Couldn't reorder. ${errorMessage(error)}`, { duration: 8000 });
            },
          },
        );
        return;
      }
      onStageShown?.(to.stage);
      const handle: ReturnType<typeof withTrackerUndo> = withTrackerUndo({
        message: `Moved to ${STAGE_LABEL[to.stage]}.`,
        run: async () => {
          try {
            return await move.mutateAsync({ id: item.id, stage: to.stage, position: to.index });
          } catch (error) {
            if (isStaleTrackerError(error)) {
              toast.dismiss(handle.toastId);
              staleRecovered();
              return undefined;
            }
            throw error;
          }
        },
        undo: () => {
          onStageShown?.(origin.stage);
          return move.mutateAsync({ id: item.id, stage: origin.stage, position: origin.index });
        },
      });
    },
    [move, onStageShown, staleRecovered],
  );

  /** Move to the top of another stage (stage select, nudges, "Got a reply"). */
  const moveToStage = useCallback(
    (item: TrackerItemDTO, stage: TrackerStage) => {
      const origin = locate(buildColumns(items), item.id);
      if (!origin || origin.stage === stage) return;
      commitMove(item, { stage, index: 0 }, origin);
    },
    [commitMove, items],
  );

  const removeItem = useCallback(
    (item: TrackerItemDTO) => {
      onRemoved?.(item);
      const previous = removeTrackerItemFromCache(qc, item.id);
      const pending = deferCommit(`tracker:${item.id}`, () =>
        deleteTrackerItemRequest(qc, item).catch((error: unknown) => {
          restoreTrackerCache(qc, previous);
          toast.error(`Couldn't remove “${item.title}”. ${errorMessage(error)}`, { duration: 8000 });
        }),
      );
      withTrackerUndo({
        message: `Removed “${item.title}”.`,
        run: () => undefined,
        undo: () => {
          pending.cancel();
          restoreTrackerCache(qc, previous);
        },
      });
    },
    [onRemoved, qc],
  );

  const patchItem = useCallback(
    (item: TrackerItemDTO, patch: TrackerPatch) =>
      update.mutateAsync({ id: item.id, patch }).catch((error: unknown) => {
        toast.error(`Couldn't save that. ${errorMessage(error)}`, { duration: 8000 });
        throw error;
      }),
    [update],
  );

  const createManual = useCallback(
    (body: Extract<TrackerCreateBody, { manual: unknown }>) => {
      const stage = body.stage ?? 'saved';
      onStageShown?.(stage);
      void create
        .mutateAsync(body)
        .then(() => toast.success(`Added to ${STAGE_LABEL[stage]}.`))
        .catch((error: unknown) => toast.error(`Couldn't add it. ${errorMessage(error)}`, { duration: 8000 }));
    },
    [create, onStageShown],
  );

  const trackSimilar = useCallback(
    (listingId: string, title: string) => {
      void create
        .mutateAsync({ listingId, stage: 'saved' })
        .then(() => toast.success(`Saved “${title}” to your tracker.`))
        .catch((error: unknown) =>
          isApiError(error) && error.status === 409
            ? toast('Already in your tracker.')
            : toast.error(`Couldn't save it. ${errorMessage(error)}`, { duration: 8000 }),
        );
    },
    [create],
  );

  const snooze = useCallback((item: TrackerItemDTO, kind: NudgeKind, action: SnoozeAction) => {
    const entry = snoozeFor(action, kind, new Date());
    const message =
      action === 'followed_up'
        ? 'Nice. Beacon will check in again in 7 days.'
        : action === 'keep_waiting'
          ? 'Okay. Beacon will ask again in 14 days.'
          : 'Snoozed for 3 days.';
    withTrackerUndo({
      message,
      run: () => addSnooze(item.id, entry),
      undo: () => removeSnooze(item.id, entry),
    });
  }, []);

  return { commitMove, moveToStage, removeItem, patchItem, createManual, trackSimilar, snooze };
}
