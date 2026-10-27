/**
 * Radar filter rail (DESIGN §6.1 "Radar filter rail", §10.2). Inline at ≥ lg (collapsible to icons
 * with `[`, persisted by the shell), a left Sheet at md and a bottom sheet on phones (same content).
 *
 * Groups (each collapsible, persisted): Type · Deadline · Work mode & location · Stipend floor ·
 * Grad year · Company · Source · Freshness · Saved only, then Saved views (localStorage + palette).
 */
import {
  Bookmark,
  ChevronDown,
  Layers,
  Pin,
  PinOff,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';

import { useSources } from '@/api/sources';
import { toggleRail, useRailCollapsed } from '@/components/shell/shell-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { readJson, writeJson } from '@/lib/storage';
import { withUndo } from '@/lib/undo';
import { cn } from '@/lib/utils';
import { OPPORTUNITY_TYPES, type OpportunityType } from '@kestrel/shared';
import { TYPE_META, typeTone } from '@kestrel/ui';

import {
  DEADLINE_WINDOWS,
  FRESHNESS_WINDOWS,
  REMOTE_FILTERS,
  remoteLabel,
  type RadarFilters,
} from '../lib/filters';
import {
  deleteView,
  restoreView,
  saveView,
  useSavedViews,
  type SavedView,
} from '../lib/savedViews';

// ── Persisted open/closed state per group ────────────────────────────────────

const GROUPS_KEY = 'beacon:radar:rail-groups';
let closedGroups: Record<string, boolean> = readJson<Record<string, boolean>>(GROUPS_KEY, {});
const groupListeners = new Set<() => void>();
function toggleGroup(id: string) {
  closedGroups = { ...closedGroups, [id]: !closedGroups[id] };
  writeJson(GROUPS_KEY, closedGroups);
  groupListeners.forEach((l) => l());
}
function useClosedGroups() {
  return useSyncExternalStore(
    (l) => {
      groupListeners.add(l);
      return () => groupListeners.delete(l);
    },
    () => closedGroups,
    () => closedGroups,
  );
}

function Group({
  id,
  label,
  count,
  defaultClosed = false,
  children,
}: {
  id: string;
  label: string;
  count?: ReactNode;
  /** Secondary facets start collapsed (UX-RESTRUCTURE [RAD]: 5 open facets, the rest show their value). */
  defaultClosed?: boolean;
  children: ReactNode;
}) {
  const stored = useClosedGroups()[id];
  const closed = stored == null ? defaultClosed : Boolean(stored);
  const bodyId = useId();
  return (
    <section className="border-b border-border-subtle px-3 py-2.5 last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={!closed}
          aria-controls={bodyId}
          onClick={() => toggleGroup(id)}
          className="flex w-full items-center gap-1.5 rounded-xs py-0.5 text-left text-label text-fg-tertiary uppercase hover:text-fg-secondary focus-visible:focus-ring"
        >
          <span className="flex-1">{label}</span>
          {count != null && <span className="font-mono text-mono-sm normal-case">{count}</span>}
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform duration-fast ease-out',
              closed && '-rotate-90',
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {!closed && (
          <m.div
            id={bodyId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-2"
          >
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** A radio list rendered as compact rows (deadline window, freshness, grad year). */
function RadioRows<T extends string | number>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T | null;
  options: { value: T | null; label: string }[];
  onChange: (value: T | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-0.5">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-7 items-center gap-2 rounded-sm px-1.5 text-small text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring-inset',
              checked && 'text-fg',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-3.5 place-items-center rounded-full border',
                checked ? 'border-accent-strong' : 'border-border-input',
              )}
            >
              {checked && <span className="size-1.5 rounded-full bg-accent-strong" />}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Text input that adds chips (locations, companies). */
function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const add = () => {
    const next = draft.trim();
    if (next && !values.includes(next)) onChange([...values, next]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <input
          aria-label={label}
          value={draft}
          list={suggestions.length ? listId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-7 min-w-0 flex-1 rounded-sm border border-border-input bg-surface-raised px-2 text-small text-fg placeholder:text-fg-tertiary hover:border-fg-tertiary focus-visible:focus-ring"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Add ${label.toLowerCase()}`}
          onClick={add}
          disabled={!draft.trim()}
        >
          <Plus strokeWidth={1.5} />
        </Button>
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.slice(0, 30).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex h-6 max-w-full items-center gap-1 rounded-xs bg-accent-subtle pr-0.5 pl-2 text-caption text-accent-subtle-fg"
            >
              <span className="truncate">{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="grid size-5 shrink-0 place-items-center rounded-xs hover:bg-surface-hover focus-visible:focus-ring"
              >
                <X className="size-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const STIPEND_MAX = 100_000;
const STIPEND_STEP = 5_000;

function stipendLabel(value: number): string {
  if (!value) return 'No minimum';
  return `≥ ₹${(value / 1000).toFixed(0)}k/mo`;
}

const thisYear = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => thisYear - 1 + i);

// ── Saved views ──────────────────────────────────────────────────────────────

/** Saved views: name the current filters and view, then come back to them in one click (or ⌘K). */
export function SavedViews({
  search,
  onApply,
}: {
  search: string;
  onApply: (view: SavedView) => void;
}) {
  const views = useSavedViews();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const current = views.find((v) => v.search === search);
  return (
    <div className="flex flex-col">
      {views.length === 0 && (
        <p className="pb-1 text-caption text-fg-tertiary">
          Save the filters you use most, then switch with one click.
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {views.map((view, index) => (
          <li key={view.id} className="group/view flex items-center">
            <button
              type="button"
              onClick={() => onApply(view)}
              aria-current={view.search === search ? 'true' : undefined}
              className={cn(
                'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left text-small text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring-inset',
                view.search === search && 'bg-surface-active text-fg',
              )}
            >
              <Layers className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{view.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Delete view ${view.name}`}
              onClick={() => {
                const removed = deleteView(view.id);
                if (!removed) return;
                withUndo({
                  message: `Deleted view “${removed.name}”.`,
                  run: () => undefined,
                  undo: () => restoreView(removed, index),
                }).promise.catch(() => undefined);
              }}
              className="grid size-7 place-items-center rounded-sm text-fg-tertiary opacity-0 group-hover/view:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:focus-ring"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
      {naming ? (
        <form
          className="mt-1.5 flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            saveView(name, search);
            setNaming(false);
            setName('');
          }}
        >
          <input
            autoFocus
            aria-label="View name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setNaming(false)}
            placeholder="e.g. Remote internships"
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-input bg-surface-raised px-2 text-small text-fg placeholder:text-fg-tertiary focus-visible:focus-ring"
          />
          <Button size="sm" variant="secondary" type="submit">
            Save
          </Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start"
          data-testid="radar-save-view"
          disabled={!search || Boolean(current)}
          onClick={() => setNaming(true)}
        >
          <Bookmark strokeWidth={1.5} aria-hidden="true" />
          {current ? `Saved as “${current.name}”` : 'Save this view'}
        </Button>
      )}
    </div>
  );
}

// ── Rail ─────────────────────────────────────────────────────────────────────

export interface FilterRailProps {
  filters: RadarFilters;
  onChange: (next: RadarFilters) => void;
  onReset: () => void;
  activeCount: number;
  typeCounts?: Partial<Record<OpportunityType, number>>;
  companySuggestions: string[];
  /** Inline rail (pinned, ≥ lg) honours the shell's collapsed state; the popover never collapses. */
  variant: 'inline' | 'sheet';
  /** "Pin as sidebar" (popover) / "Unpin" (rail). Omitted where pinning is not available (phones). */
  pin?: { pinned: boolean; onToggle: () => void };
}

export function FilterRail({
  filters,
  onChange,
  onReset,
  activeCount,
  typeCounts,
  companySuggestions,
  variant,
  pin,
}: FilterRailProps) {
  const collapsedState = useRailCollapsed();
  const collapsed = variant === 'inline' && collapsedState;
  const sources = useSources();
  const set = <K extends keyof RadarFilters>(key: K, value: RadarFilters[K]) =>
    onChange({ ...filters, [key]: value });

  if (collapsed) {
    return (
      <div
        data-testid="radar-filter-rail"
        data-collapsed="true"
        className="flex flex-col items-center gap-2 py-3"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleRail}
              aria-label={`Show filters${activeCount ? `, ${activeCount} active` : ''}`}
              aria-keyshortcuts="["
              className="relative grid size-8 place-items-center rounded-sm text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
            >
              <SlidersHorizontal className="size-5" strokeWidth={1.5} />
              {activeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] text-accent-fg">
                  {activeCount}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Show filters <kbd className="font-mono text-mono-sm">[</kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div data-testid="radar-filter-rail" className="flex flex-col pb-6">
      <div className="flex h-11 items-center gap-2 border-b border-border-subtle px-3">
        <h2 className="flex-1 text-label text-fg-tertiary uppercase">
          Filters
          {activeCount ? (
            <span className="ml-1.5 font-mono text-mono-sm normal-case">{activeCount}</span>
          ) : null}
        </h2>
        {activeCount > 0 && (
          <Button variant="ghost" size="xs" onClick={onReset}>
            Reset
          </Button>
        )}
        {pin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={pin.onToggle}
                aria-label={pin.pinned ? 'Unpin filters' : 'Pin filters as a sidebar'}
                aria-pressed={pin.pinned}
                data-testid="radar-filters-pin"
                className="grid size-7 place-items-center rounded-sm text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
              >
                {pin.pinned ? (
                  <PinOff className="size-4" strokeWidth={1.5} />
                ) : (
                  <Pin className="size-4" strokeWidth={1.5} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {pin.pinned ? 'Unpin: back to a popover' : 'Pin as a sidebar'}
            </TooltipContent>
          </Tooltip>
        )}
        {variant === 'inline' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleRail}
                aria-label="Collapse filters"
                aria-keyshortcuts="["
                className="grid size-7 place-items-center rounded-sm text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
              >
                <span aria-hidden="true" className="font-mono text-mono-sm">
                  «
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Collapse <kbd className="font-mono text-mono-sm">[</kbd>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Group id="type" label="Type">
        <ul className="flex flex-col gap-0.5">
          {OPPORTUNITY_TYPES.map((type) => {
            const { label } = TYPE_META[type];
            const checked = filters.types.includes(type);
            const id = `radar-type-${type}`;
            return (
              <li key={type}>
                <label
                  htmlFor={id}
                  className="flex h-7 cursor-default items-center gap-2 rounded-sm px-1.5 text-small text-fg-secondary hover:bg-surface-hover hover:text-fg"
                >
                  <Checkbox
                    id={id}
                    data-testid={`radar-filter-type-${type}`}
                    checked={checked}
                    onCheckedChange={(value) =>
                      set(
                        'types',
                        value === true
                          ? [...filters.types, type]
                          : filters.types.filter((t) => t !== type),
                      )
                    }
                  />
                  <span
                    aria-hidden="true"
                    className={cn('size-2 shrink-0 rounded-full', typeTone(type).dot)}
                  />
                  <span className={cn('flex-1', checked && 'text-fg')}>{label}</span>
                  {typeCounts?.[type] != null && (
                    <span className="font-mono text-mono-sm text-fg-tertiary">
                      {typeCounts[type]}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group id="deadline" label="Deadline">
        <RadioRows
          name="Deadline window"
          value={filters.deadlineWithin}
          onChange={(value) => set('deadlineWithin', value)}
          options={[
            { value: null, label: 'Any time' },
            ...DEADLINE_WINDOWS.map((d) => ({ value: d, label: `Within ${d} days` })),
          ]}
        />
      </Group>

      <Group id="where" label="Work mode & location">
        <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Work mode">
          {REMOTE_FILTERS.map((mode) => {
            const on = filters.remote.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={on}
                data-testid={`radar-filter-remote-${mode}`}
                onClick={() =>
                  set(
                    'remote',
                    on ? filters.remote.filter((r) => r !== mode) : [...filters.remote, mode],
                  )
                }
                className={cn(
                  'h-7 rounded-sm px-2.5 text-small transition-[background-color,transform] duration-fast active:scale-[0.97] focus-visible:focus-ring',
                  on
                    ? 'bg-accent-subtle text-accent-subtle-fg'
                    : 'bg-surface-sunken text-fg-secondary hover:bg-surface-hover',
                )}
              >
                {remoteLabel(mode)}
              </button>
            );
          })}
        </div>
        <ChipInput
          label="Location"
          values={filters.locations}
          onChange={(values) => set('locations', values)}
          placeholder="City, e.g. Bengaluru"
        />
      </Group>

      <Group
        id="stipend"
        label="Stipend floor"
        count={<span className="text-fg-secondary">{stipendLabel(filters.minStipend ?? 0)}</span>}
      >
        <Slider
          value={[filters.minStipend ?? 0]}
          min={0}
          max={STIPEND_MAX}
          step={STIPEND_STEP}
          thumbLabels={[`Stipend floor, ${stipendLabel(filters.minStipend ?? 0)}`]}
          onValueCommit={([value = 0]) => set('minStipend', value > 0 ? value : null)}
          className="my-1"
          data-testid="radar-filter-stipend"
        />
        <p className="mt-1 text-caption text-fg-tertiary">
          Monthly, in rupees. Hides unpaid and unstated.
        </p>
      </Group>

      <Group id="grad" label="Grad year" defaultClosed>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Graduation year">
          {[null, ...GRAD_YEARS].map((year) => {
            const on = filters.gradYear === year;
            return (
              <button
                key={String(year)}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set('gradYear', year)}
                className={cn(
                  'h-7 rounded-sm px-2 font-mono text-mono-sm transition-colors duration-fast focus-visible:focus-ring',
                  on
                    ? 'bg-accent-subtle text-accent-subtle-fg'
                    : 'bg-surface-sunken text-fg-secondary hover:bg-surface-hover',
                  year == null && 'font-sans text-small',
                )}
              >
                {year ?? 'Any'}
              </button>
            );
          })}
        </div>
      </Group>

      <Group id="company" label="Company" defaultClosed>
        <ChipInput
          label="Company"
          values={filters.companies}
          onChange={(values) => set('companies', values)}
          placeholder="Company name"
          suggestions={companySuggestions}
        />
      </Group>

      <Group id="source" label="Source" defaultClosed>
        {sources.data && sources.data.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {sources.data.map((source) => {
              const checked = filters.sourceIds.includes(source.id);
              const id = `radar-source-${source.id}`;
              return (
                <li key={source.id}>
                  <label
                    htmlFor={id}
                    className="flex h-7 items-center gap-2 rounded-sm px-1.5 text-small text-fg-secondary hover:bg-surface-hover hover:text-fg"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) =>
                        set(
                          'sourceIds',
                          value === true
                            ? [...filters.sourceIds, source.id]
                            : filters.sourceIds.filter((s) => s !== source.id),
                        )
                      }
                    />
                    <span className="truncate">{source.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-caption text-fg-tertiary">
            All your packs are included. Add a personal source to filter by it.
          </p>
        )}
      </Group>

      <Group id="fresh" label="Freshness" defaultClosed>
        <RadioRows
          name="Posted within"
          value={filters.postedWithin}
          onChange={(value) => set('postedWithin', value)}
          options={[
            { value: null, label: 'Any time' },
            ...FRESHNESS_WINDOWS.map((d) => ({
              value: d,
              label: d === 1 ? 'Posted today' : `Last ${d} days`,
            })),
          ]}
        />
      </Group>

      <section className="flex items-center gap-2 border-b border-border-subtle px-3 py-3">
        <label htmlFor="radar-saved-only" className="flex-1 text-small text-fg-secondary">
          Saved only
        </label>
        <Switch
          id="radar-saved-only"
          data-testid="radar-filter-saved"
          checked={filters.savedOnly}
          onCheckedChange={(value) => set('savedOnly', value)}
        />
      </section>
    </div>
  );
}
