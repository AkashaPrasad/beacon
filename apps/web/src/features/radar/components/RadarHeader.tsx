/**
 * The calm top of the radar: a friendly "Today" band (greeting, what changed since the last visit,
 * warming-up progress), and a single toolbar row with search, Filters (a popover, or a bottom sheet on
 * phones; "Pin as a sidebar" turns it into the shell rail) and Tune (minimum fit with its live count,
 * sort, view and saved views). Every control from the old toolbar is still here, one click away.
 */
import { formatShortDate, springs, tweens } from '@kestrel/ui';
import { CalendarRange, CircleCheck, CircleDashed, LayoutGrid, Radar, Settings2, SlidersHorizontal, X } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { RadarSort, RadarView } from '../lib/filters';
import { formatCount } from '../lib/format';
import type { SavedView } from '../lib/savedViews';

import type { WarmingSummary } from './FeedStates';
import { SavedViews } from './FilterRail';
import { FitThreshold, ViewSwitch, type FitThresholdProps } from './RadarToolbar';

// ── Today band ────────────────────────────────────────────────────────────────────────────────

function greeting(nowMs: number): string {
  const hour = new Date(nowMs).getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Count({ value }: { value: number }) {
  return <strong className="font-mono font-medium text-fg">{formatCount(value)}</strong>;
}

export function TodayBand({
  name,
  summary,
  warming,
  showReady,
  slow,
  lastSeen,
  nowMs,
  onShowNew,
  onSavedOnly,
  onDismiss,
}: {
  name: string | null;
  summary: WarmingSummary | undefined;
  warming: boolean;
  showReady: boolean;
  slow: boolean;
  lastSeen: Date | null;
  nowMs: number;
  onShowNew: () => void;
  onSavedOnly: () => void;
  onDismiss: () => void;
}) {
  const first = name?.trim().split(/\s+/)[0] ?? null;
  const hello = `${greeting(nowMs)}${first ? `, ${first}` : ''}.`;
  const progress = summary?.progress;
  const fraction = progress && progress.total > 0 ? progress.done / progress.total : null;

  if (warming) {
    return (
      <div data-testid="radar-warming-strip" className="relative mx-gutter mt-3 overflow-hidden rounded-lg border border-border bg-surface-sunken">
        <div data-testid="radar-warming-up" data-phase="warming" className="flex items-start gap-3 px-4 py-3" aria-live="polite">
          <CircleDashed
            className="mt-0.5 size-4 shrink-0 animate-spin text-fg-tertiary [animation-duration:2.4s] motion-reduce:animate-none"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="min-w-0 text-small text-fg-secondary">
            <p>
              <strong className="font-medium text-fg">Your radar is warming up.</strong>{' '}
              {progress
                ? `Ranking ${progress.done} of ${progress.total} packs. New fits appear here as each one finishes.`
                : 'New fits appear here as each source finishes.'}
            </p>
            <p className="mt-0.5 text-caption text-fg-tertiary">
              {slow ? 'Taking a little longer than usual. Feel free to browse; rows keep arriving.' : 'Grab a coffee, it only takes a minute.'}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Ranking progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction == null ? undefined : Math.round(fraction * 100)}
          className="absolute inset-x-0 bottom-0 h-0.5"
        >
          {fraction != null && (
            <m.span
              className="block h-full origin-left bg-accent-strong"
              initial={false}
              animate={{ scaleX: Math.max(0.04, fraction) }}
              transition={tweens.count}
            />
          )}
        </div>
      </div>
    );
  }

  const newFits = summary?.newSinceLastVisit ?? 0;
  const deadlines = summary?.deadlinesThisWeek ?? 0;
  const saved = summary?.saved ?? 0;
  return (
    <m.section
      data-testid="radar-summary"
      aria-label="Today"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: springs.smooth }}
      className="mx-gutter mt-3 flex items-start gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-3"
    >
      {showReady ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Radar className="mt-0.5 size-4 shrink-0 text-accent-strong" strokeWidth={1.5} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 text-small text-fg-secondary" role="status">
        <p className="font-medium text-fg">{showReady ? `Your radar is ready${first ? `, ${first}` : ''}.` : hello}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {showReady ? (
            <span>
              <Count value={summary?.total ?? 0} /> fits ranked. Your own sources keep updating in the background.
            </span>
          ) : (
            <>
              {newFits > 0 ? (
                <button
                  type="button"
                  onClick={onShowNew}
                  data-testid="radar-summary-show-new"
                  className="rounded-xs underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring"
                >
                  <Count value={newFits} /> new {newFits === 1 ? 'fit' : 'fits'}
                  {lastSeen ? ` since ${formatShortDate(lastSeen)}` : ''}
                </button>
              ) : (
                <span>Nothing new{lastSeen ? ` since ${formatShortDate(lastSeen)}` : ''}, so the best of the rest is below.</span>
              )}
              <span aria-hidden="true">·</span>
              <Link to="/deadlines" className="rounded-xs underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring">
                <Count value={deadlines} /> {deadlines === 1 ? 'deadline' : 'deadlines'} this week
              </Link>
              {saved > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={onSavedOnly} className="rounded-xs underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring">
                    <Count value={saved} /> saved
                  </button>
                </>
              )}
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        aria-label="Hide today's summary until your next visit"
        onClick={onDismiss}
        className="-mr-1 grid size-7 shrink-0 place-items-center rounded-sm text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </m.section>
  );
}

