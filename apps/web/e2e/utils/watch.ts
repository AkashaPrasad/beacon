/**
 * Page health watcher for the MSW-mode suites (`smoke-all`, `a11y`): collects, from the moment it
 * is attached, everything a student would never want to see happen:
 *
 * - `console.error` messages (with source location), uncaught exceptions (`pageerror`) and
 *   unhandled promise rejections (re-logged as console errors by an init script);
 * - failed network requests (`requestfailed`), except aborts the app asked for (TanStack Query
 *   cancels in-flight queries on unmount; a navigation cancels image loads);
 * - HTTP responses ≥ 400 from the mock API (`/v1/*`, `/healthz`, `/readyz`) or any other resource
 *   (fonts, images, chunks), named by method, status and path;
 * - Vite's error overlay (dev server only), which means a module failed to compile.
 *
 * `take()` returns and clears what was collected, so each stop of a journey reports only its own
 * problems. Pass `allow` patterns for problems a stop expects (e.g. a 403 on /admin as a non-admin).
 */
import type { Page } from '@playwright/test';

export interface PageProblems {
  /** Everything collected since the last `take()`, one readable line each. */
  take(): string[];
  /** Peek without clearing. */
  peek(): readonly string[];
  /** Add a pattern that is ignored from now on (expected problems for the current stop). */
  allow(pattern: RegExp): void;
}

/** Aborts the app (or the browser) asked for: not failures. */
const ABORTED =
  /net::ERR_ABORTED|cancelled|NS_BINDING_ABORTED|Load request cancelled|The network connection was lost|aborted/i;

const API_PATH = /\/(v1\/|healthz$|readyz$)/;

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return `${local ? '' : u.host}${u.pathname}${u.search.length > 80 ? `${u.search.slice(0, 80)}…` : u.search}`;
  } catch {
    return url.slice(0, 160);
  }
}

export async function watchPage(
  page: Page,
  opts: { allow?: RegExp[] } = {},
): Promise<PageProblems> {
  const found: string[] = [];
  // Missing third-party favicons intentionally render CompanyLogo's local letter fallback.
  const allowed: RegExp[] = [/www\.google\.com\/s2\/favicons/, ...(opts.allow ?? [])];
  const push = (line: string) => {
    if (allowed.some((re) => re.test(line))) return;
    found.push(line);
  };

  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason as { stack?: string; message?: string; name?: string } | undefined;
      // An aborted fetch (query cancelled on unmount) is not a failure.
      if (r?.name === 'AbortError') return;
      console.error(`[unhandledrejection] ${r?.stack ?? r?.message ?? String(e.reason)}`);
    });
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Chromium also logs every 4xx/5xx as "Failed to load resource"; the response handler below
    // reports those with the URL, so skip the duplicate.
    if (/^Failed to load resource: the server responded with a status of \d+/.test(text)) return;
    const loc = msg.location();
    push(
      `console.error: ${text.slice(0, 500)}${loc.url ? ` (${shortUrl(loc.url)}:${loc.lineNumber})` : ''}`,
    );
  });
  page.on('pageerror', (err) => {
    const where = (err.stack ?? '')
      .split('\n')
      .slice(1, 3)
      .map((s) => s.trim())
      .join(' ← ');
    push(`uncaught ${err.name}: ${err.message.slice(0, 400)}${where ? ` at ${where}` : ''}`);
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'failed';
    if (ABORTED.test(failure)) return;
    push(`request failed: ${req.method()} ${shortUrl(req.url())} (${failure})`);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const req = res.request();
    const kind = API_PATH.test(new URL(res.url()).pathname) ? 'mock API' : req.resourceType();
    push(`HTTP ${status} (${kind}): ${req.method()} ${shortUrl(res.url())}`);
  });

  return {
    take: () => found.splice(0),
    peek: () => found,
    allow: (pattern) => allowed.push(pattern),
  };
}

/** Dev server only: a module that fails to compile shows Vite's overlay over the whole page. */
export async function viteOverlay(page: Page): Promise<string | null> {
  const overlay = page.locator('vite-error-overlay');
  if ((await overlay.count()) === 0) return null;
  const text = await overlay
    .evaluate((el) => el.shadowRoot?.querySelector('.message')?.textContent ?? '')
    .catch(() => '');
  return `vite-error-overlay: ${text.slice(0, 400)}`;
}
