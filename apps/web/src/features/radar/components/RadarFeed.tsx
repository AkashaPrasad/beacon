/**
 * The radar feed (DESIGN §6.1 "Radar feed", §9 feed semantics, MOTION §5.5).
 *
 * - `@tanstack/react-virtual` over the document scroll (the shell's rail and drawer are sticky panes),
 *   fixed-height rows measured from the `h-row` token (density and text size change it), so 5,000 rows
 *   keep ~30 nodes in the DOM. The sticky page toolbar is passed as `scrollPaddingStart`.
 * - Outer wrapper = positioned by the virtualiser (translateY); inner row = the animated element.
 *   Rows never animate while scrolling: only the first 12 of the session's first list (stagger) and
 *   live inserts. A changed filter crossfades the whole list instead (MOTION §5.5 "Reorder").
 * - Removing a row (hide, swipe) lets the rows below glide up through a CSS transform transition that
 *   is enabled only while `data-settling` is set, so scroll and resize never animate.
 * - `role="feed"`, `aria-busy` while loading; rows are articles with posinset/setsize; the cursor row
 *   is always rendered (range extractor) so focus never lands on an unmounted node.
 * - Infinite: the next cursor page loads when the viewport is within 15 rows of the end.
 */
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual';
import { m } from 'motion/react';
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

import type { FeedItemDTO } from '@/api/types';
import { cn } from '@/lib/utils';
import { tweens } from '@kestrel/ui';

import { RadarRow, type RowAction, type RowEnter } from './RadarRow';
import { SwipeRow } from './SwipeRow';
import { hasEntered, markEntered, SETTLE_MS } from '../lib/motion';
import type { SwipeAction } from '../lib/swipe';

export interface RadarFeedHandle {
  /** Scroll the row into view and move DOM focus to it. */
  focusRow: (id: string) => void;
  /** Scroll the row into view without moving focus (j/k while the drawer has focus). */
  revealRow: (id: string) => void;
  scrollToTop: () => void;
  isScrolled: () => boolean;
}

export interface RadarFeedProps {
  items: FeedItemDTO[];
  /** Changes when the filters behind `items` change: the list crossfades instead of re-staggering. */
  listKey: string;
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
  pendingIds: ReadonlySet<string>;
  lastSeenAt: Date | null;
  compact: boolean;
  phone: boolean;
  nowMs: number;
  timeZone: string;
  /** Height of the sticky page toolbar above the feed (keeps focused rows out from under it). */
  stickyOffset: number;
  onCursor: (id: string | null) => void;
  /** Arrow keys / Home / End inside the feed. */
  onMove: (command: 'next' | 'prev' | 'first' | 'last' | 'pageDown' | 'pageUp') => void;
  onOpen: (id: string, rowEl: HTMLElement) => void;
  onAction: (action: RowAction, item: FeedItemDTO, source?: 'swipe') => void;
  onPrefetch: (id: string) => void;
  className?: string;
}

const LOAD_AHEAD_ROWS = 15;
const STAGGER_ROWS = 12;
const NO_ENTER: RowEnter = { kind: 'none' };

/**
 * Session bookkeeping (module state, like `markEntered`): the session's first list staggers in once,
 * later lists crossfade; `settledListKey` is the list whose rows are on screen (set after commit).
 */
let firstListPlayed = false;
let settledListKey: string | null = null;

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

/** Distance from the document top to the list (the window virtualiser's `scrollMargin`). */
function useDocumentOffset(ref: React.RefObject<HTMLElement | null>): number {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      setOffset((prev) => (prev === top ? prev : top));
    };
    read();
    window.addEventListener('resize', read);
    // Strips above the feed (summary, warming up, stale) appear and disappear: re-measure then.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    if (el.parentElement) ro?.observe(el.parentElement);
    return () => {
      window.removeEventListener('resize', read);
      ro?.disconnect();
    };
  }, [ref]);
  return offset;
}

