/**
 * `RadarRow` (DESIGN §6.2, MOTION §4 "Radar row", §5.5 lists). One listing in the virtualised feed.
 *
 * - Comfortable 64 px: title · company / meta + 3 "why" chips + 2 gap chips; compact 44 px: one line.
 *   Phones: 76 px, the title wraps to two lines and the company moves to the meta line.
 * - Right cluster has fixed widths so columns align down the feed: ghost 20 · state 16 · deadline 64 · ring.
 * - Hover tints instantly and fades out over 120 ms; the keyboard cursor adds `surface-active` and the
 *   2 px `accent-strong` bar. Hover / cursor / focus reveal Save · Hide · Track · Apply over the deadline
 *   column (always mounted, so shortcuts can echo their press state and tests can find them).
 * - Touch: a Save toggle and a `⋯` action menu are always visible (44 px targets); swipe is the shortcut.
 * - Never press-scales (full-width rows tint instead). Enter animation only for the first 12 rows of a
 *   fresh list and for live inserts (the parent decides; rows mounted by scrolling never animate).
 */
import { ArrowUpRight, Bookmark, BookmarkCheck, Eye, EllipsisVertical, EyeOff, KanbanSquare } from 'lucide-react';
import { m } from 'motion/react';
import { memo, useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';

import { PENDING_TRACKER_ID } from '@/api/listings';
import type { FeedItemDTO } from '@/api/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { FitResult } from '@kestrel/shared';
import {
  CompanyLogo,
  DeadlineCountdown,
  deadlineStatus,
  FitRing,
  fitBandOf,
  formatAbsolute,
  GHOST_META,
  ghostLevelOf,
  variants,
} from '@kestrel/ui';

import { ghostTooltip, locationText, postedText, sourceLabel, stipendText } from '../lib/format';

import { FitPeek } from './FitPeek';
import { LIVE_BAR_FADE_MS } from '../lib/motion';

export type RowAction = 'save' | 'hide' | 'unhide' | 'track' | 'apply';

/** Which enter animation a freshly mounted row plays. */
export type RowEnter = { kind: 'none' } | { kind: 'stagger'; index: number } | { kind: 'live' };

export interface RadarRowProps {
  item: FeedItemDTO;
  index: number;
  /** `aria-setsize`: total when known, else −1. */
  setSize: number;
  /** Keyboard cursor row. */
  active: boolean;
  /** This listing is open in the drawer. */
  open: boolean;
  /** Only the cursor row is a tab stop (the feed is one tab stop). */
  tabbable: boolean;
  isNew: boolean;
  compact: boolean;
  /** < md: two-line title, company in the meta line, no band label under the ring. */
  phone: boolean;
  /** A save/hide/track write for this row is queued offline. */
  pending: boolean;
  enter: RowEnter;
  /** Shortcut echo: the matching action button plays its press state (MOTION §4 keyboard echo). */
  echo: RowAction | null;
  /** Plays the exit (x −8 + fade) before a hide removes the row (MOTION §5.5). */
  leaving: boolean;
  /** Epoch ms, minute resolution (a number keeps `memo` effective while scrolling). */
  nowMs: number;
  timeZone: string;
  onOpen: (id: string, rowEl: HTMLElement) => void;
  onFocusRow: (id: string) => void;
  onAction: (action: RowAction, item: FeedItemDTO) => void;
  onPrefetch: (id: string) => void;
  registerRow?: (id: string, el: HTMLElement | null) => void;
  className?: string;
}

const ACTION_BUTTON = cn(
  'hit-area grid size-7 place-items-center rounded-sm text-fg-secondary compact:size-6',
  'transition-[background-color,color,transform] duration-fast ease-out',
  'hover:bg-surface-raised hover:text-fg active:scale-[0.92] data-[pressed]:scale-[0.92] data-[pressed]:bg-surface-raised',
  'focus-visible:focus-ring motion-reduce:active:scale-100 motion-reduce:data-[pressed]:scale-100',
);

function ActionButton({
  label,
  shortcut,
  onClick,
  pressed,
  children,
  testId,
  tabbable,
  activeState,
}: {
  label: string;
  shortcut: string;
  onClick: (event: MouseEvent) => void;
  pressed: boolean;
  children: ReactNode;
  testId: string;
  tabbable: boolean;
  activeState?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-label={label}
          aria-keyshortcuts={shortcut}
          aria-pressed={activeState}
          data-pressed={pressed ? '' : undefined}
          tabIndex={tabbable ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            onClick(event);
          }}
          className={cn(ACTION_BUTTON, activeState && 'text-accent-strong')}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label}
        <kbd className="font-mono text-mono-sm">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** Live-arriving rows: a 2 px `accent-strong` bar that fades out over 4 s (MOTION §5.5). */
function LiveBar() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return undefined;
    const animation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: LIVE_BAR_FADE_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    return () => animation.cancel();
  }, []);
  return <span ref={ref} aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent-strong" />;
}

