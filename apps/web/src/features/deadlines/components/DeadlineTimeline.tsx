/**
 * Deadline timeline (DESIGN §10.3; Notion Calendar principles: faint grid, mono numerals, type-led
 * hierarchy). Shared by `/deadlines` and the radar's Timeline view.
 *
 * - md+: horizontal week strips in a scroll-snap row, the current week centred on arrival with its
 *   neighbours peeking. Each strip is a 7-day grid; weekends are `surface-sunken`; past days read
 *   `fg-disabled` and their pills sit at 50 % with "Closed". Today carries a 2 px `accent-strong` line
 *   placed at the current hour and minute (in the user's time zone), refreshed every minute.
 * - Pills: type-coloured bar + mini fit ring; at most 4 per day, then "+N more" opens the rest.
 *   Hover / focus opens a hover card; click / Enter opens the drawer; drag to the dock (or `a`) tracks.
 * - Keyboard: the grid is one tab stop with roving focus. Arrows move between pills (Shift+←/→ jumps
 *   a week), `[` / `]` and ←/→ outside the grid page weeks, `t` returns to today.
 * - Phones: a vertical agenda (AgendaList). Rolling / unknown deadlines sit in "No fixed deadline".
 */
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AlertCircle, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import {
  dragActivation,
  dropAnimation,
  EmptyState,
  Skeleton,
  usePrefersReducedMotion,
} from '@kestrel/ui';

import { AgendaList } from './AgendaList';
import { PillFace, TimelinePill } from './TimelinePill';
import { TrackerDock, TRACKER_DOCK_ID } from './TrackerDock';
import type { DeadlineFeed } from '../hooks/useDeadlineFeed';
import {
  buildPillGrid,
  moreTargetId,
  moveForKey,
  moveInGrid,
  nearestTarget,
  visiblePills,
  type TimelineItem,
  type TimelineModel,
} from '../lib/timeline';
import {
  dayHeader,
  dayProgress,
  diffDays,
  formatClock,
  formatDayKey,
  formatRange,
  isWeekend,
  type WeekRow,
} from '../lib/weeks';

export interface DeadlineTimelineProps {
  feed: DeadlineFeed;
  timeZone: string;
  now: Date;
  openId: string | null;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
  /** Empty-state actions (DESIGN §8 #7). */
  onShowAllTypes?: () => void;
  onMoreWeeks?: () => void;
  canShowMoreWeeks: boolean;
  weeks: number;
  /** px from the viewport top where sticky agenda headers sit. */
  stickyTop?: number;
  /** Extra controls rendered at the right of the week navigation bar. */
  toolbar?: ReactNode;
}

// ── Week strip ────────────────────────────────────────────────────────────────────────────────