export const RadarFeed = forwardRef<RadarFeedHandle, RadarFeedProps>(function RadarFeed(
  {
    items,
    listKey,
    total,
    hasNextPage,
    isFetchingNextPage,
    isBusy,
    fetchNextPage,
    cursorId,
    openId,
    echo,
    leavingIds,
    pendingIds,
    lastSeenAt,
    compact,
    phone,
    nowMs,
    timeZone,
    stickyOffset,
    onCursor,
    onMove,
    onOpen,
    onAction,
    onPrefetch,
    className,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const rowHeight = useRowHeight(probeRef);
  const scrollMargin = useDocumentOffset(wrapRef);

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

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => rowHeight,
    overscan: 8,
    scrollMargin,
    scrollPaddingStart: stickyOffset,
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
    if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - LOAD_AHEAD_ROWS)
      fetchNextPage();
  }, [lastIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Enter animations: decided per id the first time it renders (MOTION §5.5) ──
  const enterPlan = useMemo(() => {
    const plan = new Map<string, RowEnter>();
    const sameList = settledListKey === listKey;
    if (!firstListPlayed) {
      items.slice(0, STAGGER_ROWS).forEach((item, index) => {
        if (!hasEntered(item.listing.id)) plan.set(item.listing.id, { kind: 'stagger', index });
      });
      return plan;
    }
    if (!sameList) return plan;
    // New ids above rows already on screen = live inserts (warming up, background refresh).
    const firstSeen = items.findIndex((item) => hasEntered(item.listing.id));
    if (firstSeen > 0) {
      for (const item of items.slice(0, Math.min(firstSeen, STAGGER_ROWS))) {
        if (!hasEntered(item.listing.id)) plan.set(item.listing.id, { kind: 'live' });
      }
    }
    return plan;
  }, [items, listKey]);

  useEffect(() => {
    settledListKey = listKey;
    if (items.length > 0) firstListPlayed = true;
    // Everything rendered once counts as entered, so it never animates again this session.
    markEntered(
      virtualItems.map((v) => items[v.index]?.listing.id).filter((id): id is string => Boolean(id)),
    );
  }, [virtualItems, items, listKey]);

  // ── Settling: rows below a removed row glide up (transform transition for 300 ms) ──
  const [settling, setSettling] = useState(false);
  const previousCount = useRef(items.length);
  const previousListKey = useRef(listKey);
  useLayoutEffect(() => {
    const removed = items.length < previousCount.current && previousListKey.current === listKey;
    previousCount.current = items.length;
    previousListKey.current = listKey;
    if (!removed || items.length === 0) return undefined;
    setSettling(true);
    const t = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [items.length, listKey]);

  useImperativeHandle(
    ref,
    () => ({
      focusRow: (id: string) => {
        const index = items.findIndex((item) => item.listing.id === id);
        if (index < 0) return;
        virtualizer.scrollToIndex(index, { align: 'auto' });
        requestAnimationFrame(() => rowEls.current.get(id)?.focus({ preventScroll: true }));
      },
      revealRow: (id: string) => {
        const index = items.findIndex((item) => item.listing.id === id);
        if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
      },
      scrollToTop: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      isScrolled: () => window.scrollY > Math.max(8, scrollMargin - stickyOffset),
    }),
    [items, virtualizer, scrollMargin, stickyOffset],
  );

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
      ref={wrapRef}
      className={cn(
        'e1 relative mx-gutter mb-6 overflow-hidden rounded-xl border border-border-subtle',
        className,
      )}
    >
      {/* Probe: the row height token, measured once and on density / text-size changes. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute h-[4.75rem] w-px md:h-row"
      />
      <m.div
        key={listKey}
        role="feed"
        data-testid="radar-feed"
        aria-label="Radar listings"
        aria-busy={isBusy || isFetchingNextPage}
        onKeyDown={onKeyDown}
        initial={firstListPlayed ? { opacity: 0 } : false}
        animate={{ opacity: 1, transition: tweens.fadeIn }}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          const id = item.listing.id;
          const isNew = Boolean(lastSeenAt && item.listing.firstSeenAt > lastSeenAt);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              data-settling={settling ? '' : undefined}
              className="absolute top-0 left-0 w-full data-[settling]:transition-transform data-[settling]:duration-base data-[settling]:ease-spring motion-reduce:transition-none"
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              <SwipeRow
                enabled={phone}
                saved={item.saved}
                onCommit={(action: SwipeAction) => onAction(action, item, 'swipe')}
              >
                <RadarRow
                  item={item}
                  index={virtualRow.index}
                  setSize={setSize}
                  active={id === cursorId}
                  open={id === openId}
                  tabbable={id === tabbableId}
                  isNew={isNew}
                  compact={compact && !phone}
                  phone={phone}
                  pending={pendingIds.has(id)}
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
              </SwipeRow>
            </div>
          );
        })}
      </m.div>
      {isFetchingNextPage && (
        <div
          role="status"
          className="flex h-12 items-center justify-center text-small text-fg-tertiary"
        >
          Loading more listings…
        </div>
      )}
      {!hasNextPage && items.length > 20 && (
        <p className="py-6 text-center text-small text-fg-tertiary">
          That&apos;s everything that matches.
        </p>
      )}
    </div>
  );
});
