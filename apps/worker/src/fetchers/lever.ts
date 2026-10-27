import type { PayPeriod } from '@kestrel/shared';

import { SourceError } from '../lib/errors.js';
import { htmlToMarkdown, plainToMarkdown } from '../lib/html.js';
import { httpJson } from '../lib/http.js';

import { buildAll, type RawListing } from './build.js';
import { emptyResult, type Fetcher, type FetchSource } from './types.js';
import { boardTokenOf, companyOf, rethrowNotFound } from './util.js';

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string | null;
  workplaceType?: string | null;
  categories?: { commitment?: string; department?: string; location?: string; team?: string; allLocations?: string[] };
  description?: string;
  descriptionPlain?: string;
  lists?: { text?: string; content?: string }[];
  additional?: string;
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } | null;
}

const MOVED = /\b(we('ve| have)? moved|we are moving|moved (our|to)|new careers? (page|site|portal)|no longer (use|using|accepting)|visit our new|apply (via|on) our (new )?(careers|website))\b/i;

export function leverApiUrl(source: FetchSource, token: string): string {
  const eu = /(^|\.)eu\.lever\.co$/.test(new URL(source.url).hostname);
  return `https://api${eu ? '.eu' : ''}.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
}

function leverDescription(p: LeverPosting): string {
  const parts: string[] = [];
  const main = p.description ? htmlToMarkdown(p.description) : plainToMarkdown(p.descriptionPlain);
  if (main) parts.push(main);
  for (const list of p.lists ?? []) {
    const body = htmlToMarkdown(list.content);
    if (!body) continue;
    parts.push(list.text?.trim() ? `### ${list.text.trim()}\n\n${body}` : body);
  }
  const extra = p.additional ? htmlToMarkdown(p.additional) : plainToMarkdown(p.additionalPlain);
  if (extra) parts.push(extra);
  return parts.join('\n\n');
}

const INTERVALS: Record<string, PayPeriod> = {
  'per-year-salary': 'year',
  'per-month-salary': 'month',
  'per-week-salary': 'week',
  'per-day-wage': 'day',
  'per-hour-wage': 'hour',
  'one-time': 'total',
};

export function mapLeverPosting(p: LeverPosting, company: string): RawListing {
  const cat = p.categories ?? {};
  const workplace = (p.workplaceType ?? '').toLowerCase();
  const sr = p.salaryRange;
  return {
    externalId: p.id,
    title: p.text,
    company,
    applyUrl: p.hostedUrl,
    descriptionMd: leverDescription(p),
    locations: cat.allLocations?.length ? cat.allLocations : [cat.location],
    remote: workplace === 'remote' ? 'remote' : workplace === 'hybrid' ? 'hybrid' : workplace === 'onsite' ? 'onsite' : null,
    country: p.country ?? null,
    postedAt: p.createdAt ?? null,
    typeHints: [cat.commitment, cat.team, cat.department],
    stipend:
      sr && (sr.min || sr.max)
        ? { min: sr.min ?? null, max: sr.max ?? null, currency: sr.currency ?? null, period: INTERVALS[sr.interval ?? ''] ?? null }
        : null,
    structured: true,
  };
}

/** Lever Postings API (`mode=json`, bare array). Detects one-posting "we moved" stub boards. */
export const fetchLever: Fetcher = async (source, ctx) => {
  const token = boardTokenOf(source);
  const url = leverApiUrl(source, token);
  const { data, res } = await httpJson<LeverPosting[]>(url, { etag: source.etag, lastModified: source.lastModified }).catch(
    (err: unknown) => rethrowNotFound(err, `Lever board "${token}"`),
  );
  if (res.notModified) return emptyResult({ notModified: true, etag: source.etag ?? null, lastModified: source.lastModified ?? null });
  if (!Array.isArray(data)) throw new SourceError('parse', 'Lever response is not an array', { url });
  if (data.length === 1 && data[0] && MOVED.test(`${data[0].text}\n${data[0].descriptionPlain ?? ''}\n${leverDescription(data[0])}`)) {
    throw new SourceError('notfound', `Lever board "${token}" is a "we moved" stub; the company now hires elsewhere`, { url });
  }
  const company = companyOf(source);
  const { listings, warnings } = buildAll(data.map((p) => mapLeverPosting(p, company)), source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, etag: res.etag, lastModified: res.lastModified, totalReported: data.length });
};
