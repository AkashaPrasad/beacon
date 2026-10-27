import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** The parent of a path: `/tracker/abc` → `/tracker`, `/sources/packs/x` → `/sources/packs`. */
export function parentPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  const parent = trimmed.slice(0, trimmed.lastIndexOf('/'));
  return parent || '/';
}

/** True when the browser history holds an earlier entry of this app (React Router stores `idx`). */
export function hasInAppHistory(locationKey: string): boolean {
  if (locationKey === 'default') return false;
  const state = (typeof window === 'undefined' ? null : window.history.state) as { idx?: number } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

/**
 * Back for detail pages (page-based navigation): returns to the previous in-app entry when there is
 * one (so the list keeps its scroll position and filters), else replaces the page with `fallback`
 * (default: the parent path) — a cold-loaded detail URL never "goes back" out of Beacon.
 *
 *   const back = useBackNavigation('/sources');   // parent override for /sources/packs/:id
 */
export function useBackNavigation(fallback?: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (hasInAppHistory(location.key)) void navigate(-1);
    else void navigate(fallback ?? parentPath(location.pathname), { replace: true, viewTransition: true });
  }, [navigate, location.key, location.pathname, fallback]);
}
