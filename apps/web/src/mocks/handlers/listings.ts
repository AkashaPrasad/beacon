/**
 * MSW handlers for docs/API.md §6 listing routes: detail, save/unsave, hide/unhide, explain.
 *
 * `localStorage['beacon:mock:ai'] = 'off'` makes explain answer like AI-off mode (`source: 'deterministic'`).
 * `beacon:mock:explainMs` overrides the explain latency (default 700 ms, to show the shimmer).
 */
import { delay, http, HttpResponse } from 'msw';

import { readScenario } from '@/features/radar/mocks/fixtures';
import { explanation, listingDetail, setFlag } from '@/features/radar/mocks/query';

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return raw != null && Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function aiOff(): boolean {
  try {
    return localStorage.getItem('beacon:mock:ai') === 'off';
  } catch {
    return false;
  }
}

const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Listing not found' } }, { status: 404 });

function flagRoute(action: 'save' | 'unsave' | 'hide' | 'unhide') {
  const flag = action === 'save' || action === 'unsave' ? 'saved' : 'hidden';
  const value = action === 'save' || action === 'hide';
  return http.post(`*/v1/listings/:id/${action}`, async ({ params }) => {
    await delay(readNumber('beacon:mock:latency', 160));
    const result = setFlag(String(params.id), flag, value);
    return result ? HttpResponse.json(result) : notFound();
  });
}

export const listingsHandlers = [
  http.get('*/v1/listings/:id', async ({ params }) => {
    await delay(readNumber('beacon:mock:latency', 160));
    if (readScenario() === 'error') {
      return HttpResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again in a moment.' } }, { status: 503 });
    }
    const detail = listingDetail(String(params.id));
    return detail ? HttpResponse.json(detail) : notFound();
  }),
  flagRoute('save'),
  flagRoute('unsave'),
  flagRoute('hide'),
  flagRoute('unhide'),
  http.post('*/v1/listings/:id/explain', async ({ params }) => {
    await delay(readNumber('beacon:mock:explainMs', 700));
    const result = explanation(String(params.id), aiOff());
    return result ? HttpResponse.json(result) : notFound();
  }),
];
