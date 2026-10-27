/**
 * Radar toolbar controls (DESIGN §6.1, §10.2). The same controls render in the shell's top-bar slot
 * (≥ lg) and in the page's own toolbar row below lg (the slot is hidden there).
 *
 * - Search → `q` (debounced 200 ms, `/` focuses it).
 * - Fit threshold slider → `minFit` (steps of 5, thumb in the band colour, value in mono, live count).
 * - View switch List / Timeline / Board (keys 1 2 3) with a sliding indicator (MOTION §5.13).
 * - Sort: Best fit / Deadline / Newest.
 */
import {
  ArrowDownWideNarrow,
  CalendarRange,
  ChevronDown,
  Columns3,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import { LayoutGroup, m } from 'motion/react';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fitBandOf, layoutIds, springs } from '@kestrel/ui';

import { clampMinFit, FIT_STEP, type RadarSort, type RadarView } from '../lib/filters';
import { formatCount } from '../lib/format';

// ── Search ───────────────────────────────────────────────────────────────────

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SEARCH_DEBOUNCE_MS = 200;

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, className },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Follow external changes (chip removal, saved view) without clobbering typing.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const push = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSynced(next);
      onChange(next);
    }, SEARCH_DEBOUNCE_MS);
  };
  return (
    <label className={cn('relative flex min-w-0 items-center', className)}>
      <span className="sr-only">Search listings</span>
      <Search
        className="pointer-events-none absolute left-2.5 size-4 text-fg-tertiary"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        data-testid="radar-search"
        value={draft}
        onChange={(event) => push(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.blur();
          } else if (event.key === 'Enter') {
            if (timer.current) clearTimeout(timer.current);
            setSynced(draft);
            onChange(draft);
          }
        }}
        placeholder="Search title, company, skill"
        aria-keyshortcuts="/"
        className={cn(
          'h-control-sm w-full min-w-0 rounded-sm border border-border-input bg-surface-raised pr-7 pl-8 text-small text-fg',
          'placeholder:text-fg-tertiary hover:border-fg-tertiary focus-visible:focus-ring [&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setDraft('');
            setSynced('');
            onChange('');
          }}
          className="absolute right-1 grid size-6 place-items-center rounded-xs text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-1.5 hidden h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-surface-sunken px-1 font-mono text-mono-sm text-fg-tertiary lg:inline-flex">
          /
        </kbd>
      )}
    </label>
  );
});

// ── Fit threshold ────────────────────────────────────────────────────────────

const BAND_THUMB: Record<string, string> = {
  low: 'bg-fit-low border-fit-low',
  mid: 'bg-fit-mid border-fit-mid',
  good: 'bg-fit-good border-fit-good',
  great: 'bg-fit-great border-fit-great',
};

export interface FitThresholdProps {
  value: number;
  onChange: (value: number) => void;
  /** Every intermediate value while dragging (drives the live count). */
  onDraft?: (value: number) => void;
  /** Listings at or above the current threshold (null while unknown). */
  count: number | null;
  pending: boolean;
  /** "fit" / "fits" by default; the deadlines page counts "deadline(s)". */
  noun?: [singular: string, plural: string];
  testId?: string;
  countTestId?: string;
  sliderClassName?: string;
  className?: string;
}

/** Slider commits on release / keyboard step (debounced while dragging), so the feed refetches once. */
export function FitThreshold({
  value,
  onChange,
  onDraft,
  count,
  pending,
  noun = ['fit', 'fits'],
  testId = 'radar-fit-threshold',
  countTestId = 'radar-total',
  sliderClassName,
  className,
}: FitThresholdProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const band = fitBandOf(draft);
  const commit = (next: number) => {
    setSynced(next);
    onChange(next);
  };
  return (
    <div data-testid={testId} className={cn('flex shrink-0 items-center gap-2', className)}>
      <span className="text-small whitespace-nowrap text-fg-secondary" aria-hidden="true">
        Fit
      </span>
      <Slider
        value={[draft]}
        min={0}
        max={100}
        step={FIT_STEP}
        thumbLabels={[`Minimum fit, ${draft}, ${band.label.toLowerCase()} and above`]}
        onValueChange={([next = draft]) => {
          const snapped = clampMinFit(next);
          setDraft(snapped);
          onDraft?.(snapped);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(snapped), 250);
        }}
        onValueCommit={([next = draft]) => {
          if (timer.current) clearTimeout(timer.current);
          commit(clampMinFit(next));
        }}
        rangeClassName={cn(
          band.key === 'great' && 'bg-fit-great',
          band.key === 'good' && 'bg-fit-good',
          band.key === 'mid' && 'bg-fit-mid',
          band.key === 'low' && 'bg-fit-low',
        )}
        thumbClassName={BAND_THUMB[band.key]}
        className={cn('w-28', sliderClassName)}
      />
      <span className="w-9 font-mono text-mono-sm text-fg tabular-nums" aria-hidden="true">
        ≥ {draft}
      </span>
      <span
        data-testid={countTestId}
        aria-live="polite"
        className={cn(
          'min-w-14 font-mono text-mono-sm whitespace-nowrap text-fg-tertiary tabular-nums transition-opacity duration-fade',
          pending && 'opacity-60',
        )}
      >
        {count == null ? '' : `${formatCount(count)} ${count === 1 ? noun[0] : noun[1]}`}
      </span>
    </div>
  );
}

