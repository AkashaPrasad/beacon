/**
 * Kanban board model (pure). The board is a map of stage → ordered item ids; positions are the
 * 0-based index inside a column, exactly what `POST /v1/tracker/:id/move` expects and returns
 * (API §7: the server re-indexes source and destination columns to 0..n-1).
 */
import { TRACKER_STAGES, type TrackerStage } from '@kestrel/shared';

export type BoardColumns = Record<TrackerStage, string[]>;

export interface PositionedItem {
  id: string;
  stage: TrackerStage;
  position: number;
  /** Tie-breaker when positions collide (newest first, matching "new items go to the top"). */
  updatedAt?: Date | string;
}

export interface BoardLocation {
  stage: TrackerStage;
  index: number;
}

export function emptyColumns(): BoardColumns {
  return Object.fromEntries(TRACKER_STAGES.map((s) => [s, [] as string[]])) as unknown as BoardColumns;
}

function time(value: Date | string | undefined): number {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/** Group items by stage, ordered by position (then most recently updated first). */
export function buildColumns(items: readonly PositionedItem[]): BoardColumns {
  const columns = emptyColumns();
  const sorted = [...items].sort(
    (a, b) => a.position - b.position || time(b.updatedAt) - time(a.updatedAt) || cmp(a.id, b.id),
  );
  for (const item of sorted) columns[item.stage].push(item.id);
  return columns;
}

function cmp(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function locate(columns: BoardColumns, id: string): BoardLocation | null {
  for (const stage of TRACKER_STAGES) {
    const index = columns[stage].indexOf(id);
    if (index !== -1) return { stage, index };
  }
  return null;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

/**
 * Move `id` to `toStage` at `toIndex` (0-based, clamped). Indexes are interpreted against the
 * destination column *after* the item is removed from its source, which is how dnd-kit's
 * `arrayMove` and the API both count. Returns the same object when nothing changes.
 */
export function moveItem(
  columns: BoardColumns,
  id: string,
  toStage: TrackerStage,
  toIndex: number,
): BoardColumns {
  const from = locate(columns, id);
  if (!from) return columns;
  const source = columns[from.stage].filter((x) => x !== id);
  const target = from.stage === toStage ? source : [...columns[toStage]];
  const index = clampIndex(toIndex, target.length);
  if (from.stage === toStage && index === from.index) return columns;
  target.splice(index, 0, id);
  return { ...columns, [from.stage]: source, [toStage]: target };
}

/** Insert a new item (manual add / tracked from Radar). New items go to the top by default. */
export function insertItem(
  columns: BoardColumns,
  id: string,
  stage: TrackerStage,
  index = 0,
): BoardColumns {
  const without = removeItem(columns, id);
  const target = [...without[stage]];
  target.splice(clampIndex(index, target.length), 0, id);
  return { ...without, [stage]: target };
}

export function removeItem(columns: BoardColumns, id: string): BoardColumns {
  const at = locate(columns, id);
  if (!at) return columns;
  return { ...columns, [at.stage]: columns[at.stage].filter((x) => x !== id) };
}

/** Position map (id → stage + 0-based index) for patching cached items after a move. */
export function positionsOf(columns: BoardColumns): Map<string, BoardLocation> {
  const out = new Map<string, BoardLocation>();
  for (const stage of TRACKER_STAGES) {
    columns[stage].forEach((id, index) => out.set(id, { stage, index }));
  }
  return out;
}

/**
 * Reconcile a column with the order the server returned (`{ id, position }[]`). Ids the server
 * knows about are placed by its positions; ids only the client has (e.g. an optimistic insert)
 * keep their relative order at the end.
 */
export function applyServerColumn(
  columns: BoardColumns,
  stage: TrackerStage,
  serverColumn: readonly { id: string; position: number }[],
): BoardColumns {
  const serverIds = new Set(serverColumn.map((c) => c.id));
  let next = columns;
  // An id can only live in one column: pull server ids out of any other column first.
  for (const s of TRACKER_STAGES) {
    if (s === stage) continue;
    if (next[s].some((id) => serverIds.has(id))) {
      next = { ...next, [s]: next[s].filter((id) => !serverIds.has(id)) };
    }
  }
  const ordered = [...serverColumn].sort((a, b) => a.position - b.position).map((c) => c.id);
  const clientOnly = next[stage].filter((id) => !serverIds.has(id));
  return { ...next, [stage]: [...ordered, ...clientOnly] };
}

/** Stage-change summary for a drag that started at `from` and ended at `to`. */
export function describeMove(
  from: BoardLocation | null,
  to: BoardLocation | null,
): 'none' | 'reorder' | 'stage' {
  if (!from || !to) return 'none';
  if (from.stage !== to.stage) return 'stage';
  return from.index === to.index ? 'none' : 'reorder';
}

/** Total per column; `closed` combines Rejected + Ghosted (DESIGN §10.4). */
export function columnCounts(columns: BoardColumns): Record<TrackerStage, number> {
  return Object.fromEntries(TRACKER_STAGES.map((s) => [s, columns[s].length])) as Record<
    TrackerStage,
    number
  >;
}

// ── Keyboard drag (Space lifts, arrows move one slot, Space/Enter drops, Esc cancels) ──────────

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Where a one-slot keyboard move takes a card. Left/right go to the neighbouring stage in `order`
 * at the same index (clamped to that column's end); up/down move within the column. Null at an edge.
 */
export function keyboardTarget(
  columns: BoardColumns,
  id: string,
  direction: Direction,
  order: readonly TrackerStage[] = TRACKER_STAGES,
): BoardLocation | null {
  const at = locate(columns, id);
  if (!at) return null;
  if (direction === 'up' || direction === 'down') {
    const index = at.index + (direction === 'up' ? -1 : 1);
    if (index < 0 || index >= columns[at.stage].length) return null;
    return { stage: at.stage, index };
  }
  const pos = order.indexOf(at.stage);
  const next = pos === -1 ? undefined : order[pos + (direction === 'left' ? -1 : 1)];
  if (!next) return null;
  return { stage: next, index: Math.min(at.index, columns[next].length) };
}

export interface KeyboardDrag {
  id: string;
  /** Where the card was picked up. */
  origin: BoardLocation;
  /** Where it is now (preview). */
  current: BoardLocation;
  /** Preview board while lifted. */
  columns: BoardColumns;
}

export type KeyboardDragEvent =
  | { type: 'lift'; id: string; columns: BoardColumns }
  | { type: 'move'; direction: Direction }
  | { type: 'drop' }
  | { type: 'cancel' };

export interface KeyboardDragOutcome {
  kind: 'lifted' | 'moved' | 'blocked' | 'dropped' | 'cancelled';
  from: BoardLocation;
  to: BoardLocation;
  /** Board after the event (for `dropped`: the board to commit; for `cancelled`: the original). */
  columns: BoardColumns;
}

export interface KeyboardDragResult {
  state: KeyboardDrag | null;
  outcome: KeyboardDragOutcome | null;
}

/** Pure keyboard-drag reducer. The board component announces and commits from `outcome`. */
export function keyboardDrag(
  state: KeyboardDrag | null,
  event: KeyboardDragEvent,
  order: readonly TrackerStage[] = TRACKER_STAGES,
): KeyboardDragResult {
  switch (event.type) {
    case 'lift': {
      if (state) return { state, outcome: null };
      const at = locate(event.columns, event.id);
      if (!at) return { state: null, outcome: null };
      const next: KeyboardDrag = { id: event.id, origin: at, current: at, columns: event.columns };
      return { state: next, outcome: { kind: 'lifted', from: at, to: at, columns: event.columns } };
    }
    case 'move': {
      if (!state) return { state, outcome: null };
      const target = keyboardTarget(state.columns, state.id, event.direction, order);
      if (!target) {
        return {
          state,
          outcome: { kind: 'blocked', from: state.current, to: state.current, columns: state.columns },
        };
      }
      const columns = moveItem(state.columns, state.id, target.stage, target.index);
      const to = locate(columns, state.id) ?? target;
      return {
        state: { ...state, columns, current: to },
        outcome: { kind: 'moved', from: state.current, to, columns },
      };
    }
    case 'drop': {
      if (!state) return { state, outcome: null };
      return {
        state: null,
        outcome: { kind: 'dropped', from: state.origin, to: state.current, columns: state.columns },
      };
    }
    case 'cancel': {
      if (!state) return { state, outcome: null };
      const columns = moveItem(state.columns, state.id, state.origin.stage, state.origin.index);
      return {
        state: null,
        outcome: { kind: 'cancelled', from: state.current, to: state.origin, columns },
      };
    }
  }
}

/**
 * Roving-focus neighbour for arrow keys when nothing is lifted. `visible` is the on-screen column
 * order (Closed contributes only its visible segment). Left/right skip empty columns and keep the
 * row index where possible.
 */
export function neighbourId(
  columns: BoardColumns,
  id: string,
  direction: Direction,
  visible: readonly TrackerStage[],
): string | null {
  const at = locate(columns, id);
  if (!at) return null;
  if (direction === 'up' || direction === 'down') {
    const list = columns[at.stage];
    return list[at.index + (direction === 'up' ? -1 : 1)] ?? null;
  }
  const step = direction === 'left' ? -1 : 1;
  for (let i = visible.indexOf(at.stage) + step; i >= 0 && i < visible.length; i += step) {
    const stage = visible[i];
    if (!stage) break;
    const list = columns[stage];
    if (list.length) return list[Math.min(at.index, list.length - 1)] ?? null;
  }
  return null;
}
