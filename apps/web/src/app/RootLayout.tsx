import { useEffect, useState } from 'react';
import { Outlet, ScrollRestoration, useMatches } from 'react-router';

import { Toaster } from '@/components/ui/sonner';

import { useUnauthorizedRedirect } from './auth-redirect';

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

export function RootLayout() {
  useDocumentTitle();
  useUnauthorizedRedirect();
  // Toasts mount after hydration: Sonner's markup depends on the client theme and viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <Outlet />
      <ScrollRestoration />
      {mounted && <Toaster />}
    </>
  );
}
