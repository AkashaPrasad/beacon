/** Window event the app shell listens for to soft-navigate (sent by the worker on notification click). */
export const NAVIGATE_EVENT = 'beacon:navigate';

/**
 * Deep links carried by web-push payloads (apps/worker/src/lib/push.ts `PushPayload.url`).
 * The worker links listings as `/radar?listing=<id>` and tracker items as `/tracker?item=<id>`; the app
 * routes are `/radar/<id>` and `/tracker/<id>`.
 * Anything off-origin falls back to the notification centre.
 */
export function pushTargetUrl(raw: string | null | undefined, origin: string): string {
  let url: URL;
  try {
    url = new URL(raw || '/notifications', origin);
  } catch {
    return '/notifications';
  }
  if (url.origin !== origin) return '/notifications';
  // Detail views are pages (`/radar/<id>`, `/tracker/<id>`); `/alerts?rule=` stays (the list highlights it).
  for (const [path, param] of [
    ['/radar', 'listing'],
    ['/tracker', 'item'],
  ] as const) {
    const id = url.pathname === path ? url.searchParams.get(param) : null;
    if (id) {
      url.searchParams.delete(param);
      url.pathname = `${path}/${encodeURIComponent(id)}`;
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
