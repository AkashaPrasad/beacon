/**
 * Tracker undo toasts: `withUndo` (shared, so `u` / ⌘Z work) plus a `data-testid="tracker-undo"`
 * on the toast's Undo action. Sonner merges an update into the existing toast, so the original
 * duration and expiry callbacks are kept.
 */
import { createElement } from 'react';
import { toast } from 'sonner';

import { withUndo, type WithUndoOptions } from '@/lib/undo';

export function withTrackerUndo<T>(options: WithUndoOptions<T>) {
  const handle = withUndo(options);
  toast(options.message, {
    id: handle.toastId,
    action: {
      label: createElement('span', { 'data-testid': 'tracker-undo' }, 'Undo'),
      onClick: () => void handle.undo(),
    },
  });
  // withUndo already shows the error toast (with Retry); keep the rejection from going unhandled.
  handle.promise.catch(() => undefined);
  return handle;
}
