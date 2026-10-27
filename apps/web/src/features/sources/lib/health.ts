/**
 * Source health and crawl-credit display rules (DESIGN §6.1 credit meter, §10.5 sources table,
 * BRIEF #3 cloud → self-hosted standby).
 */
import type { CreditsResponse } from '@/api/types';
import type { SourceHealth, SourceKind } from '@kestrel/shared';


/** API §5 CreditsResponse. */
export type Credits = CreditsResponse;

export type MeterTone = 'normal' | 'warning' | 'danger';
export type CreditMode = 'cloud' | 'selfhosted' | 'paused';

export interface MeterState {
  /** 0..1 of the cloud cap used today. */
  ratio: number;
  tone: MeterTone;
  mode: CreditMode;
  /** "312 / 500" */
  value: string;
  /** Screen-reader sentence. */
  description: string;
}

export function meterState(credits: Credits): MeterState {
  const cap = Math.max(0, credits.cap);
  const used = Math.max(0, credits.cloudUsedToday);
  const ratio = cap === 0 ? 1 : Math.min(1, used / cap);
  const exhausted = cap === 0 || used >= cap;
  const mode: CreditMode =
    credits.backend === 'selfhosted' ? 'selfhosted' : exhausted ? 'paused' : 'cloud';
  const tone: MeterTone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'normal';
  const value = `${used.toLocaleString('en-IN')} / ${cap.toLocaleString('en-IN')}`;
  const description =
    mode === 'paused'
      ? `Crawl budget used up: ${value} credits today. Your crawled sources refresh after 00:00 IST.`
      : mode === 'selfhosted'
        ? `Cloud crawl budget ${value} credits today. Crawls run on the self-hosted standby.`
        : `${value} cloud crawl credits used today.`;
  return { ratio, tone, mode, value, description };
}

export type DisplayHealth = 'ok' | 'warning' | 'error' | 'paused' | 'pending';

export interface HealthInput {
  health: SourceHealth;
  kind: SourceKind;
  enabled: boolean;
  errorReason: string | null;
  /** Worker detail code (`ok`, `auth`, `notfound`, `blocked`, `paused:credits`, …); optional in the DTO. */
  healthCode?: string | null;
}

/** Only crawled sources spend credits; ATS/API/RSS keep working when the budget is gone. */
export function spendsCredits(kind: SourceKind): boolean {
  return kind === 'firecrawl';
}

const CREDIT_REASON = /credit|budget|quota|402/i;

export function displayHealth(source: HealthInput, mode: CreditMode | null): DisplayHealth {
  if (source.healthCode === 'paused:credits') return 'paused';
  if (source.errorReason && CREDIT_REASON.test(source.errorReason)) return 'paused';
  if (mode === 'paused' && spendsCredits(source.kind) && source.enabled) return 'paused';
  switch (source.health) {
    case 'healthy':
      return 'ok';
    case 'degraded':
      return 'warning';
    case 'failing':
      return 'error';
    case 'pending':
      return 'pending';
  }
}

export const HEALTH_LABELS: Record<DisplayHealth, string> = {
  ok: 'Healthy',
  warning: 'Slow',
  error: 'Failing',
  paused: 'Paused',
  pending: 'Checking…',
};

/** Tooltip / expanded-row reason for a status. */
export function healthReason(source: HealthInput, status: DisplayHealth): string {
  switch (status) {
    case 'paused':
      return "Today's crawl budget is used up. This source refreshes after 00:00 IST; shared packs keep updating.";
    case 'error':
      return source.errorReason ?? 'The last refresh failed.';
    case 'warning':
      return source.errorReason ?? 'Responding slowly or returning partial results.';
    case 'pending':
      return 'First check is queued. It usually finishes within a minute.';
    case 'ok':
      return 'Last refresh succeeded.';
  }
}

/** `data-health-code` for the row (worker code when known, else derived). */
export function healthCodeOf(source: HealthInput, status: DisplayHealth): string {
  if (source.healthCode) return source.healthCode;
  return status === 'paused' ? 'paused:credits' : status;
}

/** Sort weight so failing rows float to the top when sorting by health. */
export const HEALTH_ORDER: Record<DisplayHealth, number> = {
  error: 0,
  paused: 1,
  warning: 2,
  pending: 3,
  ok: 4,
};
