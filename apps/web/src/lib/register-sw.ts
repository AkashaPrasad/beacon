import { toast } from 'sonner';

import { NAVIGATE_EVENT } from './push-url';

/**
 * Registers the PWA service worker (src/sw.ts → /sw.js) after load, production only, never in mock mode
 * (MSW owns the worker scope there). When an update is waiting, offer a reload instead of forcing one.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              toast('A new version of Beacon is ready.', {
                duration: Infinity,
                action: {
                  label: 'Reload',
                  onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
                },
              });
            }
          });
        });
      })
      .catch(() => undefined);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.addEventListener(
      'message',
      (event: MessageEvent<{ type?: string; url?: string }>) => {
        if (event.data?.type === 'beacon:navigate' && typeof event.data.url === 'string') {
          window.dispatchEvent(new CustomEvent<string>(NAVIGATE_EVENT, { detail: event.data.url }));
        }
      },
    );
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
