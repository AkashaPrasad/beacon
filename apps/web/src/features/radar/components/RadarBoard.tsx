/**
 * Radar Board view (key `3`): one `surface-sunken` column per opportunity type with compact cards
 * (`KanbanCard` geometry from DESIGN §6.2: logo 20 + two-line title + company; footer with the
 * deadline and a 24 px ring). The radar cursor (j/k) walks the cards column by column; Enter opens
 * the drawer; s / h / a act on the cursor card. Cards leave with a layout animation (≤ 30 per column).
 */
import { Bookmark, BookmarkCheck, EyeOff, KanbanSquare } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef } from 'react';

import type { FeedItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CompanyLogo, FitRing, ghostLevelOf, GhostRiskBadge, hoverLift, press, springs, TYPE_META, tweens } from '@kestrel/ui';


import { RowDeadline, type RowAction } from './RadarRow';
import { BOARD_PAGE, type BoardColumn } from '../lib/board';

export interface RadarBoardProps {
  columns: BoardColumn[];
  limits: Partial<Record<BoardColumn['type'], number>>;
  onShowMore: (type: BoardColumn['type']) => void;
  cursorId: string | null;
  openId: string | null;
  pendingIds: ReadonlySet<string>;
  nowMs: number;
  onOpen: (id: string, el: HTMLElement) => void;
  onCursor: (id: string) => void;
  onAction: (action: RowAction, item: FeedItemDTO) => void;
  onPrefetch: (id: string) => void;
}

function BoardCard({
  item,
  active,
  open,
  tabbable,
  pending,
  now,
  onOpen,
  onCursor,
  onAction,
  onPrefetch,
}: {
  item: FeedItemDTO;
  active: boolean;
  open: boolean;
  tabbable: boolean;
  pending: boolean;
  now: Date;
  onOpen: (id: string, el: HTMLElement) => void;
  onCursor: (id: string) => void;
  onAction: (action: RowAction, item: FeedItemDTO) => void;
  onPrefetch: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const { listing } = item;
  const score = item.fit?.score ?? item.score;
  const ghost = ghostLevelOf(listing.ghostRisk.score);
  useEffect(() => {
    if (active && ref.current && !ref.current.contains(document.activeElement) && document.activeElement?.closest('[data-testid="radar-board"]')) {
      ref.current.focus({ preventScroll: true });
    }
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <m.article
      ref={ref}
      data-testid="radar-board-card"
      data-listing-id={listing.id}
      data-active={active}
      data-saved={item.saved}
      data-pending={pending}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${listing.title}, ${listing.company}${score != null ? `, fit ${score}` : ''}`}
      aria-current={open ? 'true' : undefined}
      onClick={(event) => onOpen(listing.id, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === ' ') {
          event.preventDefault();
          onOpen(listing.id, event.currentTarget);
        }
      }}
      onFocus={(event) => event.target === event.currentTarget && onCursor(listing.id)}
      onPointerEnter={() => onPrefetch(listing.id)}
      {...press.card}
      {...hoverLift}
      className={cn(
        'lift group/card relative flex cursor-default flex-col gap-2 rounded-md border bg-surface-raised p-card text-left outline-none select-none',
        'border-border pointer-fine:hover:border-border-strong focus-visible:focus-ring-inset',
        (active || open) && 'border-accent-strong',
      )}
    >
      <div className="flex items-start gap-2">
        <CompanyLogo name={listing.company} domain={listing.companyDomain} size={20} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-body font-medium text-fg" title={listing.title}>
            {listing.title}
          </p>
          <p className="truncate text-small text-fg-secondary" title={listing.company}>
            {listing.company}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <RowDeadline deadlineAt={listing.deadlineAt} deadlineKind={listing.deadlineKind} now={now} />
        {ghost !== 'low' && <GhostRiskBadge level={ghost} iconOnly />}
        {pending && (
          <span className="size-1.5 rounded-full bg-fg-tertiary">
            <span className="sr-only">Waiting to sync</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <span className="flex items-center opacity-0 transition-opacity duration-fade group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-[show]:opacity-100" data-show={active || undefined}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={item.saved ? 'Unsave' : 'Save'}
              aria-keyshortcuts="S"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onAction('save', item);
              }}
            >
              {item.saved ? <BookmarkCheck className="text-accent-strong" strokeWidth={1.5} /> : <Bookmark strokeWidth={1.5} />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hide"
              aria-keyshortcuts="H"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onAction('hide', item);
              }}
            >
              <EyeOff strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={item.trackerItemId ? 'In tracker' : 'Add to tracker'}
              aria-keyshortcuts="A"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onAction('track', item);
              }}
            >
              <KanbanSquare className={cn(item.trackerItemId && 'text-accent-strong')} strokeWidth={1.5} />
            </Button>
          </span>
          {item.saved && <BookmarkCheck className="size-4 text-accent-strong group-hover/card:hidden" strokeWidth={1.5} aria-label="Saved" />}
          {score != null ? <FitRing score={score} size={24} /> : <span className="font-mono text-mono-sm text-fg-tertiary">–</span>}
        </span>
      </div>
    </m.article>
  );
}

export function RadarBoard({
  columns,
  limits,
  onShowMore,
  cursorId,
  openId,
  pendingIds,
  nowMs,
  onOpen,
  onCursor,
  onAction,
  onPrefetch,
}: RadarBoardProps) {
  const now = new Date(nowMs);
  const firstId = columns[0]?.items[0]?.listing.id ?? null;
  const tabbableId = cursorId ?? firstId;
  return (
    <div
      data-testid="radar-board"
      role="region"
      aria-label="Board: listings by type"
      className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-gutter py-4 [scrollbar-width:thin]"
    >
      {columns.map((column) => {
        const { label, icon: Icon } = TYPE_META[column.type];
        const limit = limits[column.type] ?? BOARD_PAGE;
        const shown = column.items.slice(0, limit);
        const rest = column.items.length - shown.length;
        return (
          <section
            key={column.type}
            data-testid="radar-board-column"
            data-type={column.type}
            aria-label={`${label}, ${column.items.length} listings`}
            className="flex w-72 shrink-0 snap-start flex-col rounded-lg bg-surface-sunken"
          >
            <header className="flex h-10 items-center gap-2 px-3">
              <Icon className="size-4 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="text-label text-fg-tertiary uppercase">{label}</h3>
              <span className="ml-auto font-mono text-mono-sm text-fg-tertiary">{column.items.length}</span>
            </header>
            <ul className="flex flex-col gap-2 px-2 pb-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((item) => (
                  <m.li
                    key={item.listing.id}
                    layout="position"
                    transition={{ layout: springs.gentle }}
                    exit={{ opacity: 0, scale: 0.97, transition: tweens.exit }}
                  >
                    <BoardCard
                      item={item}
                      active={item.listing.id === cursorId}
                      open={item.listing.id === openId}
                      tabbable={item.listing.id === tabbableId}
                      pending={pendingIds.has(item.listing.id)}
                      now={now}
                      onOpen={onOpen}
                      onCursor={onCursor}
                      onAction={onAction}
                      onPrefetch={onPrefetch}
                    />
                  </m.li>
                ))}
              </AnimatePresence>
              {rest > 0 && (
                <li>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => onShowMore(column.type)}>
                    Show {Math.min(rest, BOARD_PAGE)} more
                  </Button>
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
