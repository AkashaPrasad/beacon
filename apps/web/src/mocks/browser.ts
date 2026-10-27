/**
 * MSW in the browser (`VITE_MOCK_API=1`): every API call is answered by ./handlers, so the app runs
 * with no backend (demos, Lighthouse, screen development). Scenario switches are listed in docs/WEB.md.
 *
 * Bypass: Playwright specs that bring their own fake API (`page.route`) set
 * `window.__BEACON_E2E__ = { transport: 'playwright' }` before any app code; then the worker is not
 * started and requests reach the network layer.
 */
import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

declare global {
  interface Window {
    __BEACON_E2E__?: { transport?: 'playwright' | 'msw' };
  }
}

export const worker = setupWorker(...handlers);

export async function startMockWorker(): Promise<boolean> {
  if (window.__BEACON_E2E__?.transport === 'playwright') return false;
  await worker.start({
    onUnhandledRequest(request, print) {
      // Only API traffic is ours to answer; fonts, favicons and Google go to the network.
      if (/\/(v1\/|healthz$|readyz$)/.test(new URL(request.url).pathname)) print.warning();
    },
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
  window.__BEACON_MOCK__ = true;
  return true;
}
