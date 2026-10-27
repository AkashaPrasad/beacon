/**
 * `TimelinePill` (DESIGN §6.2): h 28, `rounded-sm`, `surface-raised` + `border`, a 3 px bar in the
 * opportunity type's colour, the type icon, the title (`caption` 500, truncated) and a mini fit ring
 * with the number in `mono-sm`. Hover (fine pointer, 500 ms) or keyboard focus opens a hover card with
 * the deadline details; click / Enter opens the drawer; drag (4 px, or a 200 ms hold on touch) carries
 * it to the tracker dock, and `a` does the same without dragging (WCAG 2.5.7).
 */
import { useDraggable } from '@dnd-kit/core';
import { ArrowUpRight, BookmarkCheck, KanbanSquare } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CompanyLogo,
  DeadlineCountdown,
  fitBandOf,
  FitRing,
  formatAbsolute,
  ghostLevelOf,
  GhostRiskBadge,
  TYPE_META,
  TypeBadge,
} from '@kestrel/ui';

import { typeColor, type TimelineItem } from '../lib/timeline';

/** Hover card delay (MOTION §5.16: the hover card waits 500 ms) and the close grace when leaving. */
const OPEN_DELAY_MS = 500;
const CLOSE_GRACE_MS = 140;

const BAND_STROKE: Record<string, string> = {
  low: 'var(--color-fit-low)',
  mid: 'var(--color-fit-mid)',
  good: 'var(--color-fit-good)',
  great: 'var(--color-fit-great)',
};

