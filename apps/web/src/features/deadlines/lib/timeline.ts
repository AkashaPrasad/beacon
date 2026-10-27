/**
 * Deadline timeline model (DESIGN §10.3, USERFLOW §3.3): which listings land on which day of the
 * visible weeks, how many pills a day shows before "+N more", the keyboard model for moving between
 * pills (one tab stop, arrows move, crossing a week edge scrolls), and the `/deadlines` URL params.
 * Pure functions; the components only render what these return.
 */
import type { FeedItemDTO, FeedFilters } from '@/api/types';
import { OPPORTUNITY_TYPES, type OpportunityType } from '@kestrel/shared';


import { bucketByDay, buildWeeks, dayKey, diffDays, type WeekRow } from './weeks';

/** At most this many pills per day; the rest open from "+N more" (DESIGN §10.3: 3 in 120 px rows). */
export const MAX_PILLS_PER_DAY = 4;
export const WEEK_OPTIONS = [4, 8, 12] as const;
export type WeeksOption = (typeof WEEK_OPTIONS)[number];
export const DEFAULT_WEEKS: WeeksOption = 4;
/** One past week stays visible so this week's closed deadlines (and Monday's) keep their context. */
export const WEEKS_BEFORE = 1;
/** Deadlines default to every fit; the radar's "long shots" cut-off is a feed concern. */
export const DEFAULT_DEADLINE_MIN_FIT = 0;

export interface TimelineItem {
  id: string;
  title: string;
  company: string;
  companyDomain: string | null;
  type: OpportunityType;
  deadlineAt: Date | null;
  deadlineKind: FeedItemDTO['listing']['deadlineKind'];
  score: number | null;
  saved: boolean;
  trackerItemId: string | null;
  applyUrl: string;
  /** The underlying feed row (drawer placeholder, actions). */
  item: FeedItemDTO;
}

/**
 * Type colour from the `--color-type-<type>` tokens (SHARED-API §1 `OPPORTUNITY_TYPE_COLOR_KEYS`),
 * falling back to a neutral when the theme does not define them yet.
 */
export function typeColor(type: OpportunityType, fallback = 'var(--color-border-strong)'): string {
  return `var(--color-type-${type}, ${fallback})`;
}

export function toTimelineItem(item: FeedItemDTO): TimelineItem {
  const { listing } = item;
  return {
    id: listing.id,
    title: listing.title,
    company: listing.company,
    companyDomain: listing.companyDomain,
    type: listing.type,
    deadlineAt: listing.deadlineAt,
    deadlineKind: listing.deadlineKind,
    score: item.fit?.score ?? item.score,
    saved: item.saved,
    trackerItemId: item.trackerItemId,
    applyUrl: listing.applyUrl,
    item,
  };
}

export interface TimelineModel {
  weeks: WeekRow[];
  todayKey: string;
  /** First and last day shown (inclusive). */
  range: { from: string; to: string };
  /** Day key → listings due that day, soonest first. */
  byDay: Map<string, TimelineItem[]>;
  /** Rolling / unknown deadlines (never placed on the grid). */
  undated: TimelineItem[];
  /** Listings due after the window (a hint: "12 more after 23 Nov"). */
  later: number;
  /** Listings due inside the window. */
  inWindow: number;
}

/**
 * Bucket feed rows into the visible weeks. Duplicate ids (a listing on two cached pages) keep their
 * first occurrence; hidden rows are dropped.
 */
export function buildTimeline(
  rows: readonly FeedItemDTO[],
  { now, timeZone, weeks }: { now: Date; timeZone: string; weeks: number },
): TimelineModel {
  const todayKey = dayKey(now, timeZone);
  const grid = buildWeeks(todayKey, WEEKS_BEFORE, Math.max(1, weeks) - 1);
  const from = grid[0]!.start;
  const to = grid[grid.length - 1]!.days[6]!;
  const seen = new Set<string>();
  const items: TimelineItem[] = [];
  for (const row of rows) {
    if (row.hidden || seen.has(row.listing.id)) continue;
    seen.add(row.listing.id);
    items.push(toTimelineItem(row));
  }
  const { byDay: all, undated } = bucketByDay(items, timeZone);
  const byDay = new Map<string, TimelineItem[]>();
  let later = 0;
  let inWindow = 0;
  for (const [key, list] of all) {
    if (diffDays(from, key) < 0) continue;
    if (diffDays(key, to) < 0) {
      later += list.length;
      continue;
    }
    byDay.set(key, list);
    inWindow += list.length;
  }
  return { weeks: grid, todayKey, range: { from, to }, byDay, undated, later, inWindow };
}

