/**
 * Radar: `/radar` (the list) and `/radar/:listingId` (the listing page). Filters, sort and view live
 * in the search params, so every state is linkable; the listing page keeps them, and Back returns to
 * the same list with its scroll position and selected row (the list stays mounted, just hidden).
 *
 * Calm by default (UX restructure): a friendly Today band, one toolbar row (search, Filters, Tune),
 * then the list. Filters open in a popover (a bottom sheet on phones) and can be pinned as the shell's
 * left rail; Tune holds the minimum fit (with its live count), sort, view and saved views. Rows show
 * title, company and logo, one meta line, the fit ring (hover it for the why) and a deadline chip.
 *
 * Keyboard (scope `radar`, DESIGN §11): j/k ↑/↓ move, Enter/o open, s save, h hide, a track,
 * ⌘↵ apply, / search, [ filters, 1/2/3 views. On the listing page its own scope handles j/k ←/→,
 * s/h/a, ⌘↵ and Esc (back).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Eye, LayoutGrid, List, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { feedKeys, fetchFeedPage, useFeed, useFeedSummary } from '@/api/feed';
import { prefetchListing, useMarkFeedSeen, usePendingListingIds } from '@/api/listings';
import { useMe } from '@/api/me';
import type { FeedFilters, FeedItemDTO } from '@/api/types';
import { useCommandItems } from '@/components/command-palette/registry';
import { PushSoftAsk } from '@/components/push-soft-ask';
import { ShellSlot } from '@/components/shell/slots';
import { DeadlineTimeline } from '@/features/deadlines/components/DeadlineTimeline';
import { useDeadlineFeed } from '@/features/deadlines/hooks/useDeadlineFeed';
import type { TimelineItem } from '@/features/deadlines/lib/timeline';
import { SpotlightTour } from '@/features/onboarding/tour/SpotlightTour';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { useTheme } from '@/lib/theme/context';
import { useBreakpoint } from '@/lib/use-media-query';
import { springs, tweens, useNow, usePrefersReducedMotion } from '@kestrel/ui';

import {
  FeedEmpty,
  FeedError,
  FeedSkeleton,
  NewFitsPill,
  StaleStrip,
  type EmptyVariant,
} from './components/FeedStates';
import { FilterRail } from './components/FilterRail';
import { ListingPage } from './components/listing/ListingPage';
import { RadarBoard } from './components/RadarBoard';
import { RadarFeed, type RadarFeedHandle } from './components/RadarFeed';
import { RadarGrid } from './components/RadarGrid';
import { FiltersControl, TodayBand, TunePopover } from './components/RadarHeader';
import type { RowAction } from './components/RadarRow';
import { ActiveChips, SearchField } from './components/RadarToolbar';
import { useSkeletonGate, useSummaryDismissal } from './hooks/useFeedStates';
import { useListingActions, type ActionListing } from './hooks/useListingActions';
import { useRadarFilters } from './hooks/useRadarFilters';
import {
  useArrivalLastSeen,
  useLiveHold,
  useScrolledPast,
  useStableCallback,
  useWarmingPhase,
} from './hooks/useRadarSession';
import { BOARD_PAGE, boardColumns, boardOrder } from './lib/board';
import { dedupeFeedItems, locallyHiddenCount, visibleFeedItems } from './lib/feedItems';
import {
  activeFilterChips,
  activeFilterCount,
  clampMinFit,
  clearFilterKey,
  clearFilters,
  describeFilters,
  filtersFromSearchParams,
  filtersToFeedQuery,
  filtersToSearchParams,
  narrowestFilter,
  viewFromSearchParams,
} from './lib/filters';
import { setFiltersPinned, useFiltersPinned } from './lib/filtersPin';
import { formatCount } from './lib/format';
import {
  backLabelFor,
  getListingContext,
  neighbours,
  setListingContext,
} from './lib/listingContext';
import { closeWithMorph, ECHO_MS, openWithMorph, WARMING_POLL_MS } from './lib/motion';
import { feedNavReducer, initialNavState } from './lib/navigation';
import { listSavedViews, type SavedView } from './lib/savedViews';

const READY_STRIP_MS = 8000;
const SLOW_WARMING_MS = 30_000;
const SEEN_AFTER_MS = 20_000;
const PREFETCH_DELAY_MS = 120;
const PAGE_STEP = 10;

export function Component() {
  return <RadarScreen />;
}

function toActionListing(item: FeedItemDTO): ActionListing {
  return {
    id: item.listing.id,
    title: item.listing.title,
    applyUrl: item.listing.applyUrl,
    saved: item.saved,
    trackerItemId: item.trackerItemId,
  };
}

/** `GET /v1/feed?limit=1` → `total` for a query (live slider count, "N listings score 60–79"). */
function useFeedCount(query: FeedFilters, enabled: boolean) {
  return useQuery<number, Error, number, readonly unknown[]>({
    queryKey: [...feedKeys.all, 'count', query],
    queryFn: ({ signal }) =>
      fetchFeedPage({ ...query, limit: 1 }, null, signal).then((r) => r.total ?? r.items.length),
    enabled,
    placeholderData: (previous: number | undefined) => previous,
    staleTime: 30_000,
    meta: { persist: false },
  });
}

