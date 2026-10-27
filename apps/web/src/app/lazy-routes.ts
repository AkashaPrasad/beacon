import { matchRoutes, type RouteObject } from 'react-router';

/** Route-module exports React Router understands (anything else a module exports is ignored). */
const ROUTE_KEYS = [
  'Component',
  'ErrorBoundary',
  'HydrateFallback',
  'element',
  'errorElement',
  'loader',
  'action',
  'handle',
  'shouldRevalidate',
] as const;

/**
 * Resolve the `lazy` routes that match `location` before the router is created, so a prerendered page
 * hydrates against the same tree the server rendered (React Router's "lazy + SSR" recipe) and a direct
 * visit renders its screen on the first frame instead of after a second round trip.
 */
export async function resolveLazyRoutes(routes: RouteObject[], location: string): Promise<void> {
  const matches = matchRoutes(routes, location) ?? [];
  await Promise.all(
    matches.map(async ({ route }) => {
      if (typeof route.lazy !== 'function') return;
      const mod = (await (route.lazy as () => Promise<Record<string, unknown>>)()) ?? {};
      const resolved: Record<string, unknown> = { lazy: undefined };
      for (const key of ROUTE_KEYS) if (key in mod) resolved[key] = mod[key];
      Object.assign(route, resolved);
    }),
  );
}
