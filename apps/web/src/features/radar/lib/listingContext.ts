/**
 * Where a listing page was opened from (radar list, board, timeline or `/deadlines`), so the page can
 * offer "Back to …", step through the same order with j/k, and the list can restore its scroll
 * position and selected row on return. Session-only module state (a reload starts fresh).
 *
 * Also the "Did you apply?" memory (USERFLOW §3.2 step 4): an apply link opened from a listing page
 * asks once when the tab becomes visible again within 2 h.
 */

export interface ListingContext {
  /** Path + search to return to (`/radar?types=hackathon`, `/deadlines?weeks=8`). */
  origin: string;
  /** The listing order of the origin (prev / next on the page). */
  ids: readonly string[];
  /** Window scroll position of the origin when the listing was opened. */
  scrollY: number;
}

let context: ListingContext | null = null;

export function setListingContext(next: ListingContext): void {
  context = next;
}

export function getListingContext(): ListingContext | null {
  return context;
}

/** "Back to Radar" / "Back to Deadlines" from the origin path. */
export function backLabelFor(origin: string | null | undefined): string {
  if (origin?.startsWith('/deadlines')) return 'Back to Deadlines';
  if (origin?.includes('view=board')) return 'Back to Board';
  if (origin?.includes('view=timeline')) return 'Back to Timeline';
  return 'Back to Radar';
}

export function neighbours(ids: readonly string[], id: string | null): { prevId: string | null; nextId: string | null; index: number } {
  const index = id ? ids.indexOf(id) : -1;
  return {
    index,
    prevId: index > 0 ? (ids[index - 1] ?? null) : null,
    nextId: index >= 0 ? (ids[index + 1] ?? null) : null,
  };
}

// ── "Did you apply?" ─────────────────────────────────────────────────────────────────────────

const APPLY_KEY = 'beacon:radar:pending-apply';
export const APPLY_WINDOW_MS = 2 * 3_600_000;

export function rememberApply(id: string): void {
  try {
    sessionStorage.setItem(APPLY_KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    // Storage blocked: the prompt simply doesn't appear.
  }
}

export function readPendingApply(): { id: string; at: number } | null {
  try {
    const raw = sessionStorage.getItem(APPLY_KEY);
    return raw ? (JSON.parse(raw) as { id: string; at: number }) : null;
  } catch {
    return null;
  }
}

export function clearPendingApply(): void {
  try {
    sessionStorage.removeItem(APPLY_KEY);
  } catch {
    // ignore
  }
}