function DayMore({
  day,
  items,
  count,
  tabbable,
  timeZone,
  now,
  closed,
  onOpen,
  onTrack,
  onFocusTarget,
}: {
  day: string;
  items: TimelineItem[];
  count: number;
  tabbable: boolean;
  timeZone: string;
  now: Date;
  closed: boolean;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
  onFocusTarget: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-target-id={moreTargetId(day)}
          tabIndex={tabbable ? 0 : -1}
          onFocus={() => onFocusTarget(moreTargetId(day))}
          className="flex h-6 w-full items-center rounded-xs px-1.5 text-left text-caption text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
        >
          +{count} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <p className="px-1 pb-2 font-mono text-mono-sm text-fg-tertiary">{formatDayKey(day)}</p>
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto overscroll-contain">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-testid="deadlines-more-item"
                className="block w-full rounded-sm text-left focus-visible:focus-ring"
                onClick={() => {
                  setOpen(false);
                  onOpen(item.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'a' && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    onTrack(item);
                  }
                }}
                aria-label={`${item.title}, ${item.company}${item.deadlineAt ? `, due ${formatClock(item.deadlineAt, timeZone)}` : ''}`}
              >
                <PillFace
                  item={item}
                  closed={closed || Boolean(item.deadlineAt && item.deadlineAt < now)}
                />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface StripProps {
  week: WeekRow;
  model: TimelineModel;
  now: Date;
  timeZone: string;
  openId: string | null;
  focusId: string | null;
  draggable: boolean;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
  onFocusTarget: (id: string) => void;
  registerStrip: (offset: number, el: HTMLElement | null) => void;
}

function WeekStrip({
  week,
  model,
  now,
  timeZone,
  openId,
  focusId,
  draggable,
  onOpen,
  onTrack,
  onFocusTarget,
  registerStrip,
}: StripProps) {
  const total = week.days.reduce((sum, d) => sum + (model.byDay.get(d)?.length ?? 0), 0);
  const current = week.offset === 0;
  return (
    <section
      ref={(el) => registerStrip(week.offset, el)}
      data-testid={`deadlines-week-${week.isoWeek}`}
      data-offset={week.offset}
      data-current={current || undefined}
      aria-label={`Week ${week.isoWeek}, ${formatRange(week.days[0]!, week.days[6]!)}: ${total} ${total === 1 ? 'deadline' : 'deadlines'}`}
      className="e2 flex w-[calc(100%-4rem)] max-w-[80rem] shrink-0 snap-center snap-always flex-col overflow-hidden rounded-xl border border-border-subtle"
    >
      <header className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
        <span className={cn('font-mono text-mono-sm', current ? 'text-fg' : 'text-fg-tertiary')}>
          W{week.isoWeek}
        </span>
        <span className="text-small text-fg-secondary">
          {formatRange(week.days[0]!, week.days[6]!)}
        </span>
        {current && <span className="text-label text-accent-strong uppercase">This week</span>}
        <span className="ml-auto font-mono text-mono-sm text-fg-tertiary">
          {total} {total === 1 ? 'deadline' : 'deadlines'}
        </span>
      </header>
      <div className="grid flex-1 grid-cols-7">
        {week.days.map((day) => {
          const items = model.byDay.get(day) ?? [];
          const offset = diffDays(model.todayKey, day);
          const past = offset < 0;
          const today = offset === 0;
          const { weekday, day: num } = dayHeader(day);
          const { shown, more } = visiblePills(items);
          return (
            <div
              key={day}
              role="group"
              aria-label={`${formatDayKey(day)}${today ? ', today' : ''}: ${items.length} ${items.length === 1 ? 'deadline' : 'deadlines'}`}
              data-day={day}
              data-today={today || undefined}
              className={cn(
                'relative flex min-h-48 min-w-0 flex-col border-r border-border-subtle last:border-r-0',
                isWeekend(day) && 'bg-surface-sunken',
              )}
            >
              <div className="flex h-8 items-center gap-1.5 px-2 font-mono text-mono-sm">
                <span
                  className={cn(
                    'uppercase',
                    past ? 'text-fg-tertiary' : today ? 'text-accent-strong' : 'text-fg-tertiary',
                  )}
                >
                  {weekday}
                </span>
                <span
                  className={cn(
                    past ? 'text-fg-tertiary' : today ? 'text-accent-strong' : 'text-fg-secondary',
                  )}
                >
                  {num}
                </span>
                {today && (
                  <span className="ml-auto text-accent-strong uppercase">
                    Today<span className="sr-only">, {formatClock(now, timeZone)}</span>
                  </span>
                )}
              </div>
              {today && (
                <span
                  data-testid="deadlines-today"
                  aria-hidden="true"
                  className="pointer-events-none absolute top-8 bottom-0 z-raised w-0.5 -translate-x-1/2 bg-accent-strong"
                  style={{ left: `${(dayProgress(now, timeZone) * 100).toFixed(3)}%` }}
                >
                  <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-accent-strong" />
                </span>
              )}
              <ul className="relative z-[2] flex flex-col gap-1 px-1.5 pb-2">
                {shown.map((item) => (
                  <li key={item.id}>
                    <TimelinePill
                      item={item}
                      closed={
                        past ||
                        Boolean(item.deadlineAt && item.deadlineAt.getTime() < now.getTime())
                      }
                      tabbable={focusId === item.id}
                      open={openId === item.id}
                      timeZone={timeZone}
                      now={now}
                      draggable={draggable}
                      onOpen={onOpen}
                      onTrack={onTrack}
                      onFocusPill={onFocusTarget}
                    />
                  </li>
                ))}
                {more > 0 && (
                  <li>
                    <DayMore
                      day={day}
                      items={items}
                      count={more}
                      tabbable={focusId === moreTargetId(day)}
                      timeZone={timeZone}
                      now={now}
                      closed={past}
                      onOpen={onOpen}
                      onTrack={onTrack}
                      onFocusTarget={onFocusTarget}
                    />
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── States ────────────────────────────────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div
      data-testid="deadlines-skeleton"
      aria-hidden="true"
      className="flex gap-4 overflow-hidden px-8 py-4"
    >
      <div className="e2 grid h-64 w-full grid-cols-7 overflow-hidden rounded-xl border border-border-subtle">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 border-r border-border-subtle p-2 last:border-r-0"
          >
            <Skeleton className="h-3 w-12" />
            {i % 3 !== 2 && <Skeleton className="h-7 w-full rounded-sm" />}
            {i % 2 === 0 && <Skeleton className="h-7 w-full rounded-sm" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function NoFixedGroup({
  items,
  now,
  timeZone,
  openId,
  draggable,
  onOpen,
  onTrack,
}: {
  items: TimelineItem[];
  now: Date;
  timeZone: string;
  openId: string | null;
  draggable: boolean;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
}) {
  if (!items.length) return null;
  return (
    <section
      data-testid="deadlines-no-fixed-group"
      aria-labelledby="deadlines-no-fixed-title"
      className="e2 mx-gutter mt-4 rounded-xl border border-border-subtle md:mx-8"
    >
      <header className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
        <h3 id="deadlines-no-fixed-title" className="text-label text-fg-tertiary uppercase">
          No fixed deadline
        </h3>
        <span className="font-mono text-mono-sm text-fg-tertiary">{items.length}</span>
        <span className="ml-auto hidden text-caption text-fg-tertiary sm:inline">
          Rolling or not stated. Never placed on the grid.
        </span>
      </header>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-1.5 p-2">
        {items.map((item) => (
          <li key={item.id}>
            <TimelinePill
              item={item}
              closed={false}
              tabbable
              open={openId === item.id}
              timeZone={timeZone}
              now={now}
              draggable={draggable}
              onOpen={onOpen}
              onTrack={onTrack}
              onFocusPill={() => undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────────────────────

export function DeadlineTimeline({
  feed,
  timeZone,
  now,
  openId,
  onOpen,
  onTrack,
  onShowAllTypes,
  onMoreWeeks,
  canShowMoreWeeks,
  weeks,
  stickyTop = 0,
  toolbar,
}: DeadlineTimelineProps) {
  useShortcutScope('deadlines');
  const { model } = feed;
  const phone = !useMediaQuery('(min-width: 768px)');
  const reduced = usePrefersReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const strips = useRef(new Map<number, HTMLElement>());
  const grid = useMemo(() => buildPillGrid(model), [model]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [visibleOffset, setVisibleOffset] = useState(0);
  const [dragging, setDragging] = useState<TimelineItem | null>(null);

  // The roving tab stop: keep it on an existing target, defaulting to the pill nearest today.
  const tabStop =
    focusId &&
    (focusId.startsWith('more:') ||
      grid.cells.size === 0 ||
      [...grid.cells.values()].some((ids) => ids.includes(focusId)))
      ? focusId
      : nearestTarget(grid, model.todayKey);

  const registerStrip = useCallback((offset: number, el: HTMLElement | null) => {
    if (el) strips.current.set(offset, el);
    else strips.current.delete(offset);
  }, []);

  const scrollToOffset = useCallback(
    (offset: number, smooth = true) => {
      const scroller = scrollerRef.current;
      const strip = strips.current.get(offset);
      if (!scroller || !strip) return;
      const left = strip.offsetLeft - (scroller.clientWidth - strip.offsetWidth) / 2;
      scroller.scrollTo({ left, behavior: smooth && !reduced ? 'smooth' : 'auto' });
      setVisibleOffset(offset);
    },
    [reduced],
  );

  // Arrival: the current week centred, instantly (MOTION §6.2: the first paint never animates).
  const centred = useRef(false);
  useLayoutEffect(() => {
    if (phone || centred.current || !strips.current.size) return;
    centred.current = true;
    scrollToOffset(0, false);
  });

  // Which strip is centred (range label, ‹ › enabled state).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || phone || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const offset = Number((best?.target as HTMLElement | undefined)?.dataset.offset);
        if (Number.isFinite(offset)) setVisibleOffset(offset);
      },
      { root: scroller, threshold: [0.55] },
    );
    strips.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [phone, model.weeks]);

  const offsets = model.weeks.map((w) => w.offset);
  const minOffset = offsets[0] ?? 0;
  const maxOffset = offsets[offsets.length - 1] ?? 0;
  const stepWeek = (delta: 1 | -1) =>
    scrollToOffset(Math.min(maxOffset, Math.max(minOffset, visibleOffset + delta)));

  const focusTarget = (id: string | null) => {
    if (!id) return;
    setFocusId(id);
    const el = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-target-id="${CSS.escape(id)}"]`,
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    const strip = el.closest<HTMLElement>('[data-offset]');
    const offset = Number(strip?.dataset.offset);
    if (Number.isFinite(offset) && offset !== visibleOffset) scrollToOffset(offset);
  };

  const goToday = () => {
    scrollToOffset(0);
    const target = nearestTarget(grid, model.todayKey);
    if (target && scrollerRef.current?.contains(document.activeElement)) focusTarget(target);
    else if (target) setFocusId(target);
  };

  useShortcut('t', goToday, {
    scope: 'deadlines',
    description: 'Jump to today',
    group: 'Deadlines',
    enabled: !phone,
  });
  useShortcut('[', () => stepWeek(-1), {
    scope: 'deadlines',
    description: 'Previous week',
    group: 'Deadlines',
    enabled: !phone,
  });
  useShortcut(']', () => stepWeek(1), {
    scope: 'deadlines',
    description: 'Next week',
    group: 'Deadlines',
    enabled: !phone,
  });
  useShortcut('arrowleft', () => stepWeek(-1), { scope: 'deadlines', enabled: !phone });
  useShortcut('arrowright', () => stepWeek(1), { scope: 'deadlines', enabled: !phone });

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-target-id]');
    if (!target || event.metaKey || event.ctrlKey || event.altKey) return;
    const move = moveForKey(event);
    if (!move) return;
    event.preventDefault();
    focusTarget(moveInGrid(grid, target.dataset.targetId ?? '', move));
  };

  // ── Drag to the tracker dock ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: dragActivation.pointer }),
    useSensor(TouchSensor, { activationConstraint: dragActivation.touch }),
  );
  const itemsById = useMemo(() => {
    const map = new Map<string, TimelineItem>();
    for (const list of model.byDay.values()) for (const item of list) map.set(item.id, item);
    for (const item of model.undated) map.set(item.id, item);
    return map;
  }, [model]);
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${itemsById.get(String(active.id))?.title ?? 'deadline'}. Drop it on the tracker dock to track it.`,
    onDragOver: ({ over }) =>
      over?.id === TRACKER_DOCK_ID ? 'Over the tracker dock.' : 'Not over the dock.',
    onDragEnd: ({ active, over }) =>
      over?.id === TRACKER_DOCK_ID
        ? `Added ${itemsById.get(String(active.id))?.title ?? 'deadline'} to the tracker.`
        : 'Dropped outside the dock. Nothing changed.',
    onDragCancel: () => 'Cancelled. The deadline stays on the timeline.',
  };
  const onDragStart = (event: DragStartEvent) =>
    setDragging(itemsById.get(String(event.active.id)) ?? null);
  const onDragEnd = (event: DragEndEvent) => {
    const item = itemsById.get(String(event.active.id));
    setDragging(null);
    if (item && event.over?.id === TRACKER_DOCK_ID) onTrack(item);
  };

  // ── States ──
  if (feed.isPending) return <TimelineSkeleton />;
  if (feed.isError) {
    return (
      <div data-testid="deadlines-error" role="alert">
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load your deadlines."
          body="The server didn't respond. Your saved and tracked items are safe."
          action={
            <Button variant="primary" onClick={feed.refetch}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }
  const empty = model.inWindow === 0 && model.undated.length === 0;
  if (empty) {
    return (
      <div data-testid="deadlines-empty">
        <EmptyState
          icon={CalendarClock}
          title={`No deadlines in the next ${weeks} weeks`}
          body={
            model.later > 0
              ? `for these filters. ${model.later} fall after ${formatDayKey(model.range.to)}.`
              : 'for these filters.'
          }
          action={
            onShowAllTypes ? (
              <Button variant="primary" onClick={onShowAllTypes}>
                Show all types
              </Button>
            ) : undefined
          }
          secondaryAction={
            canShowMoreWeeks && onMoreWeeks ? (
              <Button variant="ghost" onClick={onMoreWeeks}>
                Show {weeks * 2} weeks
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const visibleWeek = model.weeks.find((w) => w.offset === visibleOffset) ?? model.weeks[0]!;
  const nav = (
    <div className="flex flex-wrap items-center gap-2 px-gutter py-2 md:px-8">
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous week"
              aria-keyshortcuts="["
              disabled={visibleOffset <= minOffset}
              onClick={() => stepWeek(-1)}
              data-testid="deadlines-prev-week"
            >
              <ChevronLeft strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Previous week <kbd className="font-mono text-mono-sm">[</kbd>
          </TooltipContent>
        </Tooltip>
        <Button
          variant="secondary"
          size="sm"
          onClick={goToday}
          aria-keyshortcuts="T"
          data-testid="deadlines-today-button"
        >
          Today
          <kbd className="font-mono text-mono-sm text-fg-tertiary">T</kbd>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next week"
              aria-keyshortcuts="]"
              disabled={visibleOffset >= maxOffset}
              onClick={() => stepWeek(1)}
              data-testid="deadlines-next-week"
            >
              <ChevronRight strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Next week <kbd className="font-mono text-mono-sm">]</kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="font-mono text-mono-sm text-fg-secondary" aria-live="polite">
        W{visibleWeek.isoWeek} · {formatRange(visibleWeek.days[0]!, visibleWeek.days[6]!)}
      </p>
      <p className="font-mono text-mono-sm text-fg-tertiary">
        {model.inWindow} {model.inWindow === 1 ? 'deadline' : 'deadlines'} ·{' '}
        {formatRange(model.range.from, model.range.to)}
        {model.later > 0 ? ` · ${model.later} later` : ''}
      </p>
      {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
    </div>
  );

  if (phone) {
    return (
      <div className="flex flex-col pb-4">
        <AgendaList
          model={model}
          now={now}
          openId={openId}
          stickyTop={stickyTop}
          onOpen={onOpen}
          onTrack={onTrack}
        />
        <NoFixedGroup
          items={model.undated}
          now={now}
          timeZone={timeZone}
          openId={openId}
          draggable={false}
          onOpen={onOpen}
          onTrack={onTrack}
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Press Enter to open the details, or A to add it to your tracker. With a pointer, drag it to the tracker dock.',
        },
      }}
    >
      <div className="flex flex-col pb-24">
        {nav}
        <p id="deadlines-grid-help" className="sr-only">
          Use the arrow keys to move between deadlines, Shift plus left or right to jump a week,
          Enter to open, A to track.
        </p>
        <div
          ref={scrollerRef}
          data-testid="deadlines-timeline"
          data-layout="strips"
          aria-describedby="deadlines-grid-help"
          onKeyDown={onGridKeyDown}
          className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-8 py-2 [scrollbar-width:thin]"
        >
          {model.weeks.map((week) => (
            <WeekStrip
              key={week.start}
              week={week}
              model={model}
              now={now}
              timeZone={timeZone}
              openId={openId}
              focusId={tabStop}
              draggable
              onOpen={onOpen}
              onTrack={onTrack}
              onFocusTarget={setFocusId}
              registerStrip={registerStrip}
            />
          ))}
        </div>
        <NoFixedGroup
          items={model.undated}
          now={now}
          timeZone={timeZone}
          openId={openId}
          draggable
          onOpen={onOpen}
          onTrack={onTrack}
        />
      </div>
      <TrackerDock active={dragging != null} title={dragging?.title ?? null} />
      <DragOverlay dropAnimation={reduced ? null : dropAnimation}>
        {dragging ? (
          <div className="w-56 scale-[1.03] rounded-md shadow-e3">
            <PillFace item={dragging} closed={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
