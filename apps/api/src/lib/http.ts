import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type FetchLike = typeof fetch;

export class SafeFetchError extends Error {
  readonly reason: 'blocked_host' | 'too_many_redirects' | 'timeout' | 'network' | 'bad_url';
  constructor(reason: SafeFetchError['reason'], message: string) {
    super(message);
    this.name = 'SafeFetchError';
    this.reason = reason;
  }
}

export interface SafeFetchOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Bytes read from the body; the rest is discarded and `truncated` is set. */
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: FetchLike;
  /** Resolve DNS and refuse private addresses (default true). Literal IPs are always checked. */
  resolveDns?: boolean;
  /**
   * Called with each redirect target; returning true stops there without fetching it (the
   * 3xx response is returned with `finalUrl` = the target). Used to recognise ATS boards.
   */
  stopAtRedirect?: (target: URL) => boolean;
}

export interface SafeResponse {
  status: number;
  ok: boolean;
  url: string;
  finalUrl: string;
  redirects: number;
  headers: Headers;
  contentType: string;
  text: string;
  truncated: boolean;
}

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; BeaconBot/1.0; +https://beacon.spacesdrive.cc)';

function ipv4Private(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Private(ip);
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return ipv4Private(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
  }
  return false;
}

/** Throws `SafeFetchError('blocked_host')` for URLs that must never be fetched server-side. */
export async function assertPublicUrl(url: URL, resolveDns = true): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('bad_url', `Unsupported scheme ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new SafeFetchError('blocked_host', `Refusing to fetch ${host}`);
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new SafeFetchError('blocked_host', `Refusing to fetch ${host}`);
    return;
  }
  if (!resolveDns) return;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SafeFetchError('network', `Could not resolve ${host}`);
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new SafeFetchError('blocked_host', `Refusing to fetch ${host} (private address)`);
  }
}

async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - size));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}

/**
 * fetch() for user-supplied URLs: timeout, body size cap, manual redirects (≤ maxRedirects,
 * each hop re-checked against private addresses) and the final URL recorded.
 */
export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 10_000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    fetchImpl = fetch,
    resolveDns = true,
    stopAtRedirect,
  } = options;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeFetchError('bad_url', 'Invalid URL');
  }
  const startUrl = url.toString();
  let currentMethod = method;
  let currentBody = body;
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; ; hop += 1) {
    await assertPublicUrl(url, resolveDns);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: currentMethod,
        headers: { 'user-agent': DEFAULT_USER_AGENT, accept: '*/*', ...headers },
        ...(currentBody !== undefined ? { body: currentBody } : {}),
        redirect: 'manual',
        signal,
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new SafeFetchError('timeout', `Timed out after ${timeoutMs} ms`);
      }
      throw new SafeFetchError('network', (err as Error).message || 'Network error');
    }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => undefined);
      if (hop >= maxRedirects) {
        throw new SafeFetchError('too_many_redirects', `More than ${maxRedirects} redirects`);
      }
      url = new URL(location, url);
      if (stopAtRedirect?.(url)) {
        return {
          status: res.status,
          ok: false,
          url: startUrl,
          finalUrl: url.toString(),
          redirects: hop + 1,
          headers: res.headers,
          contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
          text: '',
          truncated: false,
        };
      }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      continue;
    }

    let text = '';
    let truncated = false;
    if (currentMethod !== 'HEAD') {
      try {
        ({ text, truncated } = await readCapped(res, maxBytes));
      } catch (err) {
        const name = (err as Error).name;
        if (name === 'TimeoutError' || name === 'AbortError') {
          throw new SafeFetchError('timeout', `Timed out after ${timeoutMs} ms`);
        }
        throw new SafeFetchError('network', (err as Error).message || 'Network error');
      }
    }
    return {
      status: res.status,
      ok: res.ok,
      url: startUrl,
      finalUrl: url.toString(),
      redirects: hop,
      headers: res.headers,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      text,
      truncated,
    };
  }
}

/** Parse JSON without throwing. */
export function tryJson<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
