import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  buildUrl,
  CSRF_HEADER,
  CSRF_VALUE,
  errorMessage,
  isApiError,
  setUnauthorizedHandler,
  type ApiError,
} from './api';
import { parseJson } from './json';

type FetchArgs = [RequestInfo | URL, RequestInit | undefined];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

beforeEach(() => {
  fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

const lastCall = () => {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  const [url, init] = call;
  return {
    url: url instanceof Request ? url.url : url.toString(),
    init: init ?? {},
    headers: new Headers(init?.headers),
  };
};

describe('buildUrl', () => {
  it('joins the API origin and serialises query values (arrays as csv, empties dropped)', () => {
    const url = new URL(
      buildUrl('/v1/feed', {
        types: ['internship', 'hackathon'],
        minFit: 60,
        q: '',
        remote: undefined,
        saved: false,
      }),
    );
    expect(url.pathname).toBe('/v1/feed');
    expect(url.searchParams.get('types')).toBe('internship,hackathon');
    expect(url.searchParams.get('minFit')).toBe('60');
    expect(url.searchParams.get('saved')).toBe('false');
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.has('remote')).toBe(false);
  });
});

describe('request', () => {
  it('sends credentials on every call and keeps GETs free of the CSRF header (no preflight)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await api.get('/v1/me');
    const { init, headers } = lastCall();
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
    expect(headers.has(CSRF_HEADER)).toBe(false);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('adds X-Requested-With: beacon and a JSON body to mutations', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await api.patch('/v1/settings', { appearance: { theme: 'dark' } });
    const { init, headers } = lastCall();
    expect(result).toBeUndefined();
    expect(init.method).toBe('PATCH');
    expect(headers.get(CSRF_HEADER)).toBe(CSRF_VALUE);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ appearance: { theme: 'dark' } }));
  });

  it('does not set a Content-Type for FormData uploads', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ saved: true }));
    const form = new FormData();
    form.append('file', new Blob(['%PDF']), 'resume.pdf');
    await api.post('/v1/profile/resume', form);
    const { init, headers } = lastCall();
    expect(init.body).toBe(form);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get(CSRF_HEADER)).toBe(CSRF_VALUE);
  });

  it('revives ISO date-times into Dates and leaves date-only strings alone', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        createdAt: '2026-10-27T09:30:00.000Z',
        date: '2026-10-27',
        name: 'Beacon',
        nested: [{ at: '2026-10-28T18:29:59+05:30' }],
      }),
    );
    const body = await api.get<{
      createdAt: Date;
      date: string;
      name: string;
      nested: { at: Date }[];
    }>('/v1/thing');
    expect(body.createdAt).toBeInstanceOf(Date);
    expect(body.createdAt.toISOString()).toBe('2026-10-27T09:30:00.000Z');
    expect(body.date).toBe('2026-10-27');
    expect(body.nested[0]?.at).toBeInstanceOf(Date);
    expect(parseJson<{ v: string }>('{"v":"not a date"}').v).toBe('not a date');
  });

  it('turns the error envelope into an ApiError with code, message, issues, request id and Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Slow down',
            details: { retryAfterSeconds: 30 },
            issues: [{ path: ['limit'], code: 'too_big', message: 'Too big' }],
          },
        },
        { status: 429, headers: { 'X-Request-Id': 'req-123', 'Retry-After': '30' } },
      ),
    );
    const error = await api.get('/v1/feed').catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    const e = error as ApiError;
    expect(e.status).toBe(429);
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.message).toBe('Slow down');
    expect(e.requestId).toBe('req-123');
    expect(e.retryAfterSeconds).toBe(30);
    expect(e.issues).toHaveLength(1);
    expect(e.isTransient).toBe(false);
    expect(errorMessage(e)).toBe('Slow down');
  });

  it('falls back to calm copy when the server sends no envelope', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const e = (await api.get('/v1/feed').catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe('HTTP_502');
    expect(e.message).toMatch(/server had a problem/i);
    expect(e.isTransient).toBe(true);
  });

  it('calls the unauthorized handler on 401, except for auth: "optional" requests', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const unauthorized = () =>
      jsonResponse(
        { error: { code: 'UNAUTHENTICATED', message: 'Sign in', details: { reason: 'expired' } } },
        { status: 401 },
      );

    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api.get('/v1/me', { auth: 'optional' })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(unauthorized());
    await expect(api.get('/v1/tracker')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect((onUnauthorized.mock.calls[0]?.[0] as ApiError).details).toEqual({ reason: 'expired' });
  });

  it('reports network failures as NETWORK and slow servers as TIMEOUT', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValue(new Response(null, { status: 503 })); // the connectivity probe
    await expect(api.get('/v1/feed')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });

    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(api.get('/v1/feed', { timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('reports a caller abort as ABORTED', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = api.get('/v1/feed', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
