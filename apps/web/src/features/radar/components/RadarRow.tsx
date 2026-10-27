/**
 * `RadarRow` (DESIGN §6.2, MOTION §4 "Radar row", §5.5 lists). One listing in the virtualised feed.
 *
 * - Comfortable 64 px: title · company / meta + 3 "why" chips + 2 gap chips; compact 44 px: one line.
 *   Phones: 76 px, title wraps to two lines, company moves to the meta line.
 * - Right cluster has fixed widths so columns align down the feed: ghost 20 · state 16 · deadline 64 · ring.
 * - Hover tints instantly and fades out over 120 ms; the keyboard cursor adds `surface-active` and the
 *   2 px `accent-strong` bar. Hover/cursor reveal Save · Hide · Track · Apply over the deadline column.
 * - Never press-scales (full-width rows tint instead). Enter animation only for the first 12 rows of a
 *   fresh list and for live inserts (the parent decides; rows mounted by scrolling never animate).
 */
import type { FitResult } from '@kestrel/shared';
import {
  CompanyLogo,
  DeadlineCountdown,
  FitRing,
  fitBandOf,
  formatAbsolute,
  ghostLevelOf,
  GhostRiskBadge,
  variants,
} from '@kestrel/ui';
import { ArrowUpRight, Bookmark, BookmarkCheck, EllipsisVertical, EyeOff, KanbanSquare } from 'lucide-react';
import { m } from 'motion/react';
import { memo, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { ghostTooltip, locationText, postedText, sourceLabel, stipendText } from '../lib/format';
import { LIVE_BAR_FADE_MS } from '../lib/motion';

import type { FeedItemDTO } from '@/api/types';
import { PENDING_TRACKER_ID } from '@/api/listings';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type RowAction = 'save' | 'hide' | 'track' | 'apply';

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

const MAX_WHY = 3;
const MAX_GAPS = 2;

function chipsOf(fit: FitResult | null) {
  if (!fit) return { why: [] as string[], gaps: [] as string[], more: 0 };
  const why = fit.details.skills.matchedRequired.concat(fit.details.skills.matchedNice);
  const gaps = fit.details.skills.missingRequired;
  const more = Math.max(0, why.length - MAX_WHY) + Math.max(0, gaps.length - MAX_GAPS);
  return { why: why.slice(0, MAX_WHY), gaps: gaps.slice(0, MAX_GAPS), more };
}

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
          className={cn(
            'hit-area grid size-7 place-items-center rounded-sm text-fg-secondary compact:size-6',
            'transition-[background-color,color,transform] duration-fast ease-out',
            'hover:bg-surface-raised hover:text-fg active:scale-[0.92] data-[pressed]:scale-[0.92] data-[pressed]:bg-surface-raised',
            'focus-visible:focus-ring motion-reduce:active:scale-100 motion-reduce:data-[pressed]:scale-100',
            activeState && 'text-accent-strong',
          )}
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

function RadarRowImpl({
  item,
  index,
  setSize,
  active,
  open,
  tabbable,
  isNew,
  compact,
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
  const [hovered, setHovered] = useState(false);
  const tracked = Boolean(trackerItemId);
  const pending = trackerItemId === PENDING_TRACKER_ID;
  const score = fit?.score ?? item.score;
  const ghostLevel = ghostLevelOf(listing.ghostRisk.score);
  const stipend = stipendText(listing);
  const meta = [locationText(listing), stipend, postedText(listing, now), sourceLabel(listing)]
    .filter(Boolean)
    .join(' · ');
  const chips = chipsOf(fit);
  const hardFail = Boolean(fit?.hardFails.length);
  const showActions = hovered || active;
  const actionsBg = active || open ? 'bg-surface-active' : 'bg-surface-hover';

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
      data-pending={pending}
      aria-labelledby={titleId}
      aria-describedby={metaId}
      aria-posinset={index + 1}
      aria-setsize={setSize}
      aria-current={open ? 'true' : undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={(event) => onOpen(listing.id, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onAction('apply', item);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(listing.id, event.currentTarget);
        }
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusRow(listing.id);
      }}
      onPointerEnter={() => {
        setHovered(true);
        onPrefetch(listing.id);
      }}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        'group/row relative h-full cursor-default select-none border-b border-border-subtle outline-none',
        'scroll-mt-[calc(var(--topbar-h)+44px)] focus-visible:focus-ring-inset',
        // Instant in, 120 ms out (MOTION §4): the duration only applies when leaving hover.
        'bg-surface transition-colors duration-fast ease-out hover:bg-surface-hover hover:duration-0',
        (active || open) && 'bg-surface-active hover:bg-surface-active',
        className,
      )}
      {...animate}
    >
      <div data-testid="radar-card" className="flex h-full items-center gap-3 pr-3 pl-4 md:pr-4">
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
                'line-clamp-2 md:line-clamp-none md:truncate compact:truncate',
              )}
            >
              {listing.title}
            </span>
            <span aria-hidden="true" className="hidden shrink-0 text-fg-tertiary md:inline">
              ·
            </span>
            <span
              data-testid="radar-row-company"
              title={listing.company}
              className="hidden min-w-12 shrink-[100] truncate text-body text-fg-secondary md:inline"
            >
              {listing.company}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-small text-fg-tertiary">
            <span id={metaId} className="min-w-0 truncate">
              <span className="md:hidden">{listing.company} · </span>
              {meta}
            </span>
            {(chips.why.length > 0 || chips.gaps.length > 0) && (
              <span className="hidden shrink-0 items-center gap-1 lg:flex compact:hidden" aria-label="Skills">
                {chips.why.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex h-5 items-center rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary"
                  >
                    {skill}
                  </span>
                ))}
                {chips.gaps.map((skill) => (
                  <span
                    key={skill}
                    title={`Missing ${skill}`}
                    className="inline-flex h-5 items-center rounded-xs border border-dashed border-border-strong px-1.5 text-caption text-fg-tertiary"
                  >
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Missing </span>
                    {skill}
                  </span>
                ))}
                {chips.more > 0 && <span className="text-caption text-fg-tertiary">+{chips.more}</span>}
              </span>
            )}
          </div>
        </div>

        {/* Right cluster: fixed columns so the feed reads as a table. */}
        <div className="relative flex shrink-0 items-center gap-2">
          <span className="hidden w-5 justify-center sm:flex">
            {ghostLevel !== 'low' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <GhostRiskBadge level={ghostLevel} iconOnly tabIndex={-1} />
                </TooltipTrigger>
                <TooltipContent>{ghostTooltip(listing.ghostRisk.score, listing.ghostRisk.reasons)}</TooltipContent>
              </Tooltip>
            )}
          </span>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-testid="radar-row-deadline"
                className="min-w-16 text-right"
                tabIndex={-1}
              >
                {listing.deadlineAt ? (
                  <DeadlineCountdown deadlineAt={listing.deadlineAt} now={now} />
                ) : (
                  <span className="whitespace-nowrap font-mono text-mono-sm text-fg-tertiary">
                    {listing.deadlineKind === 'rolling' ? 'Rolling' : 'No fixed deadline'}
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {listing.deadlineAt
                ? formatAbsolute(listing.deadlineAt, timeZone)
                : listing.deadlineKind === 'rolling'
                  ? 'Applications reviewed on a rolling basis'
                  : 'The listing does not state a deadline'}
            </TooltipContent>
          </Tooltip>
          <span
            data-testid="radar-row-score"
            data-vt="ring"
            className={cn('flex w-[4.75rem] items-center justify-center compact:w-7', hardFail && 'gap-1')}
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
                <FitRing
                  score={score}
                  size={compact ? 24 : 28}
                  label={compact ? 'none' : 'below'}
                  animateId={enter.kind === 'none' ? undefined : listing.id}
                />
                {compact && (
                  <span className="sr-only" aria-hidden="true">
                    {fitBandOf(score).label}
                  </span>
                )}
              </>
            )}
          </span>

          {showActions && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={variants.fade.visible.transition}
              className={cn(
                'absolute top-1/2 right-[calc(4.75rem+0.5rem)] hidden -translate-y-1/2 items-center gap-0.5 rounded-sm pl-2 pointer-fine:flex compact:right-9',
                actionsBg,
              )}
            >
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
                    className={cn(
                      'group/apply hit-area grid size-7 place-items-center rounded-sm text-fg-secondary compact:size-6',
                      'transition-[background-color,color,transform] duration-fast ease-out hover:bg-surface-raised hover:text-fg',
                      'active:scale-[0.92] data-[pressed]:scale-[0.92] focus-visible:focus-ring motion-reduce:active:scale-100',
                    )}
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
            </m.div>
          )}

          {/* Touch: an always-visible ⋯ opens the same actions (DESIGN §6.2). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${listing.title}`}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                className="-mr-1 grid size-11 place-items-center rounded-sm text-fg-tertiary active:bg-surface-active pointer-fine:hidden"
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
              <DropdownMenuItem onSelect={() => onAction('hide', item)}>
                <EyeOff />
                Hide
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
