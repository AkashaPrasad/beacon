import { SourceError } from './errors.js';

export const USER_AGENT = 'BeaconBot/1.0 (+https://beacon.spacesdrive.cc/bot; student opportunity radar)';
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Default response size cap (list endpoints can be large: Greenhouse content=true ≈ 5 MB for 700 jobs). */
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  /** JSON-serialised when an object. */
  body?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
  /** Conditional request validators. */
  etag?: string | null;
  lastModified?: string | null;
  redirect?: 'follow' | 'manual';
}

export interface HttpResponse {
  status: number;
  url: string;
  headers: Headers;
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
  text: string;
}

async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new SourceError('parse', `Response too large (${declared} bytes > ${maxBytes})`, { url });
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = (await reader.read()) as { done: boolean; value?: Uint8Array };
    if (result.done || !result.value) break;
    const value = result.value;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SourceError('parse', `Response exceeded ${maxBytes} bytes`, { url });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Maps an HTTP status to a typed SourceError (null for 2xx/304). */
export function errorForStatus(status: number, url: string, retryAfter?: string | null): SourceError | null {
  if ((status >= 200 && status < 300) || status === 304) return null;
  if (status === 401 || status === 403) return new SourceError('auth', `HTTP ${status} (access denied)`, { status, url });
  if (status === 404 || status === 410) return new SourceError('notfound', `HTTP ${status} (not found)`, { status, url });
  if (status === 429) {
    return new SourceError('ratelimited', 'HTTP 429 (rate limited)', { status, url, retryAfterMs: retryAfterMs(retryAfter ?? null) });
  }
  if (status >= 500) return new SourceError('network', `HTTP ${status} (server error)`, { status, url });
  return new SourceError('parse', `Unexpected HTTP ${status}`, { status, url });
}

/**
 * fetch with a hard timeout, a response-size cap, conditional validators and typed
 * errors. Non-2xx statuses throw `SourceError` (304 returns `notModified: true`).
 */
export async function httpRequest(url: string, req: HttpRequest = {}): Promise<HttpResponse> {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json, */*;q=0.5', ...req.headers };
  if (req.etag) headers['if-none-match'] = req.etag;
  if (req.lastModified) headers['if-modified-since'] = req.lastModified;
  let body: string | undefined;
  if (req.body !== undefined) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    headers['content-type'] ??= 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      redirect: req.redirect ?? 'follow',
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new SourceError('network', timeout ? `Timed out after ${req.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms` : `Request failed: ${err instanceof Error ? err.message : String(err)}`, { url, cause: err });
  }
  const error = errorForStatus(res.status, url, res.headers.get('retry-after'));
  if (error) {
    await res.body?.cancel().catch(() => undefined);
    throw error;
  }
  const notModified = res.status === 304;
  const text = notModified || req.method === 'HEAD' ? '' : await readCapped(res, req.maxBytes ?? DEFAULT_MAX_BYTES, url);
  return {
    status: res.status,
    url: res.url || url,
    headers: res.headers,
    notModified,
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    text,
  };
}

/** `httpRequest` + JSON.parse with a typed parse error. */
export async function httpJson<T = unknown>(url: string, req: HttpRequest = {}): Promise<{ data: T | null; res: HttpResponse }> {
  const res = await httpRequest(url, req);
  if (res.notModified) return { data: null, res };
  try {
    return { data: JSON.parse(res.text) as T, res };
  } catch (err) {
    throw new SourceError('parse', `Invalid JSON from ${new URL(url).host}`, { url, cause: err });
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
