/**
 * The radar feed (DESIGN §6.1 "Radar feed", §9 feed semantics, MOTION §5.5).
 *
 * - `@tanstack/react-virtual` over the feed's own scroll element; fixed-height rows measured from the
 *   `h-row` token (density and text size change it), so 5,000 rows keep < 40 nodes in the DOM.
 * - Outer wrapper = positioned by the virtualiser (translateY); inner row = the animated element.
 *   Rows never animate while scrolling: only the first 12 of a fresh list (stagger) and live inserts.
 * - Removing a row (hide, swipe) lets the rows below glide up through a CSS transform transition that
 *   is enabled only while `data-settling` is set, so scroll and resize never animate.
 * - `role="feed"`, `aria-busy` while loading; rows are articles with posinset/setsize; the cursor row
 *   is always rendered (range extractor) so focus never lands on an unmounted node.
 * - Infinite: the next cursor page loads when the viewport is within 15 rows of the end.
 */
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { hasEntered, markEntered, SETTLE_MS } from '../lib/motion';
import type { SwipeAction } from '../lib/swipe';

import { RadarRow, type RowAction, type RowEnter } from './RadarRow';
import { SwipeRow } from './SwipeRow';

import type { FeedItemDTO } from '@/api/types';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

export interface RadarFeedHandle {
  /** Scroll the row into view and move DOM focus to it. */
  focusRow: (id: string) => void;
  scrollToTop: () => void;
  isScrolled: () => boolean;
}

export interface RadarFeedProps {
  items: FeedItemDTO[];
  total: number | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isBusy: boolean;
  fetchNextPage: () => void;
  cursorId: string | null;
  openId: string | null;
  echo: { id: string; action: RowAction } | null;
  /** Rows playing their exit before a hide lands. */
  leavingIds: ReadonlySet<string>;
  lastSeenAt: Date | null;
  compact: boolean;
  nowMs: number;
  timeZone: string;
  onCursor: (id: string | null) => void;
  /** Arrow keys / Home / End inside the feed. */
  onMove: (command: 'next' | 'prev' | 'first' | 'last' | 'pageDown' | 'pageUp') => void;
  onOpen: (id: string, rowEl: HTMLElement) => void;
  onAction: (action: RowAction, item: FeedItemDTO) => void;
  onPrefetch: (id: string) => void;
  onScrolledChange?: (scrolled: boolean) => void;
  className?: string;
}

const LOAD_AHEAD_ROWS = 15;
const STAGGER_ROWS = 12;