// ── View switch ──────────────────────────────────────────────────────────────

const VIEW_META: Record<RadarView, { label: string; icon: typeof List; key: string }> = {
  grid: { label: 'Grid', icon: LayoutGrid, key: '1' },
  list: { label: 'List', icon: List, key: '2' },
  timeline: { label: 'Timeline', icon: CalendarRange, key: '3' },
  board: { label: 'Board', icon: Columns3, key: '4' },
};

export function ViewSwitch({
  value,
  onChange,
  group = 'radar-view',
  showLabels = true,
}: {
  value: RadarView;
  onChange: (view: RadarView) => void;
  group?: string;
  showLabels?: boolean;
}) {
  return (
    <LayoutGroup id={group}>
      <div
        role="radiogroup"
        aria-label="View"
        className="flex shrink-0 items-center rounded-sm bg-surface-sunken p-0.5"
      >
        {(Object.keys(VIEW_META) as RadarView[]).map((view) => {
          const { label, icon: Icon, key } = VIEW_META[view];
          const selected = value === view;
          return (
            <Tooltip key={view}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  aria-keyshortcuts={key}
                  data-testid={`radar-view-${view}`}
                  onClick={() => onChange(view)}
                  className={cn(
                    'relative flex h-6 items-center gap-1.5 rounded-xs px-2 text-small font-medium transition-[color,transform] duration-fast',
                    'active:scale-[0.97] focus-visible:focus-ring motion-reduce:active:scale-100',
                    selected ? 'text-fg' : 'text-fg-secondary hover:text-fg',
                  )}
                >
                  {selected && (
                    <m.span
                      layoutId={layoutIds.segmentIndicator(group)}
                      transition={springs.snappy}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xs border border-border bg-surface-raised shadow-sm"
                    />
                  )}
                  <Icon className="relative size-4" strokeWidth={1.5} aria-hidden="true" />
                  {showLabels && <span className="relative hidden xl:inline">{label}</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {label}
                <kbd className="font-mono text-mono-sm">{key}</kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// ── Sort ─────────────────────────────────────────────────────────────────────

const SORT_LABEL: Record<RadarSort, string> = {
  fit: 'Best fit',
  deadline: 'Deadline',
  posted: 'Newest',
};

export function SortMenu({
  value,
  onChange,
}: {
  value: RadarSort;
  onChange: (sort: RadarSort) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="radar-sort"
          aria-label={`Sort: ${SORT_LABEL[value]}`}
        >
          <ArrowDownWideNarrow strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden xl:inline">{SORT_LABEL[value]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as RadarSort)}>
          {(Object.keys(SORT_LABEL) as RadarSort[]).map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort} data-testid={`radar-sort-${sort}`}>
              {SORT_LABEL[sort]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Active filter chips ──────────────────────────────────────────────────────

export function ActiveChips({
  chips,
  onRemove,
  onClear,
  trailing,
}: {
  chips: { id: string; label: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  trailing?: ReactNode;
}) {
  if (chips.length === 0 && !trailing) return null;
  return (
    <div className="flex min-h-9 items-center gap-1.5 overflow-x-auto px-gutter py-1 [scrollbar-width:none]">
      {chips.length > 0 && (
        <span className="mr-0.5 shrink-0 text-label text-fg-tertiary uppercase">Active</span>
      )}
      {chips.map((chip) => (
        <m.span
          key={chip.id}
          layout="position"
          transition={{ layout: springs.gentle }}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-xs bg-accent-subtle pr-0.5 pl-2 text-caption font-medium text-accent-subtle-fg"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => onRemove(chip.id)}
            className="grid size-5 place-items-center rounded-xs hover:bg-surface-hover focus-visible:focus-ring"
          >
            <X className="size-3" strokeWidth={2} aria-hidden="true" />
          </button>
        </m.span>
      ))}
      {chips.length > 1 && (
        <Button variant="ghost" size="xs" onClick={onClear} className="shrink-0">
          Clear
        </Button>
      )}
      {trailing}
    </div>
  );
}

// ── Phone chips (DESIGN §10.2 mobile: [Fit ≥ 60 ▾] [Internship ▾] [3] →) ─────────────────────

const CHIP = cn(
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 text-small text-fg',
  'press active:bg-surface-active focus-visible:focus-ring',
);

/** The fit threshold as a chip that opens the slider in a popover; the live count stays on the chip. */
export function FitChip(props: FitThresholdProps) {
  const { value, count, pending } = props;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="radar-fit-threshold"
          className={CHIP}
          aria-label={`Minimum fit ${value}. Change`}
        >
          <span className="font-mono text-mono-sm">≥ {value}</span>
          <span
            data-testid="radar-total"
            className={cn(
              'font-mono text-mono-sm text-fg-tertiary transition-opacity duration-fade',
              pending && 'opacity-60',
            )}
          >
            {count == null ? '' : `${formatCount(count)} ${count === 1 ? 'fit' : 'fits'}`}
          </span>
          <ChevronDown className="size-3.5 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-3">
        <FitThreshold
          {...props}
          testId="radar-fit-threshold-popover"
          countTestId="radar-total-popover"
          sliderClassName="flex-1"
          className="w-full"
        />
      </PopoverContent>
    </Popover>
  );
}

export function ChipButton({
  children,
  active = false,
  className,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        CHIP,
        active && 'border-transparent bg-accent-subtle text-accent-subtle-fg',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