/** The pills a day cell shows, and how many hide behind "+N more". */
export function visiblePills<T>(list: readonly T[], max = MAX_PILLS_PER_DAY): { shown: T[]; more: number } {
  if (list.length <= max) return { shown: [...list], more: 0 };
  // Keep a row for the "+N more" button so the cell never grows past `max` lines.
  return { shown: list.slice(0, max - 1), more: list.length - (max - 1) };
}

// ── Keyboard: roving focus across the pills of the visible days ─────────────────────────────────

/** Ordered focus targets: per day, the pill ids shown (plus a "more" target when some are hidden). */
export interface PillGrid {
  /** Day keys in calendar order (every day of the window, empty ones included). */
  days: string[];
  /** Day key → focusable target ids in that cell (pill ids, then `more:<day>`). */
  cells: Map<string, string[]>;
}

export function moreTargetId(day: string): string {
  return `more:${day}`;
}

export function buildPillGrid(model: TimelineModel, max = MAX_PILLS_PER_DAY): PillGrid {
  const days = model.weeks.flatMap((w) => w.days);
  const cells = new Map<string, string[]>();
  for (const day of days) {
    const list = model.byDay.get(day) ?? [];
    if (!list.length) continue;
    const { shown, more } = visiblePills(list, max);
    cells.set(day, [...shown.map((i) => i.id), ...(more > 0 ? [moreTargetId(day)] : [])]);
  }
  return { days, cells };
}

export interface GridPosition {
  day: string;
  index: number;
}

export type GridMove = 'left' | 'right' | 'up' | 'down' | 'weekLeft' | 'weekRight' | 'home' | 'end';

export function positionOf(grid: PillGrid, id: string): GridPosition | null {
  for (const [day, ids] of grid.cells) {
    const index = ids.indexOf(id);
    if (index !== -1) return { day, index };
  }
  return null;
}

/** First target on or after `day` (searching forward), else the nearest one before it. */
export function nearestTarget(grid: PillGrid, day: string, preferIndex = 0): string | null {
  const start = Math.max(0, grid.days.indexOf(day));
  for (let i = start; i < grid.days.length; i += 1) {
    const ids = grid.cells.get(grid.days[i]!);
    if (ids?.length) return ids[Math.min(preferIndex, ids.length - 1)] ?? null;
  }
  for (let i = start - 1; i >= 0; i -= 1) {
    const ids = grid.cells.get(grid.days[i]!);
    if (ids?.length) return ids[Math.min(preferIndex, ids.length - 1)] ?? null;
  }
  return null;
}

/**
 * Where focus goes for an arrow key. Left/right jump to the nearest day that has pills (keeping the
 * row index where possible), up/down move within a day, Shift+←/→ jump a week. Never wraps; returns
 * the same id at the edges.
 */
export function moveInGrid(grid: PillGrid, fromId: string, move: GridMove): string {
  const at = positionOf(grid, fromId);
  if (!at) return fromId;
  const ids = grid.cells.get(at.day) ?? [];
  const dayIndex = grid.days.indexOf(at.day);
  const scan = (step: 1 | -1, startOffset: number): string | null => {
    for (let i = dayIndex + startOffset * step; i >= 0 && i < grid.days.length; i += step) {
      const target = grid.cells.get(grid.days[i]!);
      if (target?.length) return target[Math.min(at.index, target.length - 1)] ?? null;
    }
    return null;
  };
  switch (move) {
    case 'up':
      return ids[Math.max(0, at.index - 1)] ?? fromId;
    case 'down':
      return ids[Math.min(ids.length - 1, at.index + 1)] ?? fromId;
    case 'right':
      return scan(1, 1) ?? fromId;
    case 'left':
      return scan(-1, 1) ?? fromId;
    case 'weekRight':
      return scan(1, 7) ?? scan(1, 1) ?? fromId;
    case 'weekLeft':
      return scan(-1, 7) ?? scan(-1, 1) ?? fromId;
    case 'home': {
      const first = [...grid.cells.values()][0];
      return first?.[0] ?? fromId;
    }
    case 'end': {
      const all = [...grid.cells.values()];
      const last = all[all.length - 1];
      return last?.[last.length - 1] ?? fromId;
    }
  }
}

