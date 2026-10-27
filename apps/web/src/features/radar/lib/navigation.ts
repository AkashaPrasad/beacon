/**
 * Keyboard cursor for the radar feed (DESIGN §9 "the feed is one tab stop with roving focus",
 * §11 keyboard map). The cursor follows listing ids, not indexes, so it survives pagination,
 * optimistic hides and live inserts without jumping to a different row.
 */

export interface FeedNavState {
  ids: readonly string[];
  cursorId: string | null;
}

export type FeedNavAction =
  /** The feed's ordered ids changed (new page, filter, hide, insert). */
  | { type: 'sync'; ids: readonly string[] }
  /** Move by `delta` rows (j/k = ±1, PageDown = +10). Clamped, never wraps. */
  | { type: 'move'; delta: number }
  | { type: 'first' }
  | { type: 'last' }
  /** Pointer/focus put the cursor on a row (or cleared it). */
  | { type: 'focus'; id: string | null }
  /** A row is about to disappear (hide): the cursor moves to its neighbour first. */
  | { type: 'remove'; id: string };

export const initialNavState: FeedNavState = { ids: [], cursorId: null };

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export function feedNavReducer(state: FeedNavState, action: FeedNavAction): FeedNavState {
  switch (action.type) {
    case 'sync': {
      const { ids } = action;
      if (ids.length === 0) return { ids, cursorId: null };
      if (state.cursorId == null || ids.includes(state.cursorId)) {
        return { ids, cursorId: state.cursorId };
      }
      // The cursor row vanished: stay at the same position (the next row slid into it).
      const previous = state.ids.indexOf(state.cursorId);
      const index = previous === -1 ? 0 : clampIndex(previous, ids.length);
      return { ids, cursorId: ids[index] ?? null };
    }
    case 'move': {
      if (state.ids.length === 0) return state;
      const current = state.cursorId == null ? -1 : state.ids.indexOf(state.cursorId);
      // No cursor yet: j lands on the first row, k on the first row too (nothing above).
      const index = current === -1 ? 0 : clampIndex(current + action.delta, state.ids.length);
      const cursorId = state.ids[index] ?? null;
      return cursorId === state.cursorId ? state : { ...state, cursorId };
    }
    case 'first':
      return { ...state, cursorId: state.ids[0] ?? null };
    case 'last':
      return { ...state, cursorId: state.ids[state.ids.length - 1] ?? null };
    case 'focus':
      if (action.id === state.cursorId) return state;
      if (action.id != null && !state.ids.includes(action.id)) return state;
      return { ...state, cursorId: action.id };
    case 'remove': {
      const index = state.ids.indexOf(action.id);
      if (index === -1) return state;
      const ids = state.ids.filter((id) => id !== action.id);
      if (state.cursorId !== action.id) return { ids, cursorId: state.cursorId };
      const cursorId = ids.length === 0 ? null : (ids[clampIndex(index, ids.length)] ?? null);
      return { ids, cursorId };
    }
    default:
      return state;
  }
}

export function cursorIndex(state: FeedNavState): number {
  return state.cursorId == null ? -1 : state.ids.indexOf(state.cursorId);
}

/** Neighbour id for prev/next in the drawer (null at the ends). */
export function neighbourId(ids: readonly string[], id: string, delta: 1 | -1): string | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  return ids[index + delta] ?? null;
}

// ── Key → command (single-key shortcuts are off in text fields, DESIGN §9 / WCAG 2.1.4) ────────

export type FeedCommand =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'pageDown'
  | 'pageUp'
  | 'open'
  | 'openApply'
  | 'save'
  | 'hide'
  | 'track'
  | 'search'
  | 'close'
  | 'toggleRail'
  | 'toggleDrawer'
  | 'viewList'
  | 'viewTimeline'
  | 'viewBoard';

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** The event target, used to skip text fields. */
  target?: EventTarget | null;
}

export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset'].includes(type);
  }
  return el.isContentEditable || el.getAttribute?.('role') === 'textbox';
}

/**
 * Map a keydown to a feed command. Returns null for anything that is not ours (so other handlers
 * and native behaviour keep working). `Escape` works everywhere, including text fields.
 */
export function feedCommandForKey(event: KeyLike): FeedCommand | null {
  const { key } = event;
  const mod = Boolean(event.metaKey || event.ctrlKey);
  if (key === 'Escape') return 'close';
  if (mod && key === 'Enter') return 'openApply';
  if (mod || event.altKey) return null;
  if (isEditableTarget(event.target)) return null;
  switch (key) {
    case 'j':
    case 'ArrowDown':
      return 'next';
    case 'k':
    case 'ArrowUp':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'PageDown':
      return 'pageDown';
    case 'PageUp':
      return 'pageUp';
    case 'Enter':
    case 'o':
      return 'open';
    case 's':
      return 'save';
    case 'h':
      return 'hide';
    case 'a':
      return 'track';
    case '/':
      return 'search';
    case '[':
      return 'toggleRail';
    case ']':
      return 'toggleDrawer';
    case '1':
      return 'viewList';
    case '2':
      return 'viewTimeline';
    case '3':
      return 'viewBoard';
    default:
      return null;
  }
}
