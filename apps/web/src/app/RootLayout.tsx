import { lazy, Suspense, useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation, useMatches, useNavigate } from 'react-router';

import { NAVIGATE_EVENT, pushTargetUrl } from '@/lib/push-url';
import { useHydrated } from '@/lib/use-hydrated';

import { useUnauthorizedRedirect } from './auth-redirect';

// Sonner is not on the critical path: the toaster chunk loads right after hydration.
const Toaster = lazy(() => import('@/components/ui/sonner').then((m) => ({ default: m.Toaster })));

const APP = 'Beacon';
const DEFAULT_TITLE = 'Beacon · Every opportunity that fits you';

/** Document title from the deepest `handle.title` ("Radar · Beacon"); the landing keeps the full title. */
function useDocumentTitle() {
  const matches = useMatches();
  useEffect(() => {
    let title: string | null | undefined;
    for (const match of matches) {
      const handle = match.handle as { title?: string | null } | undefined;
      if (handle && 'title' in handle) title = handle.title;
    }
    document.title = title ? `${title} · ${APP}` : DEFAULT_TITLE;
  }, [matches]);
}

/** Notification clicks from the service worker navigate the running app instead of reloading it. */
function useServiceWorkerNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      if (typeof url === 'string' && url.startsWith('/')) void navigate(url);
    };
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(NAVIGATE_EVENT, onNavigate);
  }, [navigate]);
}

/**
 * Worker-written deep links (notifications, push) use `/radar?listing=<id>` and `/tracker?item=<id>`;
 * the detail pages are `/radar/<id>` and `/tracker/<id>`. Normalise on arrival so every entry point
 * (push, bell, pasted link) lands on the page. `/alerts?rule=` is read by the alerts screen.
 */
function useLegacyDeepLinks() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const legacy =
      (pathname === '/radar' && search.includes('listing=')) ||
      (pathname === '/tracker' && search.includes('item='));
    if (!legacy) return;
    void navigate(pushTargetUrl(`${pathname}${search}${hash}`, window.location.origin), { replace: true });
  }, [pathname, search, hash, navigate]);
}

export function RootLayout() {
  useDocumentTitle();
  useUnauthorizedRedirect();
  useServiceWorkerNavigation();
  useLegacyDeepLinks();
  // Toasts mount after hydration: Sonner's markup depends on the client theme and viewport.
  const hydrated = useHydrated();
  return (
    <>
      <Outlet />
      <ScrollRestoration />
      {hydrated && (
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
      )}
    </>
  );
}
