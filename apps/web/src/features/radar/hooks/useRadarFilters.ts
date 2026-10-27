/**
 * Radar URL state: filters, view and the open listing live in the URL (`/radar/:listingId?…`), so
 * every state is linkable and the back button works. The last search is remembered per browser and
 * restored when the user lands on a bare `/radar` (USERFLOW §3.1: restore the last view and filters).
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import {
  filtersFromSearchParams,
  filtersToSearchParams,
  PARAM,
  viewFromSearchParams,
  type RadarFilters,
  type RadarView,
} from '../lib/filters';

import { readJson, writeJson } from '@/lib/storage';

const LAST_SEARCH_KEY = 'beacon:radar:last-search';

type Updater = RadarFilters | ((current: RadarFilters) => RadarFilters);

export function useRadarFilters() {
  const [params, setParams] = useSearchParams();
  const { listingId = null } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const filters = useMemo(() => filtersFromSearchParams(params), [params]);
  const view = viewFromSearchParams(params);
  const search = params.toString();

  // Restore the last radar search on a bare /radar; remember every change.
  useEffect(() => {
    if (location.search === '' && !listingId) {
      const last = readJson<string>(LAST_SEARCH_KEY, '');
      if (last) setParams(new URLSearchParams(last), { replace: true });
    }
    // Only on mount: later bare URLs are deliberate (e.g. "Reset filters").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeJson(LAST_SEARCH_KEY, search);
  }, [search]);

  const setFilters = useCallback(
    (next: Updater, { replace = true }: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const current = filtersFromSearchParams(prev);
          const value = typeof next === 'function' ? next(current) : next;
          return filtersToSearchParams(value, prev);
        },
        { replace },
      );
    },
    [setParams],
  );

  const setView = useCallback(
    (next: RadarView) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === 'list') out.delete(PARAM.view);
          else out.set(PARAM.view, next);
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /** Open the drawer (pushes history so Back closes it), or swap it (replace) while open. */
  const openListing = useCallback(
    (id: string, { replace = false }: { replace?: boolean } = {}) => {
      void navigate({ pathname: `/radar/${encodeURIComponent(id)}`, search: location.search }, { replace });
    },
    [navigate, location.search],
  );

  const closeListing = useCallback(() => {
    void navigate({ pathname: '/radar', search: location.search }, { replace: false });
  }, [navigate, location.search]);

  return { filters, view, search, listingId, setFilters, setView, openListing, closeListing };
}
