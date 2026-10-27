import type { ListingDraft, OpportunityType, SourceKind } from '@kestrel/shared';

import type { CrawlerClient } from '../crawl/client.js';
import type { Logger } from '../logger.js';

/**
 * A fetched + normalised listing (shared `ListingDraft` shape, validated) without the
 * fields ingest derives: source id, keys, timestamps, ghost risk, embedding.
 */
export type NormalisedListing = Omit<
  ListingDraft,
  | 'sourceId'
  | 'embedding'
  | 'canonicalKey'
  | 'contentHash'
  | 'firstSeenAt'
  | 'lastSeenAt'
  | 'seenCount'
  | 'ghostRisk'
  | 'archived'
> & {
  /** Stable id inside the source (ATS job id, API id, or the detail URL for crawls). */
  externalId: string;
  /** True when the source returned structured fields: extraction stays deterministic. */
  structured: boolean;
  /** Optional change marker (SmartRecruiters releasedDate, Workday postedOn) for detail diffs. */
  version?: string | null;
};

/** The subset of a source document the fetchers need. */
export interface FetchSource {
  id: string;
  url: string;
  name: string;
  kind: SourceKind;
  typeTag: OpportunityType | null;
  ownerId: string | null;
  config: {
    boardToken?: string | null;
    feedUrl?: string | null;
    provider?: string | null;
    [extra: string]: unknown;
  };
  companyDomain?: string | null;
  country?: string | null;
  etag?: string | null;
  lastModified?: string | null;
}

export interface FetchContext {
  now: Date;
  logger: Logger;
  /** Required for kind=firecrawl. */
  crawler?: CrawlerClient;
  /**
   * Listings this source already has, keyed by externalId → version marker. Fetchers
   * that need a per-posting detail call (SmartRecruiters, Workday, Firecrawl) only
   * fetch details for new or changed ids.
   */
  known?: ReadonlyMap<string, { version: string | null; descriptionMd: string }>;
  /** Max listings to return (size cap). */
  maxItems?: number;
  /** Max per-posting detail requests in one run. */
  maxDetailCalls?: number;
  /** Delay between detail requests to the same host (politeness). */
  detailDelayMs?: number;
  /**
   * Server-LLM extraction of listing items from page markdown, used when the crawl came
   * back without Firecrawl JSON (standby). Null result = no LLM available.
   */
  extractIndex?: (markdown: string, pageUrl: string) => Promise<CrawlIndexItem[] | null>;
  /** Adzuna keys etc. */
  keys?: { adzunaAppId?: string; adzunaAppKey?: string };
}

/** One opportunity found on a crawled index page (Firecrawl JSON or server LLM). */
export interface CrawlIndexItem {
  title: string;
  company?: string | null;
  url?: string | null;
  location?: string | null;
  remote?: boolean | null;
  type?: string | null;
  deadline?: string | null;
  stipend?: string | null;
  postedDate?: string | null;
  summary?: string | null;
  skills?: string[] | null;
  eligibility?: string | null;
}

export interface FetchResult {
  listings: NormalisedListing[];
  /** 304 on the conditional request: nothing changed since `etag`/`lastModified`. */
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
  /** Count the endpoint reported (Greenhouse meta.total, SR totalFound, Workday total). */
  totalReported: number | null;
  /** Non-fatal problems (skipped items, truncated pages). */
  warnings: string[];
  /** Crawl backend and credits spent (firecrawl only). */
  backend?: 'cloud' | 'selfhosted' | null;
  creditsUsed?: number;
}

export type Fetcher = (source: FetchSource, ctx: FetchContext) => Promise<FetchResult>;

export function emptyResult(partial: Partial<FetchResult> = {}): FetchResult {
  return {
    listings: [],
    notModified: false,
    etag: null,
    lastModified: null,
    totalReported: null,
    warnings: [],
    ...partial,
  };
}
