/**
 * Radar filters ⇄ URL search params ⇄ `GET /v1/feed` query (docs/API.md §6).
 *
 * The URL is the single source of truth for what the feed shows, so a filtered radar can be
 * bookmarked, shared and restored with the back button. Defaults are omitted from the URL to keep
 * links short; parsing is lenient (unknown or malformed values fall back to the default).
 */
import { OPPORTUNITY_TYPES, type OpportunityType } from '@kestrel/shared';

import type { FeedFilters } from '@/api/types';

export const DEADLINE_WINDOWS = [7, 14, 30] as const;
export type DeadlineWindow = (typeof DEADLINE_WINDOWS)[number];

export const FRESHNESS_WINDOWS = [1, 7, 30] as const;
export type FreshnessWindow = (typeof FRESHNESS_WINDOWS)[number];

export const REMOTE_FILTERS = ['remote', 'hybrid', 'onsite'] as const;
export type RemoteFilter = (typeof REMOTE_FILTERS)[number];

export const SORTS = ['fit', 'deadline', 'posted'] as const;
export type RadarSort = (typeof SORTS)[number];

export const VIEWS = ['list', 'timeline', 'board'] as const;
export type RadarView = (typeof VIEWS)[number];

/** Long shots (0–39) are hidden by default: "Fit ≥ 40" (docs/DECISIONS.md). */
export const DEFAULT_MIN_FIT = 40;
export const FIT_STEP = 5;

export interface RadarFilters {
  q: string;
  types: OpportunityType[];
  deadlineWithin: DeadlineWindow | null;
  remote: RemoteFilter[];
  locations: string[];
  /** Monthly INR floor; null = no minimum. */
  minStipend: number | null;
  gradYear: number | null;
  companies: string[];
  sourceIds: string[];
  postedWithin: FreshnessWindow | null;
  savedOnly: boolean;
  minFit: number;
  sort: RadarSort;
}

export const DEFAULT_FILTERS: Readonly<RadarFilters> = Object.freeze({
  q: '',
  types: [],
  deadlineWithin: null,
  remote: [],
  locations: [],
  minStipend: null,
  gradYear: null,
  companies: [],
  sourceIds: [],
  postedWithin: null,
  savedOnly: false,
  minFit: DEFAULT_MIN_FIT,
  sort: 'fit',
});

/** URL param names (short, stable: they end up in bookmarks). */
export const PARAM = {
  q: 'q',
  types: 'types',
  deadlineWithin: 'deadline',
  remote: 'remote',
  locations: 'loc',
  minStipend: 'stipend',
  gradYear: 'grad',
  companies: 'company',
  sourceIds: 'source',
  postedWithin: 'fresh',
  savedOnly: 'saved',
  minFit: 'minFit',
  sort: 'sort',
  view: 'view',
} as const;

const FILTER_PARAM_NAMES: readonly string[] = Object.entries(PARAM)
  .filter(([key]) => key !== 'view')
  .map(([, name]) => name);

function csv(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function intOrNull(value: string | null, min: number, max: number): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function oneOf<T extends string | number>(options: readonly T[], value: unknown): T | null {
  return options.find((option) => String(option) === String(value)) ?? null;
}

/** Snap a threshold to the slider grid (0..100, steps of 5). */
export function clampMinFit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MIN_FIT;
  return Math.min(100, Math.max(0, Math.round(value / FIT_STEP) * FIT_STEP));
}

/** Parse the radar's search params into filters (lenient, never throws). */
export function filtersFromSearchParams(params: URLSearchParams): RadarFilters {
  const types = csv(params.get(PARAM.types)).filter((t): t is OpportunityType =>
    (OPPORTUNITY_TYPES as readonly string[]).includes(t),
  );
  const remote = csv(params.get(PARAM.remote)).filter((r): r is RemoteFilter =>
    (REMOTE_FILTERS as readonly string[]).includes(r),
  );
  const minFitRaw = params.get(PARAM.minFit);
  const minFit =
    minFitRaw != null && minFitRaw.trim() !== '' && Number.isFinite(Number(minFitRaw))
      ? clampMinFit(Number(minFitRaw))
      : DEFAULT_MIN_FIT;
  const stipend = intOrNull(params.get(PARAM.minStipend), 0, 10_000_000);
  return {
    q: (params.get(PARAM.q) ?? '').trim().slice(0, 200),
    types,
    deadlineWithin: oneOf(DEADLINE_WINDOWS, params.get(PARAM.deadlineWithin)),
    remote,
    locations: csv(params.get(PARAM.locations)),
    minStipend: stipend && stipend > 0 ? stipend : null,
    gradYear: intOrNull(params.get(PARAM.gradYear), 1950, 2100),
    companies: csv(params.get(PARAM.companies)),
    sourceIds: csv(params.get(PARAM.sourceIds)),
    postedWithin: oneOf(FRESHNESS_WINDOWS, params.get(PARAM.postedWithin)),
    savedOnly: params.get(PARAM.savedOnly) === '1' || params.get(PARAM.savedOnly) === 'true',
    minFit,
    sort: oneOf(SORTS, params.get(PARAM.sort)) ?? 'fit',
  };
}