/** Height of an element, tracked (sticky toolbar → virtualiser scroll padding). */
function useHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setHeight(Math.round(el.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return height;
}

function rowElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="radar-row"][data-listing-id="${CSS.escape(id)}"], [data-testid="radar-board-card"][data-listing-id="${CSS.escape(id)}"], [data-testid="radar-card"][data-listing-id="${CSS.escape(id)}"]`,
  );
}

function focusSearch() {
  const fields = [...document.querySelectorAll<HTMLInputElement>('[data-testid="radar-search"]')];
  const target = fields.find((el) => el.offsetParent !== null) ?? fields[0];
  target?.focus();
  target?.select();
}

function companySuggestions(items: readonly FeedItemDTO[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    seen.add(item.listing.company);
    if (seen.size >= 40) break;
  }
  return [...seen];
}

function RadarScreen() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { filters, view, search, listingId, setFilters, setView, openListing, closeListing } =
    useRadarFilters();
  const reading = Boolean(listingId);
  useShortcutScope('radar', !reading);
  const me = useMe();
  const { appearance } = useTheme();
  const bp = useBreakpoint();
  const phone = bp === 'base' || bp === 'sm';
  const wide = bp === 'lg' || bp === 'xl' || bp === '2xl';
  const pinned = useFiltersPinned() && wide;
  const compact = appearance.density === 'compact';
  const reduced = usePrefersReducedMotion();
  const now = useNow(60_000);
  const nowMs = Math.floor(now.getTime() / 60_000) * 60_000;
  const timeZone =
    me.data?.settings.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Asia/Kolkata';
  const aiEnabled = me.data?.settings.aiEnabled ?? true;
  const actions = useListingActions();
  const feedRef = useRef<RadarFeedHandle>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerHeight = useHeight(headerRef);

  // ── Today: since last visit, warming-up progress ──
  const summary = useFeedSummary();
  const lastSeen = useArrivalLastSeen(
    Boolean(summary.data),
    summary.data?.lastSeenFeedAt ?? me.data?.user.lastSeenFeedAt ?? null,
  );
  const dismissal = useSummaryDismissal(lastSeen);
  const [todayHidden, setTodayHidden] = useState(false);

  // ── Feed ──
  const queryKeyString = useMemo(() => filtersToSearchParams(filters).toString(), [filters]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const feedQuery = useMemo(() => filtersToFeedQuery(filters), [queryKeyString]);
  const feed = useFeed(feedQuery, { enabled: view !== 'timeline' });
  const warming = Boolean(feed.data?.pages[0]?.warmingUp || summary.data?.warmingUp);
  const allItems = useMemo(() => dedupeFeedItems(feed.data?.pages), [feed.data]);

  // Warming up: poll the summary and the feed every 10 s (USERFLOW §1.7); rows stream in at their rank.
  const { slow, showReady } = useWarmingPhase(warming, {
    slowAfterMs: SLOW_WARMING_MS,
    readyForMs: READY_STRIP_MS,
  });
  const { refetch: refetchFeed } = feed;
  useEffect(() => {
    if (!warming) return undefined;
    const t = setInterval(() => {
      void qc.invalidateQueries({ queryKey: feedKeys.summary() });
      void refetchFeed();
    }, WARMING_POLL_MS);
    return () => clearInterval(t);
  }, [warming, qc, refetchFeed]);

  // ── Rows on screen: hidden ones leave with an exit, new-since filter, live-insert hold ──
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const visible = useMemo(
    () =>
      visibleFeedItems(allItems, {
        showHidden: filters.showHidden,
        leaving,
        newSince: filters.newOnly ? lastSeen : null,
      }),
    [allItems, filters.showHidden, filters.newOnly, leaving, lastSeen],
  );
  const byId = useMemo(
    () => new Map(visible.map((item) => [item.listing.id, item] as const)),
    [visible],
  );
  const nextIds = useMemo(() => visible.map((item) => item.listing.id), [visible]);
  const listKey = `${queryKeyString}|${warming ? 'w' : 'r'}`;
  const [navState, dispatch] = useReducer(feedNavReducer, initialNavState);
  const scrolled = useScrolledPast(120);
  const hold = useLiveHold(nextIds, listKey, scrolled || navState.cursorId != null);
  const items = useMemo(
    () => hold.display.map((id) => byId.get(id)).filter((i): i is FeedItemDTO => Boolean(i)),
    [hold.display, byId],
  );

  const firstPage = feed.data?.pages[0];
  const total =
    firstPage?.total != null
      ? Math.max(0, firstPage.total - locallyHiddenCount(allItems, filters.showHidden))
      : feed.data
        ? items.length
        : null;

  // ── Board columns + keyboard order ──
  const columns = useMemo(() => boardColumns(items), [items]);
  const [boardLimits, setBoardLimits] = useState<Partial<Record<string, number>>>({});
  const navIds = useMemo(
    () => (view === 'board' ? boardOrder(columns, boardLimits) : items.map((i) => i.listing.id)),
    [view, columns, boardLimits, items],
  );
  const navKey = navIds.join('|');
  useEffect(() => {
    dispatch({ type: 'sync', ids: navIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
  const cursorId = navState.cursorId;
  const cursorItem = cursorId ? byId.get(cursorId) : undefined;

  // The page follows the URL; the cursor follows the page (so Back lands on the listing you read).
  useEffect(() => {
    if (listingId && byId.has(listingId)) dispatch({ type: 'focus', id: listingId });
  }, [listingId, byId]);

  // A new filter starts at the top of the list.
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, [queryKeyString]);

  // Back from a listing: restore the list's scroll position, then put focus back on its row.
  const wasReading = useRef(reading);
  useLayoutEffect(() => {
    if (wasReading.current && !reading) {
      const context = getListingContext();
      window.scrollTo({ top: context?.scrollY ?? 0 });
      const id = navState.cursorId;
      if (id) {
        requestAnimationFrame(() => {
          if (view === 'list') feedRef.current?.focusRow(id);
          else rowElement(id)?.focus({ preventScroll: true });
        });
      }
    }
    wasReading.current = reading;
  }, [reading, navState.cursorId, view]);

  // ── Live count for the threshold slider ──
  const [draftMinFit, setDraftMinFit] = useState<number | null>(null);
  const draftQuery = useMemo(
    () =>
      draftMinFit != null && draftMinFit !== filters.minFit
        ? filtersToFeedQuery({ ...filters, minFit: draftMinFit })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftMinFit, queryKeyString],
  );
  const draftCount = useFeedCount(draftQuery ?? feedQuery, draftQuery != null && !warming);
  const sliderCount = draftQuery != null ? (draftCount.data ?? null) : total;

  // Empty "nothing above N": how many score just below.
  const lowerTo = Math.max(0, clampMinFit(filters.minFit - 20));
  const lowerCount = useFeedCount(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useMemo(() => filtersToFeedQuery({ ...filters, minFit: lowerTo }), [queryKeyString, lowerTo]),
    Boolean(feed.data) && items.length === 0 && filters.minFit > 0 && !warming,
  );

  // ── Seen marker: after ≥ 20 s on the radar, leaving (tab hidden / unmount) records the visit ──
  const { mutate: markSeen } = useMarkFeedSeen();
  useEffect(() => {
    const startedAt = Date.now();
    let sent = false;
    const send = () => {
      if (sent || Date.now() - startedAt < SEEN_AFTER_MS) return;
      sent = true;
      markSeen();
    };
    const onVisibility = () => document.visibilityState === 'hidden' && send();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      send();
    };
  }, [markSeen]);

  // ── Actions ──
  const pendingIds = usePendingListingIds();
  const [echo, setEcho] = useState<{ id: string; action: RowAction } | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (id: string, action: RowAction) => {
    if (echoTimer.current) clearTimeout(echoTimer.current);
    setEcho({ id, action });
    echoTimer.current = setTimeout(() => setEcho(null), ECHO_MS);
  };
  const [askPush, setAskPush] = useState(false);
  const [hiddenThisSession, setHiddenThisSession] = useState(0);

  const hideItem = (item: FeedItemDTO, source?: 'swipe') => {
    const id = item.listing.id;
    dispatch({ type: 'remove', id });
    setHiddenThisSession((n) => n + 1);
    if (source !== 'swipe' && !reduced && !filters.showHidden && !reading) {
      setLeaving((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, tweens.exit.duration * 1000);
    }
    actions.hide(toActionListing(item));
  };

  const runAction = (action: RowAction, item: FeedItemDTO, source?: 'swipe') => {
    const listing = toActionListing(item);
    switch (action) {
      case 'save':
        if (!item.saved) setAskPush(true);
        actions.toggleSave(listing);
        break;
      case 'hide':
        if (item.hidden) actions.unhide(listing);
        else hideItem(item, source);
        break;
      case 'unhide':
        actions.unhide(listing);
        break;
      case 'track':
        actions.track(listing);
        break;
      case 'apply':
        actions.apply(listing);
        break;
    }
  };
  const onRowAction = useStableCallback(runAction);

  // ── Listing page ──
  const context = getListingContext();
  const fromRadar = !context || context.origin.startsWith('/radar');
  const pageIds = fromRadar ? navIds : (context?.ids ?? navIds);
  const { prevId, nextId, index: pageIndex } = neighbours(pageIds, listingId);

  const openRow = (id: string) => {
    dispatch({ type: 'focus', id });
    if (listingId === id) return;
    setListingContext({
      origin: `${location.pathname}${location.search}`,
      ids: navIds,
      scrollY: window.scrollY,
    });
    openWithMorph(null, id, () => openListing(id));
  };
  const onRowOpen = useStableCallback((id: string) => openRow(id));
  const onRowCursor = useStableCallback((id: string | null) => dispatch({ type: 'focus', id }));

  const goBack = () => {
    const id = listingId;
    const back = () => {
      const state = location.state as { fromList?: boolean } | null;
      if (state?.fromList && !fromRadar && context) void navigate(-1);
      else if (state?.fromList) void navigate(-1);
      else if (context && !fromRadar) void navigate(context.origin);
      else closeListing();
    };
    if (id && fromRadar) closeWithMorph(id, back);
    else back();
  };

  const stepPage = (delta: 1 | -1) => {
    const target = delta === 1 ? nextId : prevId;
    if (!target) return;
    if (fromRadar) dispatch({ type: 'focus', id: target });
    void openListing(target, { replace: true });
  };

  // ── Keyboard ──
  // Keyboard moves bring the new cursor row into view after commit (and keep focus with it).
  const reveal = useRef<'focus' | 'reveal' | null>(null);
  const move = (action: Parameters<typeof feedNavReducer>[1]) => {
    const next = feedNavReducer(navState, action);
    if (next.cursorId === navState.cursorId) return;
    const focusInList = Boolean(
      document.activeElement?.closest('[data-testid="radar-feed"], [data-testid="radar-board"]'),
    );
    reveal.current = focusInList ? 'focus' : 'reveal';
    dispatch(action);
  };
  useEffect(() => {
    const mode = reveal.current;
    reveal.current = null;
    if (!mode || !cursorId || view !== 'list') return;
    if (mode === 'focus') feedRef.current?.focusRow(cursorId);
    else feedRef.current?.revealRow(cursorId);
  }, [cursorId, view]);
  const listView = view !== 'timeline' && !reading;
  const withCursor = (fn: (item: FeedItemDTO) => void) => {
    if (cursorItem) fn(cursorItem);
  };
  const shortcutOpts = { scope: 'radar', group: 'Radar', enabled: listView } as const;
  useShortcut('j', () => move({ type: 'move', delta: 1 }), {
    ...shortcutOpts,
    description: 'Next listing',
  });
  useShortcut('arrowdown', () => move({ type: 'move', delta: 1 }), {
    scope: 'radar',
    enabled: listView,
  });
  useShortcut('k', () => move({ type: 'move', delta: -1 }), {
    ...shortcutOpts,
    description: 'Previous listing',
  });
  useShortcut('arrowup', () => move({ type: 'move', delta: -1 }), {
    scope: 'radar',
    enabled: listView,
  });
  useShortcut('pagedown', () => move({ type: 'move', delta: PAGE_STEP }), {
    scope: 'radar',
    enabled: listView,
  });
  useShortcut('pageup', () => move({ type: 'move', delta: -PAGE_STEP }), {
    scope: 'radar',
    enabled: listView,
  });
  useShortcut('enter', () => withCursor((item) => openRow(item.listing.id)), {
    ...shortcutOpts,
    description: 'Open the listing',
  });
  useShortcut('o', () => withCursor((item) => openRow(item.listing.id)), {
    scope: 'radar',
    enabled: listView,
  });
  const keyAction = (action: RowAction) =>
    withCursor((item) => {
      flash(item.listing.id, action);
      runAction(action, item);
    });
  useShortcut('s', () => keyAction('save'), { ...shortcutOpts, description: 'Save / unsave' });
  useShortcut('h', () => keyAction('hide'), { ...shortcutOpts, description: 'Hide (undo with U)' });
  useShortcut('a', () => keyAction('track'), { ...shortcutOpts, description: 'Add to tracker' });
  useShortcut('mod+enter', () => keyAction('apply'), {
    ...shortcutOpts,
    description: 'Open the apply link',
  });
  useShortcut('/', () => focusSearch(), {
    scope: 'radar',
    group: 'Radar',
    description: 'Search listings',
    enabled: !reading,
  });
  useShortcut('1', () => setView('grid'), {
    scope: 'radar',
    group: 'Views',
    description: 'Grid view',
    enabled: !reading,
  });
  useShortcut('2', () => setView('list'), {
    scope: 'radar',
    group: 'Views',
    description: 'List view',
    enabled: !reading,
  });
  useShortcut('3', () => setView('timeline'), {
    scope: 'radar',
    group: 'Views',
    description: 'Timeline view',
    enabled: !reading,
  });
  useShortcut('4', () => setView('board'), {
    scope: 'radar',
    group: 'Views',
    description: 'Board view',
    enabled: !reading,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  useShortcut('[', () => setFiltersOpen((v) => !v), {
    scope: 'radar',
    enabled: !pinned && !reading,
    description: 'Filters',
    group: 'Radar',
  });

  // ── Prefetch the listing on hover (after a short settle, so sweeping the mouse is free) ──
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPrefetch = useStableCallback((id: string) => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => prefetchListing(qc, id), PREFETCH_DELAY_MS);
  });

  // ── Palette (Views, Actions on the cursor listing, filters) ──
  const savedViews = listSavedViews();
  const applyView = (saved: SavedView) => {
    const params = new URLSearchParams(saved.search);
    setFilters(filtersFromSearchParams(params));
    setView(viewFromSearchParams(params));
  };
  useCommandItems(
    () => [
      {
        id: 'radar.view.grid',
        group: 'Views',
        label: 'Grid view',
        icon: LayoutGrid,
        shortcut: '1',
        perform: () => setView('grid'),
      },
      {
        id: 'radar.view.list',
        group: 'Views',
        label: 'List view',
        icon: List,
        shortcut: '2',
        perform: () => setView('list'),
      },
      {
        id: 'radar.view.timeline',
        group: 'Views',
        label: 'Timeline view',
        icon: CalendarRange,
        shortcut: '3',
        perform: () => setView('timeline'),
      },
      {
        id: 'radar.view.board',
        group: 'Views',
        label: 'Board view',
        icon: LayoutGrid,
        shortcut: '4',
        perform: () => setView('board'),
      },
      ...savedViews.map((saved) => ({
        id: `radar.saved-view.${saved.id}`,
        group: 'Views',
        label: `Saved view: ${saved.name}`,
        icon: SlidersHorizontal,
        perform: () => applyView(saved),
      })),
      {
        id: 'radar.filters.open',
        group: 'Views',
        label: 'Filters',
        icon: SlidersHorizontal,
        shortcut: '[',
        perform: () => setFiltersOpen(true),
      },
      {
        id: 'radar.filters.pin',
        group: 'Views',
        label: pinned ? 'Unpin filters' : 'Pin filters as a sidebar',
        icon: SlidersHorizontal,
        perform: () => setFiltersPinned(!pinned),
      },
      {
        id: 'radar.filters.reset',
        group: 'Views',
        label: 'Reset filters',
        icon: RotateCcw,
        perform: () => setFilters(clearFilters(filters)),
      },
      {
        id: 'radar.filters.hidden',
        group: 'Views',
        label: filters.showHidden ? 'Stop showing hidden listings' : 'Show hidden',
        keywords: ['unhide', 'restore', 'hidden'],
        icon: Eye,
        perform: () => setFilters((f) => ({ ...f, showHidden: !f.showHidden })),
      },
      {
        id: 'radar.filters.saved',
        group: 'Views',
        label: filters.savedOnly ? 'Show all, not just saved' : 'Show saved only',
        icon: SlidersHorizontal,
        perform: () => setFilters((f) => ({ ...f, savedOnly: !f.savedOnly })),
      },
      ...(cursorItem && !reading
        ? [
            {
              id: 'radar.action.open',
              group: 'Actions',
              label: `Open “${cursorItem.listing.title}”`,
              shortcut: 'enter',
              perform: () => openRow(cursorItem.listing.id),
            },
            {
              id: 'radar.action.save',
              group: 'Actions',
              label: cursorItem.saved
                ? `Unsave “${cursorItem.listing.title}”`
                : `Save “${cursorItem.listing.title}”`,
              shortcut: 's',
              perform: () => runAction('save', cursorItem),
            },
            {
              id: 'radar.action.hide',
              group: 'Actions',
              label: `Hide “${cursorItem.listing.title}”`,
              shortcut: 'h',
              perform: () => runAction('hide', cursorItem),
            },
            {
              id: 'radar.action.track',
              group: 'Actions',
              label: `Add “${cursorItem.listing.title}” to tracker`,
              shortcut: 'a',
              perform: () => runAction('track', cursorItem),
            },
            {
              id: 'radar.action.apply',
              group: 'Actions',
              label: `Apply to “${cursorItem.listing.title}”`,
              shortcut: 'mod+enter',
              perform: () => runAction('apply', cursorItem),
            },
          ]
        : []),
    ],

    [
      cursorItem,
      filters.showHidden,
      filters.savedOnly,
      savedViews,
      queryKeyString,
      pinned,
      reading,
    ],
  );

  // ── Derived UI state ──
  const chips = activeFilterChips(filters);
  const filterCount = activeFilterCount(filters);
  const showSkeleton = useSkeletonGate(feed.isPending && !feed.data && view !== 'timeline');
  const fullError = feed.isError && !feed.data;
  const staleError = feed.isRefetchError && Boolean(feed.data);
  const narrow = narrowestFilter(filters);
  const emptyVariant: EmptyVariant | null =
    !feed.data || items.length > 0
      ? null
      : warming
        ? 'warming-up'
        : filters.q.trim()
          ? 'search'
          : filterCount > 0
            ? 'filters'
            : hiddenThisSession > 0 && allItems.length > 0
              ? 'all-triaged'
              : filters.minFit > 0
                ? 'below-threshold'
                : 'none';
  const todayVisible =
    (warming || Boolean(summary.data)) && !dismissal.dismissed && !todayHidden && !filters.newOnly;

  const setMinFit = (value: number) => {
    setDraftMinFit(null);
    setFilters((f) => ({ ...f, minFit: value }));
  };
  const fitProps = {
    value: filters.minFit,
    onChange: setMinFit,
    onDraft: setDraftMinFit,
    count: sliderCount,
    pending: feed.isFetching && !feed.isFetchingNextPage,
  };

  const rail = (variant: 'inline' | 'sheet') => (
    <FilterRail
      filters={filters}
      onChange={(next) => setFilters(next)}
      onReset={() => setFilters(clearFilters(filters))}
      activeCount={filterCount}
      typeCounts={summary.data?.byType}
      companySuggestions={companySuggestions(allItems)}
      variant={variant}
      pin={
        wide
          ? {
              pinned,
              onToggle: () => {
                setFiltersOpen(false);
                setFiltersPinned(!pinned);
              },
            }
          : undefined
      }
    />
  );

  // Timeline view: the deadline strips with the radar's filters.
  const timelineFeed = useDeadlineFeed(feedQuery, {
    now,
    timeZone,
    weeks: 4,
    enabled: view === 'timeline' && !reading,
  });

  const listingPage = listingId ? (
    <ListingPage
      listingId={listingId}
      prevId={prevId}
      nextId={nextId}
      position={
        pageIndex >= 0
          ? { index: pageIndex, total: fromRadar && total != null ? total : pageIds.length }
          : null
      }
      backLabel={backLabelFor(context?.origin ?? `/radar${location.search}`)}
      onBack={goBack}
      onPrev={() => stepPage(-1)}
      onNext={() => stepPage(1)}
      onOpenListing={(id) => void openListing(id, { replace: true })}
      onHide={(listing) => {
        const item = byId.get(listing.id);
        const target = nextId ?? prevId;
        if (item) hideItem(item);
        else actions.hide(listing);
        if (target) stepPage(nextId ? 1 : -1);
        else goBack();
      }}
      actions={actions}
      timeZone={timeZone}
      aiEnabled={aiEnabled}
      nowMs={nowMs}
    />
  ) : null;

  return (
    <div
      data-testid="radar-page"
      data-listing-id={listingId ?? undefined}
      data-view={view}
      className="flex min-h-full flex-col"
    >
      {pinned && !reading && <ShellSlot name="rail">{rail('inline')}</ShellSlot>}

      {listingPage}
      {!reading && <SpotlightTour />}

      <div hidden={reading} className="flex min-h-full flex-col">
        {todayVisible && view !== 'timeline' && (
          <TodayBand
            name={me.data?.user.name ?? null}
            summary={summary.data}
            warming={warming}
            showReady={showReady}
            slow={slow}
            lastSeen={lastSeen}
            nowMs={nowMs}
            onShowNew={() => setFilters((f) => ({ ...f, newOnly: true }))}
            onSavedOnly={() => setFilters((f) => ({ ...f, savedOnly: true }))}
            onDismiss={() => {
              dismissal.dismiss();
              setTodayHidden(true);
            }}
          />
        )}

        <div
          ref={headerRef}
          className="sticky top-(--topbar-h) z-sticky mt-2 border-b border-border-subtle bg-surface"
        >
          <div className="flex min-h-14 items-center gap-2 px-gutter py-2 md:gap-3">
            <div className="hidden min-w-0 items-baseline gap-2 md:flex">
              <h1 className="font-display text-h1 text-fg">Radar</h1>
            </div>
            <span
              data-testid="radar-total"
              className="shrink-0 font-mono text-mono-sm text-fg-tertiary tabular-nums"
              aria-live="polite"
            >
              {total == null ? '' : `${formatCount(total)} ${total === 1 ? 'fit' : 'fits'}`}
            </span>
            <SearchField
              value={filters.q}
              onChange={(q) => setFilters((f) => ({ ...f, q }))}
              className="ml-auto w-full max-w-72 min-w-0 flex-1 md:flex-none"
            />
            {!pinned && (
              <FiltersControl
                phone={phone}
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                count={filterCount}
              >
                {rail('sheet')}
              </FiltersControl>
            )}
            <TunePopover
              fit={fitProps}
              sort={filters.sort}
              onSort={(sort) => setFilters((f) => ({ ...f, sort }))}
              view={view}
              onView={setView}
              search={search}
              onApplyView={applyView}
              compact={phone}
            />
          </div>
          <ActiveChips
            chips={chips}
            onRemove={(id) => {
              const chip = chips.find((c) => c.id === id);
              if (chip) setFilters(chip.remove(filters));
            }}
            onClear={() => setFilters(clearFilters(filters))}
          />
        </div>

        <AnimatePresence initial={false}>
          {askPush && (
            <m.div
              key="push"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0, transition: springs.smooth }}
              exit={{ opacity: 0, transition: tweens.exit }}
              className="border-b border-border-subtle bg-surface px-gutter py-3"
            >
              <PushSoftAsk onDone={() => setAskPush(false)} className="max-w-prose" />
            </m.div>
          )}
        </AnimatePresence>

        {staleError && view !== 'timeline' && (
          <StaleStrip updatedAt={feed.dataUpdatedAt} onRetry={() => void feed.refetch()} />
        )}

        <div className="relative flex-1">
          <AnimatePresence>
            {hold.queued > 0 && view === 'list' && (
              <NewFitsPill
                count={hold.queued}
                onShow={() => {
                  hold.release();
                  feedRef.current?.scrollToTop();
                }}
              />
            )}
          </AnimatePresence>

          {view === 'timeline' ? (
            <div className="pt-2">
              <DeadlineTimeline
                feed={timelineFeed}
                timeZone={timeZone}
                now={now}
                openId={listingId}
                onOpen={(id) => openRow(id)}
                onTrack={(item: TimelineItem) => actions.track(toActionListing(item.item))}
                onShowAllTypes={
                  filters.types.length ? () => setFilters((f) => ({ ...f, types: [] })) : undefined
                }
                canShowMoreWeeks={false}
                weeks={4}
                stickyTop={headerHeight}
              />
            </div>
          ) : fullError ? (
            <FeedError
              message={feed.error?.message ?? ''}
              onRetry={() => void feed.refetch()}
              retrying={feed.isFetching}
            />
          ) : showSkeleton ? (
            <FeedSkeleton />
          ) : emptyVariant ? (
            <FeedEmpty
              variant={emptyVariant}
              minFit={filters.minFit}
              lowerTo={lowerTo}
              lowerCount={lowerCount.data ?? null}
              query={filters.q.trim()}
              narrowDescription={describeFilters(filters)}
              clearLabel={narrow?.label ?? null}
              onLower={() => setMinFit(lowerTo)}
              onClearNarrowest={() => narrow && setFilters(clearFilterKey(filters, narrow.clear))}
              onReset={() => setFilters(clearFilters(filters))}
              onSearchAllTypes={() => setFilters((f) => ({ ...f, types: [] }))}
              onShowHidden={() => setFilters((f) => ({ ...f, showHidden: true }))}
            />
          ) : view === 'grid' && feed.data ? (
            <RadarGrid
              items={items}
              cursorId={cursorId}
              openId={listingId}
              pendingIds={pendingIds}
              nowMs={nowMs}
              hasNextPage={Boolean(feed.hasNextPage)}
              isFetchingNextPage={feed.isFetchingNextPage}
              fetchNextPage={() => void feed.fetchNextPage()}
              onOpen={(id) => openRow(id)}
              onCursor={(id) => dispatch({ type: 'focus', id })}
              onAction={(action, item) => runAction(action, item)}
              onPrefetch={onPrefetch}
            />
          ) : view === 'board' ? (
            <RadarBoard
              columns={columns}
              limits={boardLimits}
              onShowMore={(type) =>
                setBoardLimits((l) => ({ ...l, [type]: (l[type] ?? BOARD_PAGE) + BOARD_PAGE }))
              }
              cursorId={cursorId}
              openId={listingId}
              pendingIds={pendingIds}
              nowMs={nowMs}
              onOpen={(id) => openRow(id)}
              onCursor={(id) => dispatch({ type: 'focus', id })}
              onAction={(action, item) => runAction(action, item)}
              onPrefetch={onPrefetch}
            />
          ) : feed.data ? (
            <RadarFeed
              ref={feedRef}
              items={items}
              listKey={listKey}
              total={total}
              hasNextPage={Boolean(feed.hasNextPage)}
              isFetchingNextPage={feed.isFetchingNextPage}
              isBusy={feed.isFetching && !feed.isFetchingNextPage && feed.isPlaceholderData}
              fetchNextPage={() => void feed.fetchNextPage()}
              cursorId={cursorId}
              openId={listingId}
              echo={echo}
              leavingIds={leaving}
              pendingIds={pendingIds}
              lastSeenAt={lastSeen}
              compact={compact}
              phone={phone}
              nowMs={nowMs}
              timeZone={timeZone}
              stickyOffset={headerHeight}
              onCursor={onRowCursor}
              onMove={(command) =>
                move(
                  command === 'next'
                    ? { type: 'move', delta: 1 }
                    : command === 'prev'
                      ? { type: 'move', delta: -1 }
                      : command === 'pageDown'
                        ? { type: 'move', delta: PAGE_STEP }
                        : command === 'pageUp'
                          ? { type: 'move', delta: -PAGE_STEP }
                          : command === 'first'
                            ? { type: 'first' }
                            : { type: 'last' },
                )
              }
              onOpen={onRowOpen}
              onAction={onRowAction}
              onPrefetch={onPrefetch}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