/**
 * `6d left` · `Due in 5h` · `Rolling` · `No fixed deadline` · `Closed` (mono, deadline colour). A closed
 * listing reads just "Closed" in rows; the tooltip and the drawer carry the date.
 */
export function RowDeadline({
  deadlineAt,
  deadlineKind,
  now,
}: {
  deadlineAt: Date | null;
  deadlineKind: FeedItemDTO['listing']['deadlineKind'];
  now: Date;
}) {
  if (!deadlineAt) {
    return (
      <span className="whitespace-nowrap font-mono text-mono-sm text-fg-tertiary">
        {deadlineKind === 'rolling' ? 'Rolling' : 'No fixed deadline'}
      </span>
    );
  }
  if (deadlineStatus(deadlineAt, { now }).tone === 'closed') {
    return (
      <time dateTime={deadlineAt.toISOString()} className="whitespace-nowrap font-mono text-mono-sm text-fg-disabled">
        Closed
      </time>
    );
  }
  return <DeadlineCountdown deadlineAt={deadlineAt} now={now} />;
}

function RadarRowImpl({
  item,
  index,
  setSize,
  active,
  open,
  tabbable,
  isNew,
  compact,
  phone,
  pending,
  enter,
  echo,
  leaving,
  nowMs,
  timeZone,
  onOpen,
  onFocusRow,
  onAction,
  onPrefetch,
  registerRow,
  className,
}: RadarRowProps) {
  const { listing, fit, saved, hidden, trackerItemId } = item;
  const now = new Date(nowMs);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const metaId = `${baseId}-meta`;
  const tracked = Boolean(trackerItemId);
  const queued = pending || trackerItemId === PENDING_TRACKER_ID;
  const score = fit?.score ?? item.score;
  const ghostLevel = ghostLevelOf(listing.ghostRisk.score);
  const stipend = stipendText(listing);
  const meta = [locationText(listing), stipend, postedText(listing, now)].filter(Boolean).join(' · ');
  const hardFail = Boolean(fit?.hardFails.length);
  const actionsBg = active || open ? 'bg-surface-active' : 'bg-surface-hover';
  const closed = deadlineStatus(listing.deadlineAt, { now }).tone === 'closed';

  const animate = leaving
    ? { initial: false as const, animate: 'exit' as const, variants: variants.row }
    : enter.kind === 'none'
      ? {}
      : {
          initial: 'hidden' as const,
          animate: 'visible' as const,
          custom: enter.kind === 'stagger' ? enter.index : 0,
          variants: variants.row,
        };

  return (
    <m.article
      ref={(el: HTMLElement | null) => registerRow?.(listing.id, el)}
      data-testid="radar-row"
      data-listing-id={listing.id}
      data-active={active}
      data-open={open}
      data-saved={saved}
      data-hidden={hidden}
      data-pending={queued}
      data-closed={closed || undefined}
      aria-labelledby={titleId}
      aria-describedby={metaId}
      aria-posinset={index + 1}
      aria-setsize={setSize}
      aria-current={open ? 'true' : undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={(event) => onOpen(listing.id, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === ' ') {
          event.preventDefault();
          onOpen(listing.id, event.currentTarget);
        }
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusRow(listing.id);
      }}
      onPointerEnter={() => onPrefetch(listing.id)}
      className={cn(
        'group/row relative h-full cursor-default select-none border-b border-border-subtle outline-none',
        'scroll-mt-[calc(var(--topbar-h)+44px)] focus-visible:focus-ring-inset',
        // Instant in, 120 ms out (MOTION §4): the duration only applies when leaving hover.
        'bg-surface transition-colors duration-fast ease-out pointer-fine:hover:bg-surface-hover pointer-fine:hover:duration-0',
        (active || open) && 'bg-surface-active pointer-fine:hover:bg-surface-active',
        hidden && 'opacity-60',
        className,
      )}
      {...animate}
    >
      <div data-testid="radar-card" className="flex h-full items-center gap-3 pr-2 pl-4 md:pr-4">
        {/* Keyboard cursor bar */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-0 left-0 w-0.5 bg-accent-strong transition-opacity duration-fade',
            active ? 'opacity-100' : 'opacity-0',
          )}
        />
        {/* Live insert: 2 px accent bar that fades over 4 s (MOTION §5.5). */}
        {enter.kind === 'live' && !active && <LiveBar />}
        <span className="relative flex shrink-0 items-center">
          {isNew && (
            <span className="absolute -left-3 size-1.5 rounded-full bg-accent-strong">
              <span className="sr-only">New</span>
            </span>
          )}
          <CompanyLogo name={listing.company} domain={listing.companyDomain} size={compact ? 20 : 28} data-vt="logo" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 compact:flex-row compact:items-center compact:gap-1.5">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              id={titleId}
              data-testid="radar-row-title"
              data-vt="title"
              title={listing.title}
              className={cn(
                'min-w-0 text-body font-medium text-fg',
                phone ? 'line-clamp-2 break-words' : 'truncate',
                closed && 'text-fg-secondary',
              )}
            >
              {listing.title}
            </span>
            {!phone && (
              <>
                <span aria-hidden="true" className="shrink-0 text-fg-tertiary">
                  ·
                </span>
                <span
                  data-testid="radar-row-company"
                  title={listing.company}
                  className="min-w-12 shrink-[100] truncate text-body text-fg-secondary"
                >
                  {listing.company}
                </span>
              </>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-small text-fg-tertiary">
            <span id={metaId} className="min-w-0 truncate">
              {phone ? (
                <>
                  <span data-testid="radar-row-company" title={listing.company} className="text-fg-secondary">
                    {listing.company}
                  </span>
                  {' · '}
                  <span data-testid="radar-row-deadline">
                    <RowDeadline deadlineAt={listing.deadlineAt} deadlineKind={listing.deadlineKind} now={now} />
                  </span>
                  {' · '}
                  {locationText(listing)}
                  {stipend ? ` · ${stipend}` : ''}
                </>
              ) : (
                meta
              )}
              {ghostLevel !== 'low' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      data-testid="radar-row-ghost"
                      tabIndex={-1}
                      className={cn(ghostLevel === 'high' ? 'text-ghost-high' : 'text-ghost-med')}
                    >
                      {' · '}
                      {GHOST_META[ghostLevel].label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">
                    {ghostTooltip(listing.ghostRisk.score, listing.ghostRisk.reasons)}
                  </TooltipContent>
                </Tooltip>
              )}
              {hidden && ' · Hidden'}
            </span>
          </div>
        </div>

        {/* Right cluster: fixed columns so the feed reads as a table. */}
        <div className="relative flex shrink-0 items-center gap-2">
          {queued && (
            <span className="size-1.5 rounded-full bg-fg-tertiary" title="Waiting to sync">
              <span className="sr-only">Waiting to sync</span>
            </span>
          )}
          <span className="hidden w-4 justify-center text-fg-secondary sm:flex">
            {saved ? (
              <>
                <BookmarkCheck className="size-4 text-accent-strong" strokeWidth={1.5} aria-hidden="true" />
                <span className="sr-only">Saved</span>
              </>
            ) : tracked ? (
              <>
                <KanbanSquare className="size-4" strokeWidth={1.5} aria-hidden="true" />
                <span className="sr-only">In tracker</span>
              </>
            ) : null}
          </span>
          {!phone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-testid="radar-row-deadline"
                className="inline-flex h-6 min-w-16 items-center justify-center rounded-full bg-surface-sunken px-2.5"
                tabIndex={-1}
              >
                <RowDeadline deadlineAt={listing.deadlineAt} deadlineKind={listing.deadlineKind} now={now} />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {listing.deadlineAt
                ? `${closed ? 'Closed ' : ''}${formatAbsolute(listing.deadlineAt, timeZone)}`
                : listing.deadlineKind === 'rolling'
                  ? 'Applications reviewed on a rolling basis'
                  : 'The listing does not state a deadline'}
            </TooltipContent>
          </Tooltip>
          )}
          <span
            data-testid="radar-row-score"
            data-vt="ring"
            className={cn('flex w-8 items-center justify-center', hardFail && 'gap-1')}
          >
            {score == null ? (
              <span
                role="img"
                aria-label="Fit not ranked yet"
                className="grid size-7 place-items-center rounded-full border-2 border-dotted border-fit-track font-mono text-mono-sm text-fg-tertiary compact:size-6"
              >
                –
              </span>
            ) : (
              <>
                <FitPeek fit={fit} ghost={listing.ghostRisk}>
                  <FitRing score={score} size={compact ? 24 : 28} animateId={enter.kind === 'none' ? undefined : listing.id} />
                </FitPeek>
                <span className="sr-only">{fitBandOf(score).label}</span>
              </>
            )}
          </span>

          {/* Fine pointer: hover / cursor / focus reveal the action cluster over the deadline column. */}
          <div
            data-show={active || open || echo ? '' : undefined}
            className={cn(
              'absolute top-1/2 right-10 hidden -translate-y-1/2 items-center gap-0.5 rounded-sm pl-2 pointer-fine:flex',
              'opacity-0 transition-opacity duration-fade ease-out group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[show]:opacity-100',
              actionsBg,
            )}
          >
            {hidden ? (
              <ActionButton
                testId="radar-card-unhide"
                label="Unhide"
                shortcut="H"
                pressed={echo === 'unhide' || echo === 'hide'}
                tabbable={tabbable}
                onClick={() => onAction('unhide', item)}
              >
                <Eye className="size-4" strokeWidth={1.5} />
              </ActionButton>
            ) : (
              <>
                <ActionButton
                  testId="radar-card-save"
                  label={saved ? 'Unsave' : 'Save'}
                  shortcut="S"
                  pressed={echo === 'save'}
                  activeState={saved}
                  tabbable={tabbable}
                  onClick={() => onAction('save', item)}
                >
                  {saved ? (
                    <BookmarkCheck className="size-4" strokeWidth={1.5} />
                  ) : (
                    <Bookmark className="size-4" strokeWidth={1.5} />
                  )}
                </ActionButton>
                <ActionButton
                  testId="radar-card-hide"
                  label="Hide"
                  shortcut="H"
                  pressed={echo === 'hide'}
                  tabbable={tabbable}
                  onClick={() => onAction('hide', item)}
                >
                  <EyeOff className="size-4" strokeWidth={1.5} />
                </ActionButton>
              </>
            )}
            <ActionButton
              testId="radar-card-track"
              label={tracked ? 'In tracker' : 'Add to tracker'}
              shortcut="A"
              pressed={echo === 'track'}
              activeState={tracked}
              tabbable={tabbable}
              onClick={() => onAction('track', item)}
            >
              <KanbanSquare className="size-4" strokeWidth={1.5} />
            </ActionButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={listing.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Apply on ${sourceLabel(listing)} (opens in a new tab)`}
                  aria-keyshortcuts="Meta+Enter"
                  tabIndex={tabbable ? 0 : -1}
                  data-pressed={echo === 'apply' ? '' : undefined}
                  onClick={(event) => event.stopPropagation()}
                  className={cn(ACTION_BUTTON, 'group/apply')}
                >
                  <ArrowUpRight
                    className="size-4 transition-transform duration-fast ease-out group-hover/apply:translate-x-px group-hover/apply:-translate-y-px"
                    strokeWidth={1.5}
                  />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top">
                Apply
                <kbd className="font-mono text-mono-sm">⌘↵</kbd>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Touch: Save toggle + `⋯` action menu, always visible (DESIGN §6.2; swipe is the shortcut). */}
          <button
            type="button"
            data-testid="radar-card-save-touch"
            aria-label={saved ? 'Unsave' : 'Save'}
            aria-pressed={saved}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onAction('save', item);
            }}
            className={cn(
              'grid size-11 place-items-center rounded-sm text-fg-tertiary press-icon active:bg-surface-active pointer-fine:hidden',
              saved && 'text-accent-strong',
            )}
          >
            {saved ? (
              <BookmarkCheck className="size-5" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Bookmark className="size-5" strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More actions for ${listing.title}`}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                className="-ml-1 grid size-11 place-items-center rounded-sm text-fg-tertiary active:bg-surface-active pointer-fine:hidden"
              >
                <EllipsisVertical className="size-4" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onSelect={() => onAction('save', item)}>
                {saved ? <BookmarkCheck /> : <Bookmark />}
                {saved ? 'Unsave' : 'Save'}
                <DropdownMenuShortcut>S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction(hidden ? 'unhide' : 'hide', item)}>
                {hidden ? <Eye /> : <EyeOff />}
                {hidden ? 'Unhide' : 'Hide'}
                <DropdownMenuShortcut>H</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('track', item)}>
                <KanbanSquare />
                {tracked ? 'In tracker' : 'Add to tracker'}
                <DropdownMenuShortcut>A</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('apply', item)}>
                <ArrowUpRight />
                Apply
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </m.article>
  );
}

export const RadarRow = memo(RadarRowImpl);