/**
 * Write filters into a copy of `base` (other params, e.g. `view`, are preserved). Defaults are
 * removed so `/radar` stays clean.
 */
export function filtersToSearchParams(
  filters: RadarFilters,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const name of FILTER_PARAM_NAMES) next.delete(name);
  const set = (name: string, value: string | null) => {
    if (value != null && value !== '') next.set(name, value);
  };
  set(PARAM.q, filters.q.trim());
  set(PARAM.types, filters.types.join(','));
  set(PARAM.deadlineWithin, filters.deadlineWithin == null ? null : String(filters.deadlineWithin));
  set(PARAM.remote, filters.remote.join(','));
  set(PARAM.locations, filters.locations.join(','));
  set(PARAM.minStipend, filters.minStipend ? String(filters.minStipend) : null);
  set(PARAM.gradYear, filters.gradYear == null ? null : String(filters.gradYear));
  set(PARAM.companies, filters.companies.join(','));
  set(PARAM.sourceIds, filters.sourceIds.join(','));
  set(PARAM.postedWithin, filters.postedWithin == null ? null : String(filters.postedWithin));
  set(PARAM.savedOnly, filters.savedOnly ? '1' : null);
  set(PARAM.minFit, filters.minFit === DEFAULT_MIN_FIT ? null : String(clampMinFit(filters.minFit)));
  set(PARAM.sort, filters.sort === 'fit' ? null : filters.sort);
  return next;
}

export function viewFromSearchParams(params: URLSearchParams): RadarView {
  return oneOf(VIEWS, params.get(PARAM.view)) ?? 'list';
}

/**
 * The query sent to `GET /v1/feed` (without cursor/limit), in the foundation's `FeedFilters` shape
 * (`src/api/types.ts`): arrays are joined as csv by the API client. Keys match docs/API.md §6.
 * Arrays are sorted so equivalent filters share one cache entry.
 */
export function filtersToFeedQuery(filters: RadarFilters): FeedFilters {
  const query: FeedFilters = { sort: filters.sort };
  const q = filters.q.trim();
  if (q) query.q = q;
  if (filters.types.length) query.types = [...filters.types].sort();
  if (filters.remote.length) query.remote = [...filters.remote].sort();
  if (filters.locations.length) query.locations = [...filters.locations];
  if (filters.deadlineWithin != null) query.deadlineWithinDays = filters.deadlineWithin;
  if (filters.postedWithin != null) query.postedWithinDays = filters.postedWithin;
  if (filters.minStipend) {
    query.minStipend = filters.minStipend;
    query.stipendCurrency = 'INR';
  }
  if (filters.gradYear != null) query.gradYear = filters.gradYear;
  if (filters.companies.length) query.companies = [...filters.companies];
  if (filters.sourceIds.length) query.sourceIds = [...filters.sourceIds];
  if (filters.savedOnly) query.savedOnly = true;
  if (filters.minFit > 0) query.minFit = filters.minFit;
  return query;
}

// ── Active-filter chips (toolbar) ────────────────────────────────────────────

export type FilterKey = Exclude<keyof RadarFilters, 'sort'>;

export interface ActiveFilterChip {
  /** Stable id for React keys and test ids. */
  id: string;
  label: string;
  /** Returns the filters with this one removed. */
  remove: (filters: RadarFilters) => RadarFilters;
}

const TYPE_LABEL: Record<OpportunityType, string> = {
  internship: 'Internship',
  fulltime: 'Full-time',
  hackathon: 'Hackathon',
  scholarship: 'Scholarship',
  fellowship: 'Fellowship',
  research: 'Research',
  opensource: 'Open source',
};
const REMOTE_LABEL: Record<RemoteFilter, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

export function typeLabel(type: OpportunityType): string {
  return TYPE_LABEL[type];
}
export function remoteLabel(remote: RemoteFilter): string {
  return REMOTE_LABEL[remote];
}

function shortInr(amount: number): string {
  return amount >= 1000 ? `₹${Math.round(amount / 1000)}k` : `₹${amount}`;
}

