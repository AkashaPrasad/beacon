/**
 * Deferred commits for undoable deletes. The item leaves the UI at once (optimistic), the request is
 * sent when the undo window closes, and Undo cancels it, so the *same* record comes back (same id,
 * health history, listings) instead of a re-created copy. Pending commits flush on `pagehide`.
 */

export const UNDO_WINDOW_MS = 6_000;

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  commit: () => unknown;
}

const pending = new Map<string, Pending>();
let listening = false;

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pagehide', flushPendingCommits);
}

export interface DeferredHandle {
  /** Cancel before it commits. Returns false when it already ran. */
  cancel: () => boolean;
  /** Commit now (e.g. when another action depends on it). */
  flush: () => void;
}

export function deferCommit(
  key: string,
  commit: () => unknown,
  delayMs: number = UNDO_WINDOW_MS,
): DeferredHandle {
  listen();
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const run = () => {
    pending.delete(key);
    void Promise.resolve().then(commit);
  };
  const timer = setTimeout(run, delayMs);
  pending.set(key, { timer, commit });
  return {
    cancel: () => {
      const p = pending.get(key);
      if (!p || p.timer !== timer) return false;
      clearTimeout(timer);
      pending.delete(key);
      return true;
    },
    flush: () => {
      const p = pending.get(key);
      if (!p || p.timer !== timer) return;
      clearTimeout(timer);
      run();
    },
  };
}

export function hasPendingCommit(key: string): boolean {
  return pending.has(key);
}

export function flushPendingCommits(): void {
  for (const [key, p] of [...pending]) {
    clearTimeout(p.timer);
    pending.delete(key);
    void Promise.resolve().then(p.commit);
  }
}
