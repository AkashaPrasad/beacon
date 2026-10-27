/**
 * Source and pack actions shared by the list, the source page and the pack page: optimistic
 * mutations with calm toasts. Turning a pack off has Undo; deleting a source is irreversible (its
 * check history goes), so callers confirm first (UX v2 D19) and the delete is sent at once.
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

import type { SourceTableRow } from './rows';

type RowRef = Pick<SourceTableRow, 'id' | 'name'>;

export interface SourceActions {
  setEnabled: (row: RowRef, enabled: boolean) => void;
  /** `onSaved` runs when the server confirms (for an inline "Saved"). */
  update: (row: RowRef, patch: SourcePatch, onSaved?: () => void) => void;
  refresh: (row: RowRef) => void;
  /** Deletes the source (after the caller's confirm): the row goes at once, back on failure. */
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
            onSuccess: () => toast(enabled ? `Watching ${row.name} again.` : `Paused ${row.name}.`),
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
        deleteSourceRequest(qc, row.id).then(
          () => toast(`Deleted “${row.name}”.`),
          (error: unknown) => {
            restoreSourcesCache(qc, previous);
            toast.error(`Couldn't delete ${row.name}. ${errorMessage(error)}`, { duration: 8000 });
          },
        );
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
