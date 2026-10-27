import { SourceError } from '../lib/errors.js';

export type ScrapeFormat = 'markdown' | 'html' | 'links' | { type: 'json'; schema: Record<string, unknown>; prompt?: string };

export interface ScrapeRequest {
  url: string;
  formats: ScrapeFormat[];
  onlyMainContent?: boolean;
  /** Firecrawl-side timeout (ms). */
  timeout?: number;
  waitFor?: number;
}

export interface ScrapeData {
  markdown?: string;
  html?: string;
  links?: string[];
  json?: unknown;
  metadata?: { title?: string; sourceURL?: string; url?: string; statusCode?: number; creditsUsed?: number; [k: string]: unknown };
}

/** Thrown on HTTP 402: the cloud account is out of credits. */
export class PaymentRequiredError extends Error {
  override readonly name = 'PaymentRequiredError';
}

export interface CrawlBackend {
  readonly name: 'cloud' | 'selfhosted';
  scrape(req: ScrapeRequest): Promise<ScrapeData>;
}

/** Credits a cloud scrape costs (Firecrawl pricing: 1 per page, +4 for JSON extraction). */
export function estimateCredits(formats: readonly ScrapeFormat[]): number {
  return 1 + (formats.some((f) => typeof f === 'object' && f.type === 'json') ? 4 : 0);
}

/**
 * Firecrawl REST (`POST {base}/v2/scrape`). The cloud sends a bearer key; the
 * self-hosted standby uses the same shape without auth.
 */
export class FirecrawlHttpBackend implements CrawlBackend {
  constructor(
    readonly name: 'cloud' | 'selfhosted',
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 90_000,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (this.apiKey) h.authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async scrape(req: ScrapeRequest): Promise<ScrapeData> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v2/scrape`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ onlyMainContent: true, timeout: 60_000, ...req }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new SourceError('network', `Firecrawl ${this.name} request failed: ${err instanceof Error ? err.message : String(err)}`, { url: req.url });
    }
    const text = await res.text();
    if (res.status === 402) throw new PaymentRequiredError(`Firecrawl ${this.name}: 402 payment required`);
    if (res.status === 401 || res.status === 403) throw new SourceError('auth', `Firecrawl ${this.name}: HTTP ${res.status}`, { status: res.status });
    if (res.status === 429) throw new SourceError('ratelimited', `Firecrawl ${this.name}: rate limited`, { status: 429 });
    if (res.status >= 500) throw new SourceError('network', `Firecrawl ${this.name}: HTTP ${res.status}`, { status: res.status, url: req.url });
    let body: { success?: boolean; data?: ScrapeData; error?: string };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new SourceError('parse', `Firecrawl ${this.name}: invalid JSON (HTTP ${res.status})`, { status: res.status });
    }
    if (!res.ok || body.success === false || !body.data) {
      throw new SourceError('parse', `Firecrawl ${this.name}: ${body.error ?? `HTTP ${res.status}`}`.slice(0, 300), { status: res.status, url: req.url });
    }
    const status = body.data.metadata?.statusCode;
    if (status === 404 || status === 410) throw new SourceError('notfound', `Page returned ${status}`, { status, url: req.url });
    return body.data;
  }

  /** Cloud only: `GET /v2/team/credit-usage` → remaining credits in the billing period. */
  async remainingCredits(): Promise<number | null> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v2/team/credit-usage`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { remainingCredits?: number; remaining_credits?: number } };
    const remaining = body.data?.remainingCredits ?? body.data?.remaining_credits;
    return typeof remaining === 'number' ? remaining : null;
  }
}
