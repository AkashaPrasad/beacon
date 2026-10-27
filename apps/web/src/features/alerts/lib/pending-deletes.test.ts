import { describe, expect, it, vi } from 'vitest';

import {
  clearPendingDelete,
  markPendingDelete,
  pendingDeletesSnapshot,
  subscribePendingDeletes,
} from './pending-deletes';

describe('pending deletes', () => {
  it('hides ids during the undo window and notifies with a new snapshot', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePendingDeletes(listener);
    const before = pendingDeletesSnapshot();
    markPendingDelete('r1');
    expect(pendingDeletesSnapshot().has('r1')).toBe(true);
    expect(pendingDeletesSnapshot()).not.toBe(before);
    clearPendingDelete('r1');
    clearPendingDelete('r1');
    expect(pendingDeletesSnapshot().has('r1')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
