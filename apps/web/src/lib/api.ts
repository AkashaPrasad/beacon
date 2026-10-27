/**
 * Typed fetch client for the Beacon API (docs/API.md).
 *
 * - Base URL `VITE_API_URL`, `credentials: 'include'` (httpOnly `beacon_session` cookie).
 * - Mutating requests send `X-Requested-With: beacon` (CSRF guard, §1.2); GETs stay preflight-free.
 * - Error envelope `{ error: { code, message, details?, issues? } }` → `ApiError`.
 * - Network failures → `ApiError` with code `NETWORK` (and a connectivity probe); timeouts → `TIMEOUT`.
 * - 401 → the registered unauthorized handler (redirect to /login?next=…) unless `auth: 'optional'`.
 * - JSON bodies are parsed with an ISO date reviver, so `Date` fields in shared types are real Dates.
 */
import { reportNetworkFailure, reportNetworkSuccess } from './connectivity';
import { env } from './env';
import { parseJson } from './json';

export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'beacon';
const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiErrorCode =
  | 'VALIDATION'
  | 'BAD_CURSOR'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_GOOGLE_TOKEN'
  | 'CSRF'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RESUME_NO_TEXT'
  | 'RESUME_UNREADABLE'
  | 'AI_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL'
  // client-side
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'INVALID_RESPONSE'
  | (string & {});

export interface ApiIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly issues: ApiIssue[];
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    issues?: ApiIssue[];
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.issues = init.issues ?? [];
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** Worth retrying automatically (network, timeout, 5xx except 501). */
  get isTransient(): boolean {
    return (
      this.code === 'NETWORK' ||
      this.code === 'TIMEOUT' ||
      (this.status >= 500 && this.status !== 501)
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  /** JSON-serialisable body, or FormData for uploads. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** `optional`: a 401 is returned as an error without triggering the sign-in redirect. */
  auth?: 'required' | 'optional';
}

type UnauthorizedHandler = (error: ApiError) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered once by the app (see src/app/auth-redirect.ts). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(
    path.startsWith('http') ? path : `${env.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length) url.searchParams.set(key, value.join(','));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const present = signals.filter((s): s is AbortSignal => Boolean(s));
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(present);
  const controller = new AbortController();
  for (const s of present) {
    if (s.aborted) controller.abort(s.reason);
    else s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

async function parseError(res: Response): Promise<ApiError> {
  const requestId = res.headers.get('X-Request-Id');
  const retryAfter = Number(res.headers.get('Retry-After'));
  let body: unknown;
  try {
    const text = await res.text();
    body = text ? parseJson(text) : null;
  } catch {
    body = null;
  }
  const envelope =
    body && typeof body === 'object' && 'error' in body
      ? ((body as { error: Record<string, unknown> }).error ?? {})
      : null;
  const code =
    typeof envelope?.code === 'string' ? envelope.code.toUpperCase() : `HTTP_${res.status}`;
  const message =
    typeof envelope?.message === 'string' && envelope.message
      ? envelope.message
      : defaultMessage(res.status);
  return new ApiError({
    status: res.status,
    code: code === 'UNAUTHORIZED' ? 'UNAUTHENTICATED' : code,
    message,
    details: envelope?.details,
    issues: Array.isArray(envelope?.issues) ? (envelope.issues as ApiIssue[]) : [],
    requestId,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Your session ended. Sign in again to continue.';
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "That doesn't exist any more.";
  if (status === 429) return 'Too many requests. Try again in a moment.';
  if (status >= 500) return "Beacon's server had a problem. Try again in a moment.";
  return 'The request failed.';
}

/** Low-level request. Prefer the `api.get/post/…` helpers. */
export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    query,
    body,
    headers,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    auth = 'required',
  } = options;
  const timeout = new AbortController();
  const timer = setTimeout(
    () => timeout.abort(new DOMException('Timeout', 'TimeoutError')),
    timeoutMs,
  );
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        // Only mutating requests need the CSRF header; keeping GETs "simple" avoids a CORS preflight.
        ...(method !== 'GET' ? { [CSRF_HEADER]: CSRF_VALUE } : {}),
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: anySignal([signal, timeout.signal]),
    });
  } catch (error) {
    clearTimeout(timer);
    if (signal?.aborted) {
      throw new ApiError({ status: 0, code: 'ABORTED', message: 'The request was cancelled.' });
    }
    if (timeout.signal.aborted) {
      throw new ApiError({
        status: 0,
        code: 'TIMEOUT',
        message: `The server didn't respond within ${Math.round(timeoutMs / 1000)} seconds.`,
      });
    }
    reportNetworkFailure();
    throw new ApiError({
      status: 0,
      code: 'NETWORK',
      message: "Couldn't reach Beacon. Check your connection.",
      details: error instanceof Error ? error.message : undefined,
    });
  }
  clearTimeout(timer);
  reportNetworkSuccess();

  if (!res.ok) {
    const error = await parseError(res);
    if (res.status === 401 && auth === 'required') unauthorizedHandler?.(error);
    throw error;
  }
  if (res.status === 204 || res.status === 205) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  if (!type.includes('json')) return text as T;
  try {
    return parseJson<T>(text);
  } catch {
    throw new ApiError({
      status: res.status,
      code: 'INVALID_RESPONSE',
      message: 'The server sent a response Beacon could not read.',
      requestId: res.headers.get('X-Request-Id'),
    });
  }
}

type Opts = Omit<RequestOptions, 'method' | 'body'>;

export const api = {
  get: <T>(path: string, options?: Opts) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Opts) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Opts) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Opts) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown, options?: Opts) =>
    request<T>(path, { ...options, method: 'DELETE', body }),
};

/** Human copy for an error (DESIGN §8 rule 5: what failed, why, the fix). */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
