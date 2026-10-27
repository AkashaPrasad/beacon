/**
 * Optimistic action + undo toast (DESIGN §8 rule 6: past tense + Undo; 6 s for undo toasts).
 *
 *   withUndo({
 *     message: `Hidden “${listing.title}”.`,
 *     run: () => hide.mutateAsync({ id, hidden: true }),     // already optimistic in the hook
 *     undo: () => hide.mutateAsync({ id, hidden: false }),
 *   });
 *
 * `u` and `⌘Z` / `Ctrl Z` call `undoLast()` (registered in the app shell).
 */
import { toast } from 'sonner';

import { errorMessage } from './api';

export interface WithUndoOptions<T> {
  /** Past tense, ≤ 12 words ("Moved to Applied."). */
  message: string;
  /** The action. Usually a mutation whose hook already applied the optimistic update. */
  run: () => Promise<T> | T;
  /** Inverse action. */
  undo: (result: T | undefined) => unknown;
  /** Toast after a successful undo (default: none; the UI already shows the restored state). */
  undoneMessage?: string;
  durationMs?: number;
}

interface UndoEntry {
  toastId: string | number;
  undo: () => Promise<void>;
}

let last: UndoEntry | null = null;

export function withUndo<T>({
  message,
  run,
  undo,
  undoneMessage,
  durationMs = 6000,
}: WithUndoOptions<T>) {
  let result: T | undefined;
  let undone = false;

  const doUndo = async () => {
    if (undone) return;
    undone = true;
    if (last?.toastId === toastId) last = null;
    toast.dismiss(toastId);
    try {
      // A fast Undo must run after the original write, or its late response wins.
      await promise;
      await undo(result);
      if (undoneMessage) toast(undoneMessage);
    } catch (error) {
      toast.error(`Couldn't undo. ${errorMessage(error)}`, { duration: 8000 });
    }
  };

  const expire = () => {
    if (last?.toastId === toastId) last = null;
  };
  const toastId = toast(message, {
    duration: durationMs,
    action: { label: 'Undo', onClick: () => void doUndo() },
    onAutoClose: expire,
    onDismiss: expire,
  });
  last = { toastId, undo: doUndo };

  const promise = Promise.resolve()
    .then(run)
    .then((value) => {
      result = value;
      return value;
    })
    .catch((error: unknown) => {
      toast.dismiss(toastId);
      if (last?.toastId === toastId) last = null;
      toast.error(errorMessage(error), {
        duration: 8000,
        action: {
          label: 'Retry',
          onClick: () => void withUndo({ message, run, undo, undoneMessage, durationMs }),
        },
      });
      throw error;
    });

  return { toastId, undo: doUndo, promise };
}

/** Undo the most recent undoable action, if its toast is still showing. Returns false when none. */
export function undoLast(): boolean {
  if (!last) return false;
  void last.undo();
  return true;
}
