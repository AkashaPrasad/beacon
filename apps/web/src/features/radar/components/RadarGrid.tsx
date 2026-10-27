/**
 * Radar Grid view (default, key `1`): responsive card grid (3 cols ≥ xl, 2 ≥ md, 1 on phones).
 * Card anatomy (DESIGN §7, UX-RESTRUCTURE [RAD]): one identity visual (the company favicon), two-line title,
 * company · location · stipend meta, one type pill, one deadline chip, one 32 px fit ring, plus ONE state slot
 * (not eligible / ghost risk / top reason). No duplicate glyphs.
 * Hover lifts the card and fades the Save / Hide / Track actions in; the keyboard cursor (j/k) and the
 * open listing get a cobalt ring. Cards enter with the row stagger and morph into the ListingPage.
 */
import { Bookmark, BookmarkCheck, EyeOff, KanbanSquare } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef } from 'react';

import type { FeedItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CompanyLogo,
  FitRing,
  ghostLevelOf,
  GhostRiskBadge,
  hoverLift,
  press,
  springs,
  TypeBadge,
  tweens,
  variants,
} from '@kestrel/ui';

import { RowDeadline, type RowAction } from './RadarRow';
import { locationText, stipendText } from '../lib/format';

export interface RadarGridProps {
  items: FeedItemDTO[];
  cursorId: string | null;
  openId: string | null;
  pendingIds: ReadonlySet<string>;
  nowMs: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onOpen: (id: string, el: HTMLElement) => void;
  onCursor: (id: string) => void;
  onAction: (action: RowAction, item: FeedItemDTO) => void;
  onPrefetch: (id: string) => void;
}

function GridCard({
  item,
  index,
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
  index: number;
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
  const notEligible = Boolean(item.fit?.hardFails?.length);
  const reason = item.fit?.explain?.whyFit?.[0] ?? null;
  const meta = [listing.company, locationText(listing), stipendText(listing)]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!active || !ref.current) return;
    if (
      !ref.current.contains(document.activeElement) &&
      document.activeElement?.closest('[data-testid="radar-grid"]')
    ) {
      ref.current.focus({ preventScroll: true });
    }
    ref.current.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <m.article
      ref={ref}
      data-testid="radar-card"
      data-listing-id={listing.id}
      data-active={active}
      data-saved={item.saved}
      data-pending={pending}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${listing.title}, ${listing.company}${score != null ? `, fit ${score}` : ''}`}
      aria-current={open ? 'true' : undefined}
      onClick={(event) => onOpen(listing.id, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault();
          onOpen(listing.id, event.currentTarget);
        }
      }}
      onFocus={(event) => event.target === event.currentTarget && onCursor(listing.id)}
      onPointerEnter={() => onPrefetch(listing.id)}
      variants={variants.row}
      initial="hidden"
      animate="visible"
      custom={index}
      {...press.card}
      {...hoverLift}
      className={cn(
        'e2 lift group/card relative flex h-full cursor-pointer flex-col gap-3 rounded-xl border border-border-subtle p-4 text-left outline-none select-none',
        'pointer-fine:hover:border-border focus-visible:focus-ring',
        (active || open) &&
          'border-accent-strong shadow-[0_0_0_3px_var(--color-accent-subtle),var(--shadow-e2)]',
        item.hidden && 'bg-surface-sunken',
      )}
    >
      {/* Favicon (the one identity visual) + the one state slot */}
      <div className="flex items-center gap-2.5">
        <span data-vt="logo" className="inline-flex shrink-0">
          <CompanyLogo name={listing.company} domain={listing.companyDomain} size={36} />
        </span>
        {/* The one state slot: not eligible > ghost risk > top reason */}
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {notEligible ? (
            <span className="truncate rounded-sm bg-warning-subtle px-1.5 py-0.5 text-caption font-medium text-warning">
              Not eligible
            </span>
          ) : ghost !== 'low' ? (
            <GhostRiskBadge level={ghost} />
          ) : reason ? (
            <span className="truncate text-caption text-fg-tertiary" title={reason}>
              {reason}
            </span>
          ) : null}
        </span>
      </div>

      <div className="min-w-0">
        <h3
          data-vt="title"
          className="line-clamp-2 text-body-lg font-semibold tracking-[-0.01em] text-fg"
          title={listing.title}
        >
          {listing.title}
        </h3>
        <p className="mt-1 truncate text-small text-fg-secondary" title={meta}>
          {meta}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <TypeBadge type={listing.type} />
        <RowDeadline
          deadlineAt={listing.deadlineAt}
          deadlineKind={listing.deadlineKind}
          now={now}
        />
        {pending && (
          <span className="size-1.5 rounded-full bg-fg-tertiary">
            <span className="sr-only">Waiting to sync</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 max-sm:w-full max-sm:justify-between max-sm:border-t max-sm:border-border-subtle max-sm:pt-2">
          <span
            className="flex items-center opacity-100 pointer-fine:opacity-0 transition-opacity duration-fade group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-[show]:opacity-100"
            data-show={active || undefined}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={item.saved ? 'Unsave' : 'Save'}
              aria-keyshortcuts="S"
              tabIndex={tabbable ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onAction('save', item);
              }}
            >
              {item.saved ? (
                <BookmarkCheck className="text-accent-strong" strokeWidth={1.5} />
              ) : (
                <Bookmark strokeWidth={1.5} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hide"
              aria-keyshortcuts="H"
              tabIndex={tabbable ? 0 : -1}
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
              tabIndex={tabbable ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onAction('track', item);
              }}
            >
              <KanbanSquare
                className={cn(item.trackerItemId && 'text-accent-strong')}
                strokeWidth={1.5}
              />
            </Button>
          </span>
          {item.saved && (
            <BookmarkCheck
              className="size-4 text-accent-strong group-hover/card:hidden"
              strokeWidth={1.5}
              aria-label="Saved"
            />
          )}
          <span data-vt="ring" className="inline-flex">
            {score != null ? (
              <FitRing score={score} size={32} animateId={listing.id} />
            ) : (
              <span className="font-mono text-mono-sm text-fg-tertiary">–</span>
            )}
          </span>
        </span>
      </div>
    </m.article>
  );
}

export function RadarGrid({
  items,
  cursorId,
  openId,
  pendingIds,
  nowMs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onOpen,
  onCursor,
  onAction,
  onPrefetch,
}: RadarGridProps) {
  const now = new Date(nowMs);
  const tabbableId = cursorId ?? items[0]?.listing.id ?? null;
  const sentinel = useRef<HTMLDivElement>(null);

  // Infinite scroll: fetch the next page when the sentinel enters the viewport.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div
      data-testid="radar-grid"
      role="region"
      aria-label="Radar listings"
      aria-busy={isFetchingNextPage}
      className="px-gutter pt-5 pb-8"
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((item, index) => (
            <m.li
              key={item.listing.id}
              layout="position"
              transition={{ layout: springs.gentle }}
              exit={{ opacity: 0, scale: 0.97, transition: tweens.exit }}
              className="min-w-0"
            >
              <GridCard
                item={item}
                index={index}
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
      </ul>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {isFetchingNextPage && (
        <p className="py-4 text-center text-small text-fg-tertiary" role="status">
          Loading more…
        </p>
      )}
    </div>
  );
}
