import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { App } from './app/App';
import { routes } from './app/routes';
import { env } from './lib/env';
import { createIdbPersister, createQueryClient } from './lib/query-client';
import './styles/fonts';
import './styles/index.css';

async function startMocksIfEnabled(): Promise<void> {
  if (!env.mockApi) return;
  try {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  } catch (error) {
    // Service workers blocked (e.g. Playwright `serviceWorkers: 'block'`): requests go to the network,
    // where a page-level mock (page.route) can answer them.
    console.info('[beacon] mock API not started:', error instanceof Error ? error.message : error);
  }
}

async function boot() {
  await startMocksIfEnabled();
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root element');

  const router = createBrowserRouter(routes);
  const app = (
    <StrictMode>
      <App router={router} queryClient={createQueryClient()} persister={createIdbPersister()} />
    </StrictMode>
  );

  // Landing and login ship prerendered HTML (scripts/prerender.mjs): hydrate it instead of re-rendering.
  const prerendered = container.dataset.prerendered === window.location.pathname && container.firstElementChild;
  if (prerendered) hydrateRoot(container, app);
  else createRoot(container).render(app);

  if (!env.mockApi && import.meta.env.PROD) {
    const { registerServiceWorker } = await import('./lib/register-sw');
    registerServiceWorker();
  }
}

void boot();