/** Everything that narrows the feed except the fit threshold and sort (those have own controls). */
export function activeFilterChips(filters: RadarFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const type of filters.types) {
    chips.push({
      id: `type-${type}`,
      label: TYPE_LABEL[type],
      remove: (f) => ({ ...f, types: f.types.filter((t) => t !== type) }),
    });
  }
  for (const remote of filters.remote) {
    chips.push({
      id: `remote-${remote}`,
      label: REMOTE_LABEL[remote],
      remove: (f) => ({ ...f, remote: f.remote.filter((r) => r !== remote) }),
    });
  }
  for (const location of filters.locations) {
    chips.push({
      id: `loc-${location}`,
      label: location,
      remove: (f) => ({ ...f, locations: f.locations.filter((l) => l !== location) }),
    });
  }
  if (filters.deadlineWithin != null) {
    chips.push({
      id: 'deadline',
      label: `Due ≤ ${filters.deadlineWithin}d`,
      remove: (f) => ({ ...f, deadlineWithin: null }),
    });
  }
  if (filters.minStipend) {
    chips.push({
      id: 'stipend',
      label: `≥ ${shortInr(filters.minStipend)}/mo`,
      remove: (f) => ({ ...f, minStipend: null }),
    });
  }
  if (filters.gradYear != null) {
    chips.push({
      id: 'grad',
      label: `Grad ${filters.gradYear}`,
      remove: (f) => ({ ...f, gradYear: null }),
    });
  }
  for (const company of filters.companies) {
    chips.push({
      id: `company-${company}`,
      label: company,
      remove: (f) => ({ ...f, companies: f.companies.filter((c) => c !== company) }),
    });
  }
  for (const source of filters.sourceIds) {
    chips.push({
      id: `source-${source}`,
      label: `Source ${source.slice(-6)}`,
      remove: (f) => ({ ...f, sourceIds: f.sourceIds.filter((s) => s !== source) }),
    });
  }
  if (filters.postedWithin != null) {
    chips.push({
      id: 'fresh',
      label: filters.postedWithin === 1 ? 'Posted today' : `Posted ≤ ${filters.postedWithin}d`,
      remove: (f) => ({ ...f, postedWithin: null }),
    });
  }
  if (filters.savedOnly) {
    chips.push({ id: 'saved', label: 'Saved only', remove: (f) => ({ ...f, savedOnly: false }) });
  }
  if (filters.q.trim()) {
    chips.push({ id: 'q', label: `“${filters.q.trim()}”`, remove: (f) => ({ ...f, q: '' }) });
  }
  return chips;
}

/** Number of narrowing filters (badge on the "Filters" button). Search and fit are not counted. */
export function activeFilterCount(filters: RadarFilters): number {
  return activeFilterChips(filters).filter((chip) => chip.id !== 'q').length;
}

/** Filters reset to defaults, keeping the threshold and sort the user picked. */
export function clearFilters(filters: RadarFilters): RadarFilters {
  return { ...DEFAULT_FILTERS, minFit: filters.minFit, sort: filters.sort };
}

export function isDefaultFilters(filters: RadarFilters): boolean {
  return filtersToSearchParams(filters).toString() === '';
}

/**
 * The narrowest constraint to suggest relaxing in the "no listings match" empty state
 * (DESIGN §8 #3: "Remote + ₹50k floor + 2026 grads is narrow. [Clear stipend floor]").
 */
export function narrowestFilter(filters: RadarFilters): { label: string; clear: FilterKey } | null {
  if (filters.minStipend) return { label: 'Clear stipend floor', clear: 'minStipend' };
  if (filters.savedOnly) return { label: 'Show all, not just saved', clear: 'savedOnly' };
  if (filters.deadlineWithin != null) return { label: 'Any deadline', clear: 'deadlineWithin' };
  if (filters.postedWithin != null) return { label: 'Any posting date', clear: 'postedWithin' };
  if (filters.gradYear != null) return { label: 'Any grad year', clear: 'gradYear' };
  if (filters.companies.length) return { label: 'All companies', clear: 'companies' };
  if (filters.locations.length) return { label: 'Any location', clear: 'locations' };
  if (filters.remote.length) return { label: 'Any work mode', clear: 'remote' };
  if (filters.sourceIds.length) return { label: 'All sources', clear: 'sourceIds' };
  if (filters.types.length) return { label: 'All types', clear: 'types' };
  if (filters.q.trim()) return { label: 'Clear search', clear: 'q' };
  return null;
}

export function clearFilterKey(filters: RadarFilters, key: FilterKey): RadarFilters {
  return { ...filters, [key]: DEFAULT_FILTERS[key] };
}

/** "Remote + ₹50k floor + 2026 grads" — a sentence fragment naming what narrows the feed. */
export function describeFilters(filters: RadarFilters): string {
  const parts: string[] = [];
  if (filters.types.length === 1 && filters.types[0]) parts.push(TYPE_LABEL[filters.types[0]]);
  else if (filters.types.length > 1) parts.push(`${filters.types.length} types`);
  if (filters.remote.length) parts.push(filters.remote.map((r) => REMOTE_LABEL[r]).join('/'));
  if (filters.locations.length) parts.push(filters.locations.join('/'));
  if (filters.minStipend) parts.push(`${shortInr(filters.minStipend)} floor`);
  if (filters.gradYear != null) parts.push(`${filters.gradYear} grads`);
  if (filters.deadlineWithin != null) parts.push(`due in ${filters.deadlineWithin}d`);
  if (filters.postedWithin != null) parts.push(`posted in ${filters.postedWithin}d`);
  if (filters.companies.length) parts.push(filters.companies.join('/'));
  if (filters.savedOnly) parts.push('saved only');
  return parts.join(' + ');
}
