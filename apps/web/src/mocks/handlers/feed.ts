/**
 * MSW handlers for docs/API.md §6 feed routes: `GET /v1/feed`, `GET /v1/feed/summary`,
 * `POST /v1/feed/seen`. Data and filtering rules live in `features/radar/mocks`.
 *
 * Scenario: localStorage['beacon:mock:radar'] = 'default' | 'large' (5,000 listings) | 'warming'
 * (ranking streams in over `beacon:mock:warmMs`, default 25 s) | 'empty' | 'error' | 'returning'.
 * `beacon:mock:latency` (ms) overrides the response delay.
 */
import { delay, http, HttpResponse } from 'msw';

import { readScenario, resetStore } from '@/features/radar/mocks/fixtures';
import { feedSummary, markSeen, queryFeed } from '@/features/radar/mocks/query';

function latency(fallback: number): number {
  try {
    const raw = Number(localStorage.getItem('beacon:mock:latency'));
    return Number.isFinite(raw) && raw >= 0 && localStorage.getItem('beacon:mock:latency') != null ? raw : fallback;
  } catch {
    return fallback;
  }
}

const serverError = () =>
  HttpResponse.json(
    { error: { code: 'SERVICE_UNAVAILABLE', message: "The server didn't respond within 10 seconds." } },
    { status: 503 },
  );

export function resetFeedMock(): void {
  resetStore();
}

export const feedHandlers = [
  http.get('*/v1/feed', async ({ request }) => {
    await delay(latency(readScenario() === 'large' ? 60 : 180));
    if (readScenario() === 'error') return serverError();
    const result = queryFeed(new URL(request.url).searchParams);
    if ('error' in result) {
      return HttpResponse.json({ error: { code: 'BAD_CURSOR', message: 'Cursor does not match this query' } }, { status: 400 });
    }
    return HttpResponse.json(result);
  }),

  http.get('*/v1/feed/summary', async () => {
    await delay(latency(120));
    if (readScenario() === 'error') return serverError();
    return HttpResponse.json(feedSummary());
  }),

  http.post('*/v1/feed/seen', async () => {
    await delay(latency(60));
    markSeen();
    return new HttpResponse(null, { status: 204 });
  }),
];
