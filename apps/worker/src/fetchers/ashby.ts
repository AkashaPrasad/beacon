import type { PayPeriod } from '@kestrel/shared';

import { SourceError } from '../lib/errors.js';
import { htmlToMarkdown, plainToMarkdown } from '../lib/html.js';
import { httpJson } from '../lib/http.js';

import { buildAll, type RawListing } from './build.js';
import { emptyResult, type Fetcher } from './types.js';
import { boardTokenOf, companyOf, rethrowNotFound } from './util.js';

interface AshbyCompComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string;
  minValue?: number | null;
  maxValue?: number | null;
}
interface AshbyJob {
  id: string;
  title: string;
  location?: string | null;
  secondaryLocations?: { location?: string | null }[];
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  department?: string | null;
  team?: string | null;
  publishedAt?: string | null;
  jobUrl: string;
  applyUrl?: string;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  address?: { postalAddress?: { addressCountry?: string | null; addressLocality?: string | null } } | null;
  compensation?: { summaryComponents?: AshbyCompComponent[] } | null;
}
interface AshbyResponse {
  jobs?: AshbyJob[];
  apiVersion?: string;
}

export function ashbyUrl(board: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
}

const INTERVALS: Record<string, PayPeriod> = {
  '1 YEAR': 'year',
  '1 MONTH': 'month',
  '1 WEEK': 'week',
  '1 DAY': 'day',
  '1 HOUR': 'hour',
  ONE_TIME: 'total',
};

function salary(job: AshbyJob): RawListing['stipend'] {
  const c = job.compensation?.summaryComponents?.find((s) => s.compensationType === 'Salary' && (s.minValue || s.maxValue));
  if (!c) return null;
  return { min: c.minValue ?? null, max: c.maxValue ?? null, currency: c.currencyCode ?? null, period: INTERVALS[c.interval ?? ''] ?? null };
}

export function mapAshbyJob(job: AshbyJob, company: string): RawListing {
  const wt = (job.workplaceType ?? '').toLowerCase();
  return {
    externalId: job.id,
    title: job.title,
    company,
    applyUrl: job.jobUrl,
    descriptionMd: job.descriptionHtml ? htmlToMarkdown(job.descriptionHtml) : plainToMarkdown(job.descriptionPlain),
    locations: [job.location, ...(job.secondaryLocations ?? []).map((s) => s.location)],
    remote: wt === 'remote' ? 'remote' : wt === 'hybrid' ? 'hybrid' : wt === 'onsite' ? 'onsite' : (job.isRemote ?? null),
    country: job.address?.postalAddress?.addressCountry ?? null,
    postedAt: job.publishedAt ?? null,
    typeHints: [job.employmentType, job.department, job.team],
    stipend: salary(job),
    structured: true,
  };
}

/** Ashby posting API (`includeCompensation=true`); unlisted jobs are skipped. */
export const fetchAshby: Fetcher = async (source, ctx) => {
  const board = boardTokenOf(source);
  const url = ashbyUrl(board);
  const { data, res } = await httpJson<AshbyResponse>(url, { etag: source.etag, lastModified: source.lastModified }).catch(
    (err: unknown) => rethrowNotFound(err, `Ashby board "${board}"`),
  );
  if (res.notModified) return emptyResult({ notModified: true, etag: source.etag ?? null, lastModified: source.lastModified ?? null });
  if (!data || !Array.isArray(data.jobs)) throw new SourceError('parse', 'Ashby response has no jobs[]', { url });
  const company = companyOf(source);
  const listed = data.jobs.filter((j) => j.isListed !== false);
  const { listings, warnings } = buildAll(listed.map((j) => mapAshbyJob(j, company)), source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, etag: res.etag, lastModified: res.lastModified, totalReported: listed.length });
};
