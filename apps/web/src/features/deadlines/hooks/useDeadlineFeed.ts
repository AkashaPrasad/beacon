/**
 * Data for the deadline timeline: the radar feed sorted by deadline (closed ones included, so this
 * week's past days keep their pills), paged until the visible window is covered, plus a fit-sorted
 * page for the "No fixed deadline" group (rolling / unknown deadlines sort last by deadline, so they
 * would otherwise need every page). Both are ordinary feed queries: saves and hides made anywhere
 * patch them through the shared feed cache.
 */
import { useEffect, useMemo } from 'react';

import { useFeed } from '@/api/feed';
import type { FeedFilters, FeedItemDTO } from '@/api/types';

import { buildTimeline, type TimelineModel } from '../lib/timeline';
import { addDays, dayKey } from '../lib/weeks';

const PAGE = 100;
/** Hard stop for the auto-pager (1,000 deadlines is far beyond a 12-week window in practice). */
const MAX_PAGES = 10;

export interface DeadlineFeed {
  model: TimelineModel;
  /** Every loaded row (drawer placeholder lookups). */
  rows: FeedItemDTO[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => void;
}

export function useDeadlineFeed(
  base: FeedFilters,
  { now, timeZone, weeks, enabled = true }: { now: Date; timeZone: string; weeks: number; enabled?: boolean },
): DeadlineFeed {
  const datedQuery = useMemo<FeedFilters>(
    () => ({ ...base, sort: 'deadline', includeExpired: true, limit: PAGE }),
    [base],
  );
  const undatedQuery = useMemo<FeedFilters>(() => ({ ...base, sort: 'fit', limit: PAGE }), [base]);
  const dated = useFeed(datedQuery, { enabled });
  const undated = useFeed(undatedQuery, { enabled });

  const nowDay = dayKey(now, timeZone);
  const rows = useMemo(() => {
    const out: FeedItemDTO[] = [];
    const seen = new Set<string>();
    for (const page of [...(dated.data?.pages ?? []), ...(undated.data?.pages ?? [])]) {
      for (const item of page.items) {
        if (seen.has(item.listing.id)) continue;
        seen.add(item.listing.id);
        out.push(item);
      }
    }
    return out;
  }, [dated.data, undated.data]);

  // `now` ticks every minute; the grid only changes with the day (the today line reads `now` itself).
  const model = useMemo(
    () => buildTimeline(rows, { now, timeZone, weeks }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, nowDay, timeZone, weeks],
  );

  // Keep paging (by deadline) until the last loaded row is past the window or the pages run out.
  const lastDated = dated.data?.pages.at(-1)?.items.at(-1)?.listing.deadlineAt ?? null;
  const pages = dated.data?.pages.length ?? 0;
  const windowEnd = addDays(model.range.to, 1);
  const needMore =
    dated.hasNextPage &&
    !dated.isFetchingNextPage &&
    pages < MAX_PAGES &&
    lastDated != null &&
    dayKey(lastDated, timeZone) < windowEnd;
  const { fetchNextPage } = dated;
  useEffect(() => {
    if (needMore) void fetchNextPage();
  }, [needMore, fetchNextPage]);

  return {
    model,
    rows,
    isPending: (dated.isPending || undated.isPending) && rows.length === 0,
    isError: dated.isError && !dated.data,
    error: dated.error,
    isFetching: dated.isFetching || undated.isFetching,
    refetch: () => {
      void dated.refetch();
      void undated.refetch();
    },
  };
}