export function moveForKey(event: { key: string; shiftKey?: boolean }): GridMove | null {
  switch (event.key) {
    case 'ArrowLeft':
      return event.shiftKey ? 'weekLeft' : 'left';
    case 'ArrowRight':
      return event.shiftKey ? 'weekRight' : 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Home':
      return 'home';
    case 'End':
      return 'end';
    default:
      return null;
  }
}

/** Index (into `weeks`) of the week containing `day`, clamped into range. */
export function weekIndexForDay(weeks: readonly WeekRow[], day: string): number {
  const index = weeks.findIndex((w) => diffDays(w.start, day) >= 0 && diffDays(w.start, day) < 7);
  if (index !== -1) return index;
  return weeks.length && diffDays(weeks[0]!.start, day) < 0 ? 0 : Math.max(0, weeks.length - 1);
}

/** Every listing in display order (dated by deadline, then undated): drawer prev/next. */
export function timelineOrder(model: TimelineModel): string[] {
  const days = model.weeks.flatMap((w) => w.days);
  return [...days.flatMap((d) => (model.byDay.get(d) ?? []).map((i) => i.id)), ...model.undated.map((i) => i.id)];
}

// ── URL params (/deadlines?types=…&minFit=…&weeks=8&saved=1&open=<id>) ──────────────────────────

export interface DeadlineParams {
  types: OpportunityType[];
  minFit: number;
  weeks: WeeksOption;
  savedOnly: boolean;
}

export const DEFAULT_DEADLINE_PARAMS: Readonly<DeadlineParams> = Object.freeze({
  types: [],
  minFit: DEFAULT_DEADLINE_MIN_FIT,
  weeks: DEFAULT_WEEKS,
  savedOnly: false,
});

export function deadlineParamsFrom(params: URLSearchParams): DeadlineParams {
  const types = (params.get('types') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t, i, all): t is OpportunityType => (OPPORTUNITY_TYPES as readonly string[]).includes(t) && all.indexOf(t) === i);
  const fitRaw = Number(params.get('minFit'));
  const minFit =
    params.get('minFit') != null && Number.isFinite(fitRaw)
      ? Math.min(100, Math.max(0, Math.round(fitRaw / 5) * 5))
      : DEFAULT_DEADLINE_MIN_FIT;
  const weeksRaw = Number(params.get('weeks'));
  const weeks = (WEEK_OPTIONS as readonly number[]).includes(weeksRaw) ? (weeksRaw as WeeksOption) : DEFAULT_WEEKS;
  const saved = params.get('saved');
  return { types, minFit, weeks, savedOnly: saved === '1' || saved === 'true' };
}

/** Writes the params into a copy of `base` (keeps `open` and anything else); defaults are omitted. */
export function deadlineParamsTo(value: DeadlineParams, base = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of ['types', 'minFit', 'weeks', 'saved']) next.delete(key);
  if (value.types.length) next.set('types', [...value.types].sort().join(','));
  if (value.minFit !== DEFAULT_DEADLINE_MIN_FIT) next.set('minFit', String(value.minFit));
  if (value.weeks !== DEFAULT_WEEKS) next.set('weeks', String(value.weeks));
  if (value.savedOnly) next.set('saved', '1');
  return next;
}

/** The feed query behind the timeline (without sort/paging, which the data hook adds). */
export function deadlineFeedQuery(value: DeadlineParams): FeedFilters {
  const query: FeedFilters = {};
  if (value.types.length) query.types = [...value.types].sort();
  if (value.minFit > 0) query.minFit = value.minFit;
  if (value.savedOnly) query.savedOnly = true;
  return query;
}
