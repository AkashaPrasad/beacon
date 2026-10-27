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