/** 14 px ring for pills: the arc in the band colour, the number beside it (never inside at this size). */
export function MiniFitRing({ score, className }: { score: number | null; className?: string }) {
  if (score == null) {
    return (
      <span
        className={cn('font-mono text-mono-sm text-fg-tertiary', className)}
        aria-label="Fit not ranked yet"
      >
        –
      </span>
    );
  }
  const band = fitBandOf(score);
  const r = 5.5;
  const c = 2 * Math.PI * r;
  return (
    <span
      role="img"
      aria-label={`Fit ${Math.round(score)}, ${band.label.toLowerCase()}`}
      className={cn('inline-flex shrink-0 items-center gap-1', className)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="-rotate-90">
        <circle cx="7" cy="7" r={r} fill="none" stroke="var(--color-fit-track)" strokeWidth="2" />
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke={BAND_STROKE[band.key]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${(c * Math.min(100, Math.max(0, score))) / 100} ${c}`}
        />
      </svg>
      <span aria-hidden="true" className="font-mono text-mono-sm text-fg-secondary tabular-nums">
        {Math.round(score)}
      </span>
    </span>
  );
}

export interface PillFaceProps {
  item: TimelineItem;
  closed: boolean;
  className?: string;
  style?: CSSProperties;
  trailing?: ReactNode;
}

/** The visual pill (used by the timeline, the "+N more" list and the drag overlay). */
export function PillFace({ item, closed, className, style, trailing }: PillFaceProps) {
  const Icon = TYPE_META[item.type].icon;
  return (
    <span
      className={cn(
        'relative flex h-7 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-sm border border-border bg-surface-raised pr-1.5 pl-2.5',
        closed && 'text-fg-secondary',
        className,
      )}
      style={style}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: typeColor(item.type) }}
      />
      <Icon
        className="size-3.5 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: typeColor(item.type, 'var(--color-fg-secondary)') }}
      />
      <span className="min-w-0 flex-1 truncate text-caption font-medium text-fg">{item.title}</span>
      {item.saved && (
        <BookmarkCheck
          className="size-3 shrink-0 text-accent-strong"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      {trailing ?? <MiniFitRing score={item.score} />}
    </span>
  );
}

/** Hover card body: the listing at a glance, with the two things you would do next. */
export function PillDetails({
  item,
  timeZone,
  now,
  onOpen,
  onTrack,
}: {
  item: TimelineItem;
  timeZone: string;
  now: Date;
  onOpen: () => void;
  onTrack: () => void;
}) {
  const ghost = ghostLevelOf(item.item.listing.ghostRisk.score);
  const tracked = Boolean(item.trackerItemId);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <CompanyLogo name={item.company} domain={item.companyDomain} size={28} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-small font-medium text-fg">{item.title}</p>
          <p className="truncate text-caption text-fg-secondary">{item.company}</p>
        </div>
        {item.score != null && <FitRing score={item.score} size={28} />}
      </div>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-caption">
        <dt className="text-fg-tertiary">Deadline</dt>
        <dd className="flex flex-wrap items-baseline gap-x-2 text-fg-secondary">
          {item.deadlineAt ? (
            <>
              <span className="font-mono text-mono-sm text-fg">
                {formatAbsolute(item.deadlineAt, timeZone)}
              </span>
              <DeadlineCountdown deadlineAt={item.deadlineAt} now={now} />
            </>
          ) : (
            <span className="font-mono text-mono-sm">
              {item.deadlineKind === 'rolling' ? 'Rolling' : 'No fixed deadline'}
            </span>
          )}
        </dd>
        <dt className="text-fg-tertiary">Type</dt>
        <dd>
          <TypeBadge type={item.type} />
        </dd>
        {item.score != null && (
          <>
            <dt className="text-fg-tertiary">Fit</dt>
            <dd className="text-fg-secondary">
              <span className="font-mono text-mono-sm text-fg">{Math.round(item.score)}</span> ·{' '}
              {fitBandOf(item.score).label}
            </dd>
          </>
        )}
        {ghost !== 'low' && (
          <>
            <dt className="text-fg-tertiary">Signal</dt>
            <dd>
              <GhostRiskBadge level={ghost} />
            </dd>
          </>
        )}
      </dl>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onOpen} className="flex-1">
          Open details
          <kbd className="ml-auto font-mono text-mono-sm text-fg-tertiary">↵</kbd>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onTrack}
          disabled={tracked}
          aria-keyshortcuts="A"
        >
          <KanbanSquare strokeWidth={1.5} aria-hidden="true" />
          {tracked ? 'Tracked' : 'Track'}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          asChild
          aria-label={`Apply for ${item.title} (opens in a new tab)`}
        >
          <a href={item.applyUrl} target="_blank" rel="noopener noreferrer">
            <ArrowUpRight strokeWidth={1.5} />
          </a>
        </Button>
      </div>
    </div>
  );
}

export interface TimelinePillProps {
  item: TimelineItem;
  closed: boolean;
  /** Roving tab stop (the timeline is one tab stop). */
  tabbable: boolean;
  open: boolean;
  timeZone: string;
  now: Date;
  draggable: boolean;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
  onFocusPill: (id: string) => void;
}

export const TimelinePill = forwardRef<HTMLButtonElement, TimelinePillProps>(function TimelinePill(
  { item, closed, tabbable, open, timeZone, now, draggable, onOpen, onTrack, onFocusPill },
  forwarded,
) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { item },
    disabled: !draggable,
  });
  const [card, setCard] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleOpen = () => {
    clear();
    openTimer.current = setTimeout(() => setCard(true), OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setCard(false), CLOSE_GRACE_MS);
  };
  useEffect(() => clear, []);
  // A dragged pill never shows its hover card.
  const showCard = card && !isDragging;

  const status = closed
    ? 'Closed'
    : item.deadlineAt
      ? formatAbsolute(item.deadlineAt, timeZone)
      : 'No fixed deadline';
  return (
    <Popover open={showCard} onOpenChange={setCard}>
      <PopoverAnchor asChild>
        <button
          ref={(el) => {
            setNodeRef(el);
            if (typeof forwarded === 'function') forwarded(el);
            else if (forwarded) forwarded.current = el;
          }}
          type="button"
          {...attributes}
          {...listeners}
          role="button"
          aria-roledescription={draggable ? 'draggable deadline' : undefined}
          data-testid="deadlines-pill"
          data-listing-id={item.id}
          data-target-id={item.id}
          data-open={open || undefined}
          aria-label={`${item.title}, ${item.company}. ${status}.${item.score != null ? ` Fit ${Math.round(item.score)}.` : ''}`}
          aria-keyshortcuts="Enter A"
          aria-current={open ? 'true' : undefined}
          tabIndex={tabbable ? 0 : -1}
          onClick={() => onOpen(item.id)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            listeners?.onKeyDown?.(event);
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === 'a' || event.key === 'A') {
              event.preventDefault();
              onTrack(item);
            } else if (event.key === 'Escape' && showCard) {
              event.preventDefault();
              setCard(false);
            }
          }}
          onFocus={(event) => {
            onFocusPill(item.id);
            if (event.currentTarget.matches(':focus-visible')) scheduleOpen();
          }}
          onBlur={scheduleClose}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') scheduleOpen();
          }}
          onPointerLeave={scheduleClose}
          className={cn(
            'block w-full cursor-default rounded-sm text-left outline-none select-none touch-manipulation',
            'transition-[transform,opacity] duration-fast ease-out active:scale-[0.985] motion-reduce:active:scale-100',
            'focus-visible:focus-ring [&:hover>span]:border-border-strong',
            open && '[&>span]:border-accent-strong',
            isDragging && 'opacity-40',
          )}
        >
          <PillFace item={item} closed={closed} />
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={() => closeTimer.current && clearTimeout(closeTimer.current)}
        onPointerLeave={scheduleClose}
        data-testid="deadlines-pill-card"
      >
        <PillDetails
          item={item}
          timeZone={timeZone}
          now={now}
          onOpen={() => {
            setCard(false);
            onOpen(item.id);
          }}
          onTrack={() => {
            setCard(false);
            onTrack(item);
          }}
        />
      </PopoverContent>
    </Popover>
  );
});
