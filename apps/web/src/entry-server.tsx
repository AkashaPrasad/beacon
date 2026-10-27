/**
 * Prerender entry (scripts/prerender.mjs, run after `vite build`). Renders public pages to static HTML
 * with the exact provider tree the browser hydrates (src/main.tsx), so headlines paint before any
 * JavaScript runs (Lighthouse LCP, DESIGN §6.3 Performance). The page list lives with the public
 * routes (src/routes/public.tsx) plus `/login`.
 *
 * Must stay browser-global free at render time; components touch window/document only in effects.
 */
import type { Persister } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';

import { App } from './app/App';
import { resolveLazyRoutes } from './app/lazy-routes';
import { routes } from './app/routes';
import { createQueryClient } from './lib/query-client';
import { prerenderPages, type PrerenderPage } from './routes/public';

export type { PrerenderPage };

export const PRERENDER_PAGES: PrerenderPage[] = [
  ...prerenderPages,
  { path: '/login', file: 'login.html', title: 'Sign in · Beacon' },
];

/** Same provider shape as the browser (PersistQueryClientProvider), without storage. */
const noopPersister: Persister = {
  persistClient: () => undefined,
  restoreClient: () => Promise.resolve(undefined),
  removeClient: () => undefined,
};

export async function render(path: string): Promise<string> {
  await resolveLazyRoutes(routes, path);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return renderToString(
    <StrictMode>
      <App router={router} queryClient={createQueryClient()} persister={noopPersister} />
    </StrictMode>,
  );
}