/** Row height in px from the `h-row` token (64 / 44, 76 on phones), tracked with a ResizeObserver probe. */
function useRowHeight(probe: React.RefObject<HTMLDivElement | null>): number {
  const [height, setHeight] = useState(64);
  useLayoutEffect(() => {
    const el = probe.current;
    if (!el) return undefined;
    const read = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [probe]);
  return height;
}

export const RadarFeed = forwardRef<RadarFeedHandle, RadarFeedProps>(function RadarFeed(
  {
    items,
    total,
    hasNextPage,
    isFetchingNextPage,
    isBusy,
    fetchNextPage,
    cursorId,
    openId,
    echo,
    leavingIds,
    lastSeenAt,
    compact,
    nowMs,
    timeZone,
    onCursor,
    onMove,
    onOpen,
    onAction,
    onPrefetch,
    onScrolledChange,
    className,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const rowHeight = useRowHeight(probeRef);
  const phone = !useMediaQuery('(min-width: 768px)');

  const cursorIndex = useMemo(
    () => (cursorId ? items.findIndex((item) => item.listing.id === cursorId) : -1),
    [items, cursorId],
  );

  const rangeExtractor = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range);
      if (cursorIndex >= 0 && !base.includes(cursorIndex)) {
        base.push(cursorIndex);
        base.sort((a, b) => a - b);
      }
      return base;
    },
    [cursorIndex],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    getItemKey: (index) => items[index]?.listing.id ?? index,
    rangeExtractor,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  // Infinite pagination.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - LOAD_AHEAD_ROWS) fetchNextPage();
  }, [lastIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Enter animations: decide per id the first time it renders (MOTION §5.5) ──
  const [scrolled, setScrolled] = useState(false);
  const enterPlan = useMemo(() => {
    const plan = new Map<string, RowEnter>();
    let fresh = 0;
    items.forEach((item, index) => {
      const id = item.listing.id;
      if (hasEntered(id) || index >= STAGGER_ROWS) return;
      fresh += 1;
      plan.set(id, { kind: 'stagger', index });
    });
    // A handful of new ids above already-seen rows = live inserts (warming up, background refresh).
    const firstSeenIndex = items.findIndex((item) => hasEntered(item.listing.id));
    if (firstSeenIndex > 0 && fresh <= STAGGER_ROWS) {
      for (const [id, entry] of plan) if (entry.kind === 'stagger') plan.set(id, { kind: 'live' });
    }
    return plan;
  }, [items]);

  useEffect(() => {
    // Everything rendered once counts as entered, so it never animates again this session.
    markEntered(virtualItems.map((v) => items[v.index]?.listing.id).filter((id): id is string => Boolean(id)));
  }, [virtualItems, items]);

  // ── Settling: rows below a removed row glide up (transform transition for 300 ms) ──
  const [settling, setSettling] = useState(false);
  const previousCount = useRef(items.length);
  useLayoutEffect(() => {
    if (items.length < previousCount.current && items.length > 0) {
      setSettling(true);
      const t = setTimeout(() => setSettling(false), SETTLE_MS);
      previousCount.current = items.length;
      return () => clearTimeout(t);
    }
    previousCount.current = items.length;
    return undefined;
  }, [items.length]);

  useImperativeHandle(
    ref,
    () => ({
      focusRow: (id: string) => {
        const index = items.findIndex((item) => item.listing.id === id);
        if (index < 0) return;
        virtualizer.scrollToIndex(index, { align: 'auto' });
        requestAnimationFrame(() => rowEls.current.get(id)?.focus({ preventScroll: true }));
      },
      scrollToTop: () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }),
      isScrolled: () => (scrollRef.current?.scrollTop ?? 0) > 8,
    }),
    [items, virtualizer],
  );

  const onScroll = () => {
    const next = (scrollRef.current?.scrollTop ?? 0) > 8;
    if (next !== scrolled) {
      setScrolled(next);
      onScrolledChange?.(next);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('[role="menu"], [role="listbox"], input, textarea')) return;
    const command =
      event.key === 'ArrowDown'
        ? 'next'
        : event.key === 'ArrowUp'
          ? 'prev'
          : event.key === 'Home'
            ? 'first'
            : event.key === 'End'
              ? 'last'
              : event.key === 'PageDown'
                ? 'pageDown'
                : event.key === 'PageUp'
                  ? 'pageUp'
                  : null;
    if (!command) return;
    event.preventDefault();
    onMove(command);
  };

  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el);
    else rowEls.current.delete(id);
  }, []);

  const setSize = total ?? (hasNextPage ? -1 : items.length);
  const tabbableId = cursorId ?? items[0]?.listing.id ?? null;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn(
        'relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface [scrollbar-width:thin]',
        className,
      )}
    >
      {/* Probe: the row height token, measured once and on density / text-size changes. */}
      <div ref={probeRef} aria-hidden="true" className="pointer-events-none invisible absolute h-[4.75rem] w-px md:h-row" />
      <div
        role="feed"
        data-testid="radar-feed"
        aria-label="Radar listings"
        aria-busy={isBusy || isFetchingNextPage}
        onKeyDown={onKeyDown}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          const id = item.listing.id;
          const isNew = Boolean(lastSeenAt && item.listing.firstSeenAt > lastSeenAt);
          const row = (
            <RadarRow
              item={item}
              index={virtualRow.index}
              setSize={setSize}
              active={id === cursorId}
              open={id === openId}
              tabbable={id === tabbableId}
              isNew={isNew}
              compact={compact && !phone}
              enter={enterPlan.get(id) ?? NO_ENTER}
              echo={echo?.id === id ? echo.action : null}
              leaving={leavingIds.has(id)}
              nowMs={nowMs}
              timeZone={timeZone}
              onOpen={onOpen}
              onFocusRow={onCursor}
              onAction={onAction}
              onPrefetch={onPrefetch}
              registerRow={registerRow}
            />
          );
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              data-settling={settling ? '' : undefined}
              className="absolute top-0 left-0 w-full data-[settling]:transition-transform data-[settling]:duration-base data-[settling]:ease-spring motion-reduce:transition-none"
              style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
            >
              <SwipeRow
                enabled={phone}
                saved={item.saved}
                onCommit={(action: SwipeAction) => onAction(action, item)}
              >
                {row}
              </SwipeRow>
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div role="status" className="flex h-12 items-center justify-center text-small text-fg-tertiary">
          Loading more listings…
        </div>
      )}
      {!hasNextPage && items.length > 20 && (
        <p className="py-6 text-center text-small text-fg-tertiary">
          That&apos;s everything above your threshold.
        </p>
      )}
    </div>
  );
});

const NO_ENTER: RowEnter = { kind: 'none' };
