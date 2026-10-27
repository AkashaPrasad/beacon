import type { SourceKind } from '@kestrel/shared';

import { SourceError } from '../lib/errors.js';

import { fetchAshby } from './ashby.js';
import { fetchFirecrawl, fetchSitemap } from './firecrawl.js';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchPublicApi } from './publicapi/index.js';
import { fetchRss } from './rss.js';
import { fetchSmartRecruiters } from './smartrecruiters.js';
import type { Fetcher } from './types.js';
import { fetchWorkable } from './workable.js';
import { fetchWorkday } from './workday.js';

const fetchJobspy: Fetcher = () =>
  Promise.reject(new SourceError('parse', 'JobSpy (LinkedIn/Indeed) sources are opt-in and not enabled in this deployment'));

export const FETCHERS: Readonly<Record<SourceKind, Fetcher>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
  workable: fetchWorkable,
  workday: fetchWorkday,
  publicapi: fetchPublicApi,
  rss: fetchRss,
  sitemap: fetchSitemap,
  firecrawl: fetchFirecrawl,
  jobspy: fetchJobspy,
};

/** Kinds that spend crawl credits (and so can be paused by the credit meter). */
export const CRAWL_KINDS: ReadonlySet<SourceKind> = new Set(['firecrawl', 'sitemap']);

export function fetcherFor(kind: SourceKind): Fetcher {
  const fetcher = FETCHERS[kind];
  if (!fetcher) throw new SourceError('parse', `No fetcher for source kind "${String(kind)}"`);
  return fetcher;
}

export type { CrawlIndexItem, FetchContext, FetchResult, FetchSource, NormalisedListing } from './types.js';
export { detectSourceKind } from './detect.js';
