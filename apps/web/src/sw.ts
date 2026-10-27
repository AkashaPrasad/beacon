/// <reference lib="webworker" />
/**
 * Beacon service worker (vite-plugin-pwa `injectManifest`, built to /sw.js as an IIFE).
 *
 * - Precaches the hashed JS/CSS/fonts and brand icons (`self.__WB_MANIFEST`).
 * - Navigations are network-first (3 s), falling back to the last cached copy of the page or the app
 *   shell, so a returning visitor gets the app offline (USERFLOW §5.4). API calls are cross-origin and
 *   never touched: TanStack Query's persisted cache is the offline data source.
 * - Web push (`push`) shows the notification the worker sent (apps/worker/src/lib/push.ts `PushPayload`);
 *   `notificationclick` focuses an open Beacon tab (navigating it) or opens a new one.
 * - Updates wait for the page to confirm (`{ type: 'SKIP_WAITING' }` from src/lib/register-sw.ts).
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

import { pushTargetUrl } from './lib/push-url';

declare let self: ServiceWorkerGlobalScope;

const PAGES = 'beacon-pages-v1';
const SHELL_URL = '/index.html';
const ASSETS = 'beacon-assets-v1';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

self.addEventListener('install', (event) => {
  // Keep a copy of the app shell for offline navigations (best effort).
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      .catch(() => undefined),
  );
});

registerRoute(
  new NavigationRoute(new NetworkFirst({ cacheName: PAGES, networkTimeoutSeconds: 3 }), {
    denylist: [/^\/v1\//, /^\/sw\.js$/, /^\/mockServiceWorker\.js$/, /^\/manifest\.webmanifest$/],
  }),
);

// Hashed build files that were not precached (other font subsets, chunks of a newer deploy): immutable.
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    url.pathname.startsWith('/assets/') &&
    request.method === 'GET',
  new CacheFirst({ cacheName: ASSETS }),
);

// A new worker means a new deploy: drop the previous deploy's runtime-cached files (they refill on demand).
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete(ASSETS).then(() => undefined));
});

setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    const shell = await caches.match(SHELL_URL, { cacheName: PAGES });
    if (shell) return shell;
  }
  return Response.error();
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ── Web push ────────────────────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  notificationId?: string;
  kind?: string;
}

function readPayload(event: PushEvent): PushPayload {
  if (!event.data)
    return { title: 'Beacon', body: 'You have a new update.', url: '/notifications' };
  try {
    const parsed = event.data.json() as Partial<PushPayload>;
    return { ...parsed, title: parsed.title || 'Beacon' };
  } catch {
    return { title: 'Beacon', body: event.data.text(), url: '/notifications' };
  }
}

self.addEventListener('push', (event: PushEvent) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/brand/png/icon-192.png',
      badge: '/brand/png/favicon-32.png',
      lang: 'en-IN',
      data: {
        url: pushTargetUrl(payload.url, self.location.origin),
        notificationId: payload.notificationId ?? null,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const { url } = (event.notification.data ?? {}) as { url?: string };
  const target = pushTargetUrl(url, self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.focus();
        // A soft navigation inside the running app (keeps state); fall back to a hard one.
        existing.postMessage({ type: 'beacon:navigate', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
