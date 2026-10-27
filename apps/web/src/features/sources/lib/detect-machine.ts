/**
 * Live source detection state machine (DESIGN §10.5 add-source dialog, USERFLOW §1.6 / §5.1).
 *
 *   idle ──input──▶ typing ──(valid URL, 400 ms quiet)──▶ detecting ──▶ detected | crawl | error
 *     ▲               │ invalid text stays in typing with a hint            │
 *     └────clear──────┘◀──────────────────── input (any time) ──────────────┘
 *
 * Responses carry the request id they answer; a response for an older request is ignored, so a
 * slow first lookup can never overwrite the result for what the user typed last.
 */
import { SOURCE_KIND_LABELS, tryNormaliseUrl } from '@kestrel/shared';

import type { DetectResult } from '@/api/types';

export const DETECT_DEBOUNCE_MS = 400;

export type { DetectResult };

export type DetectErrorKind = 'bad-token' | 'unreachable' | 'rate-limited' | 'duplicate' | 'invalid' | 'unknown';

export interface DetectError {
  kind: DetectErrorKind;
  message: string;
  /** For `duplicate`: the existing source id (409 details.existingId). */
  existingId?: string;
  retryAfterSeconds?: number;
}

export type DetectState =
  | { status: 'idle'; input: '' }
  | { status: 'typing'; input: string; url: string | null; hint: string | null }
  | { status: 'detecting'; input: string; url: string; requestId: number }
  | { status: 'detected'; input: string; url: string; result: DetectResult; redirectedTo: string | null }
  | { status: 'crawl'; input: string; url: string; result: DetectResult; redirectedTo: string | null }
  | { status: 'error'; input: string; url: string | null; error: DetectError; result: DetectResult | null };

export type DetectEvent =
  | { type: 'input'; value: string }
  | { type: 'settled' } // debounce elapsed
  | { type: 'start'; requestId: number }
  | { type: 'success'; requestId: number; result: DetectResult }
  | { type: 'failure'; requestId: number; error: DetectError }
  | { type: 'retry'; requestId: number }
  | { type: 'reset' };

export const initialDetectState: DetectState = { status: 'idle', input: '' };

/** A URL worth detecting: parses, has a dotted host (or localhost), and isn't just a scheme. */
export function candidateUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length < 4 || /\s/.test(trimmed)) return null;
  const url = tryNormaliseUrl(trimmed);
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host !== 'localhost' && !/^[^.]+(\.[^.]+)+$/.test(host)) return null;
    if (/\.$|\.\./.test(host)) return null;
    const tld = host.split('.').pop() ?? '';
    if (host !== 'localhost' && tld.length < 2) return null;
  } catch {
    return null;
  }
  return url;
}

function hintFor(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/\s/.test(t)) return 'URLs have no spaces.';
  if (!/\./.test(t)) return 'Paste a full link, like boards.greenhouse.io/stripe.';
  return null;
}

/** Normalised form used to compare a redirect target with the input (scheme/www/trailing slash). */
function sameTarget(a: string, b: string): boolean {
  return (tryNormaliseUrl(a) ?? a) === (tryNormaliseUrl(b) ?? b);
}

export function classifyResult(input: string, url: string, result: DetectResult): DetectState {
  const redirectedTo = result.finalUrl && !sameTarget(result.finalUrl, url) ? result.finalUrl : null;
  if (!result.valid) {
    return {
      status: 'error',
      input,
      url,
      result,
      error: {
        kind: 'bad-token',
        message: result.boardToken
        ? `${SOURCE_KIND_LABELS[result.kind]} has no board called “${result.boardToken}”. Check the link on the company's careers page.`
          : result.message || 'That board has no open listings or does not exist.',
      },
    };
  }
  if (result.kind === 'firecrawl' || result.costsCredits) {
    return { status: 'crawl', input, url, result, redirectedTo };
  }
  return { status: 'detected', input, url, result, redirectedTo };
}

export function detectReducer(state: DetectState, event: DetectEvent): DetectState {
  switch (event.type) {
    case 'reset':
      return initialDetectState;
    case 'input': {
      if (!event.value.trim()) return initialDetectState;
      const url = candidateUrl(event.value);
      return { status: 'typing', input: event.value, url, hint: url ? null : hintFor(event.value) };
    }
    case 'settled':
      // Nothing to do unless we're waiting with a valid URL.
      return state;
    case 'start':
    case 'retry': {
      const url = 'url' in state ? state.url : null;
      if (!url) return state;
      if (state.status === 'detecting' && state.requestId === event.requestId) return state;
      return { status: 'detecting', input: state.input, url, requestId: event.requestId };
    }
    case 'success':
      if (state.status !== 'detecting' || state.requestId !== event.requestId) return state;
      return classifyResult(state.input, state.url, event.result);
    case 'failure':
      if (state.status !== 'detecting' || state.requestId !== event.requestId) return state;
      return { status: 'error', input: state.input, url: state.url, error: event.error, result: null };
  }
}

/** Should the debounce timer fire a detection for this state? */
export function shouldDetect(state: DetectState): state is Extract<DetectState, { status: 'typing' }> & { url: string } {
  return state.status === 'typing' && state.url !== null;
}

/** Can the dialog's [Add source] button submit? Crawl fallback needs no extra confirmation. */
export function canSubmit(state: DetectState): boolean {
  return state.status === 'detected' || state.status === 'crawl';
}

/** Map an API error envelope / status to a detection error (API §1.4). */
export function detectErrorFrom(status: number, body: unknown): DetectError {
  const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)
    ?.error;
  const details = err?.details ?? {};
  if (status === 429) {
    const retry = Number(details['retryAfterSeconds'] ?? 0) || undefined;
    return {
      kind: 'rate-limited',
      message: `Too many lookups in a minute. Try again${retry ? ` in ${retry} s` : ' shortly'}.`,
      ...(retry ? { retryAfterSeconds: retry } : {}),
    };
  }
  if (status === 409) {
    const existingId = typeof details['existingId'] === 'string' ? details['existingId'] : undefined;
    return { kind: 'duplicate', message: 'You already watch this page.', ...(existingId ? { existingId } : {}) };
  }
  if (status === 400) {
    return { kind: 'invalid', message: 'That doesn’t look like a web address.' };
  }
  if (status === 502 || status === 504 || status === 0) {
    return {
      kind: 'unreachable',
      message:
        "We couldn't reach that page. Check the address, or try the company's careers page, or a Greenhouse, Lever or Ashby link.",
    };
  }
  return { kind: 'unknown', message: err?.message ?? 'Detection failed. Try again.' };
}

/** "Greenhouse board `stripe` · 142 jobs" parts for the result line. */
export function resultSummary(result: DetectResult): { kindLabel: string; token: string | null; count: string | null } {
  const kindLabel = SOURCE_KIND_LABELS[result.kind];
  const token = result.boardToken ?? result.config.provider ?? null;
  const count =
    result.previewCount == null ? null : `${result.previewCount} ${result.previewCount === 1 ? 'job' : 'jobs'}`;
  return { kindLabel, token, count };
}

/** Approximate crawl cost per day for the crawler fallback ("uses ~N credits/day"). */
export function estimateDailyCredits(interval: '1h' | '6h' | 'daily' | 'weekly', pages = 1): number {
  const perDay = interval === '1h' ? 24 : interval === '6h' ? 4 : interval === 'daily' ? 1 : 1 / 7;
  return Math.max(1, Math.round(perDay * pages));
}
