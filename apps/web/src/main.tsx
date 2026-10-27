import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { App } from './app/App';
import { resolveLazyRoutes } from './app/lazy-routes';
import { routes } from './app/routes';
import { env } from './lib/env';
import { createIdbPersister, createQueryClient } from './lib/query-client';
import './styles/fonts';
import './styles/index.css';

/**
 * Mock API (`VITE_MOCK_API=1`): MSW answers every request before the app renders. Never blocks the
 * page: if the worker can't start (Playwright `serviceWorkers: 'block'`, private mode), log and render,
 * so a page-level fake (`page.route`) or the real network answers instead.
 */
async function startMocksIfEnabled(): Promise<void> {
  // `import.meta.env` inline (not `env.mockApi`) so production builds drop MSW entirely.
  if (import.meta.env.VITE_MOCK_API !== '1' || window.__BEACON_E2E__?.transport === 'playwright')
    return;
  try {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  } catch (error) {
    console.info('[beacon] mock API not started:', error instanceof Error ? error.message : error);
  }
}

async function boot() {
  await startMocksIfEnabled();
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root element');

  // Load the matching lazy screens first: prerendered pages hydrate against the same tree, and a
  // direct visit renders its screen on the first frame.
  await resolveLazyRoutes(routes, window.location.pathname);
  const router = createBrowserRouter(routes);
  const app = (
    <StrictMode>
      <App router={router} queryClient={createQueryClient()} persister={createIdbPersister()} />
    </StrictMode>
  );

  // `/` and `/login` ship prerendered HTML (scripts/prerender.mjs): hydrate it instead of re-rendering.
  const prerendered =
    container.dataset.prerendered === window.location.pathname && container.firstElementChild;
  if (prerendered) hydrateRoot(container, app);
  else createRoot(container).render(app);

  if (!env.mockApi && import.meta.env.PROD) {
    const { registerServiceWorker } = await import('./lib/register-sw');
    registerServiceWorker();
  }
}

void boot();