// ── Tune ──────────────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: RadarSort; label: string }[] = [
  { value: 'fit', label: 'Best fit' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'posted', label: 'Newest' },
];

const VIEW_ICON: Record<RadarView, typeof LayoutGrid | null> = { list: null, timeline: CalendarRange, board: LayoutGrid };

export function TunePopover({
  fit,
  sort,
  onSort,
  view,
  onView,
  search,
  onApplyView,
  compact = false,
}: {
  fit: FitThresholdProps;
  sort: RadarSort;
  onSort: (sort: RadarSort) => void;
  view: RadarView;
  onView: (view: RadarView) => void;
  search: string;
  onApplyView: (view: SavedView) => void;
  compact?: boolean;
}) {
  const ViewIcon = VIEW_ICON[view];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="radar-tune" aria-label={`Tune: fit at least ${fit.value}, sorted by ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort}, ${view} view`}>
          <Settings2 strokeWidth={1.5} aria-hidden="true" />
          {!compact && 'Tune'}
          <span className="font-mono text-mono-sm text-fg-tertiary">≥ {fit.value}</span>
          {ViewIcon && <ViewIcon className="text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-4 p-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg-tertiary uppercase">Minimum fit</h3>
          <FitThreshold {...fit} testId="radar-fit-threshold" countTestId="radar-total-live" sliderClassName="flex-1" className="w-full" />
          <p className="text-caption text-fg-tertiary">Raise it to see only the strongest matches; lower it to explore.</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg-tertiary uppercase" id="radar-sort-label">
            Sort by
          </h3>
          <div role="radiogroup" aria-labelledby="radar-sort-label" className="flex rounded-sm bg-surface-sunken p-0.5">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={sort === option.value}
                data-testid={`radar-sort-${option.value}`}
                onClick={() => onSort(option.value)}
                className={cn(
                  'h-7 flex-1 rounded-xs text-small transition-colors duration-fast focus-visible:focus-ring',
                  sort === option.value ? 'bg-surface-raised text-fg shadow-sm' : 'text-fg-secondary hover:text-fg',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg-tertiary uppercase">View</h3>
          <ViewSwitch value={view} onChange={onView} group="radar-view-tune" showLabels />
        </section>
        <section className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <h3 className="text-label text-fg-tertiary uppercase">Saved views</h3>
          <SavedViews search={search} onApply={onApplyView} />
        </section>
      </PopoverContent>
    </Popover>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────────────────────

export function FiltersControl({
  phone,
  open,
  onOpenChange,
  count,
  children,
}: {
  phone: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  children: ReactNode;
}) {
  const trigger = (
    <Button
      variant={count > 0 ? 'secondary' : 'ghost'}
      size="sm"
      data-testid="radar-filters-button"
      aria-label={`Filters${count ? `, ${count} active` : ''}`}
      aria-keyshortcuts="["
      onClick={phone ? () => onOpenChange(true) : undefined}
      className={cn(count > 0 && 'border-accent-strong/40')}
    >
      <SlidersHorizontal strokeWidth={1.5} aria-hidden="true" />
      Filters
      {count > 0 && <span className="font-mono text-mono-sm text-accent-strong">{count}</span>}
    </Button>
  );
  if (phone) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent handleLabel="Close filters" className="max-h-[85dvh]">
            <DrawerTitle className="sr-only">Filters</DrawerTitle>
            <DrawerDescription className="sr-only">{count ? `${count} active` : 'Narrow down what reaches your radar'}</DrawerDescription>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(70vh,40rem)] w-80 overflow-y-auto overscroll-contain p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}
