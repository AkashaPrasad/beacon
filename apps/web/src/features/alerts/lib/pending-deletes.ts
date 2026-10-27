/**
 * Rules removed with Undo pending: the DELETE is deferred for the undo window, so a refetch in that
 * window (focus, another mutation) must not bring the card back. The view filters these ids out.
 */
const ids = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function emit() {
  snapshot = new Set(ids);
  listeners.forEach((l) => l());
}

export function markPendingDelete(id: string): void {
  ids.add(id);
  emit();
}

export function clearPendingDelete(id: string): void {
  if (ids.delete(id)) emit();
}

export function subscribePendingDeletes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingDeletesSnapshot(): ReadonlySet<string> {
  return snapshot;
}
