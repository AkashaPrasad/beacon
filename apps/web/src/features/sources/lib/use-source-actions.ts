/**
 * Source and pack actions shared by the list, the source page and the pack page: optimistic
 * mutations with calm toasts, undo for anything destructive (DESIGN §8 rule 6).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
  deleteSourceRequest,
  removeSourceFromCache,
  restoreSourcesCache,
  useRefreshSource,
  useTogglePack,
  useUpdateSource,
  type PackDTO,
  type SourcePatch,
} from '@/api/sources';
import { errorMessage } from '@/lib/api';
import { withUndo } from '@/lib/undo';

import { deferCommit } from './deferred';
import type { SourceTableRow } from './rows';

type RowRef = Pick<SourceTableRow, 'id' | 'name'>;

export interface SourceActions {
  setEnabled: (row: RowRef, enabled: boolean) => void;
  /** `onSaved` runs when the server confirms (for an inline "Saved"). */
  update: (row: RowRef, patch: SourcePatch, onSaved?: () => void) => void;
  refresh: (row: RowRef) => void;
  /** Removes the row at once; the DELETE is sent when the 6 s undo window closes. */
  remove: (row: RowRef) => void;
  togglePack: (pack: PackDTO, enabled: boolean) => void;
}

export function useSourceActions(): SourceActions {
  const qc = useQueryClient();
  const updateMutation = useUpdateSource();
  const refreshMutation = useRefreshSource();
  const packMutation = useTogglePack();

  return useMemo<SourceActions>(
    () => ({
      setEnabled: (row, enabled) =>
        updateMutation.mutate(
          { id: row.id, patch: { enabled } },
          {
            onSuccess: () =>
              toast(enabled ? `Watching ${row.name} again.` : `Paused ${row.name}.`),
            onError: (e) =>
              toast.error(`Couldn't update ${row.name}. ${errorMessage(e)}`, { duration: 8000 }),
          },
        ),
      update: (row, patch, onSaved) =>
        updateMutation.mutate(
          { id: row.id, patch },
          {
            onSuccess: () => onSaved?.(),
            onError: (e) =>
              toast.error(`Couldn't save ${row.name}. ${errorMessage(e)}`, { duration: 8000 }),
          },
        ),
      refresh: (row) =>
        refreshMutation.mutate(row.id, {
          onSuccess: () => toast(`Checking ${row.name} now.`),
          onError: (e) =>
            toast.error(`Couldn't refresh ${row.name}. ${errorMessage(e)}`, { duration: 8000 }),
        }),
      remove: (row) => {
        const previous = removeSourceFromCache(qc, row.id);
        const pending = deferCommit(`source:${row.id}`, () =>
          deleteSourceRequest(qc, row.id).catch((error: unknown) => {
            restoreSourcesCache(qc, previous);
            toast.error(`Couldn't delete ${row.name}. ${errorMessage(error)}`, { duration: 8000 });
          }),
        );
        withUndo({
          message: `Deleted “${row.name}”.`,
          run: () => undefined,
          undo: () => {
            pending.cancel();
            restoreSourcesCache(qc, previous);
          },
        });
      },
      togglePack: (pack, enabled) => {
        if (enabled) {
          packMutation.mutate(
            { id: pack.id, enabled: true },
            {
              onSuccess: () => toast.success(`Turned on ${pack.name}.`),
              onError: (e) =>
                toast.error(`Couldn't turn on the pack. ${errorMessage(e)}`, { duration: 8000 }),
            },
          );
          return;
        }
        withUndo({
          message: `Turned off ${pack.name}.`,
          run: () => packMutation.mutateAsync({ id: pack.id, enabled: false }),
          undo: () => packMutation.mutateAsync({ id: pack.id, enabled: true }),
        });
      },
    }),
    [qc, updateMutation, refreshMutation, packMutation],
  );
}
