import type { PayPeriod } from '@kestrel/shared';

import { SourceError } from '../../lib/errors.js';
import { htmlToMarkdown, plainToMarkdown, stripTags } from '../../lib/html.js';
import { httpJson, sleep } from '../../lib/http.js';
import { buildAll, type RawListing } from '../build.js';
import { emptyResult, type FetchContext, type FetchResult, type FetchSource } from '../types.js';

type ProviderFetcher = (source: FetchSource, ctx: FetchContext, feedUrl: string) => Promise<FetchResult>;

const withParam = (url: string, key: string, value: string | number) => {
  const u = new URL(url);
  u.searchParams.set(key, String(value));
  return u.toString();
};

function result(raws: RawListing[], source: FetchSource, ctx: FetchContext, extra: Partial<FetchResult> = {}): FetchResult {
  const { listings, warnings } = buildAll(raws, source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, totalReported: raws.length, ...extra });
}

// ── Remotive ─────────────────────────────────────────────────────────────────────────
interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}
export const fetchRemotive: ProviderFetcher = async (source, ctx, feedUrl) => {
  const { data, res } = await httpJson<{ jobs?: RemotiveJob[] }>(feedUrl, { etag: source.etag, lastModified: source.lastModified });
  if (res.notModified) return emptyResult({ notModified: true, etag: source.etag ?? null, lastModified: source.lastModified ?? null });
  if (!Array.isArray(data?.jobs)) throw new SourceError('parse', 'Remotive response has no jobs[]', { url: feedUrl });
  const raws = data.jobs.map(
    (j): RawListing => ({
      externalId: j.id,
      title: j.title,
      company: j.company_name,
      applyUrl: j.url,
      descriptionMd: htmlToMarkdown(j.description),
      locations: [j.candidate_required_location],
      remote: 'remote',
      // publication_date has no zone; Remotive serves UTC.
      postedAt: j.publication_date ? `${j.publication_date}${/[zZ]|[+-]\d\d:?\d\d$/.test(j.publication_date) ? '' : 'Z'}` : null,
      typeHints: [j.job_type, j.category],
      stipendText: j.salary ?? null,
      stipendDefaultCurrency: 'USD',
      skills: j.tags ?? [],
    }),
  );
  return result(raws, source, ctx, { etag: res.etag, lastModified: res.lastModified });
};

// ── Arbeitnow ────────────────────────────────────────────────────────────────────────
interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}
export const fetchArbeitnow: ProviderFetcher = async (source, ctx, feedUrl) => {
  const { data } = await httpJson<{ data?: ArbeitnowJob[] }>(feedUrl);
  if (!Array.isArray(data?.data)) throw new SourceError('parse', 'Arbeitnow response has no data[]', { url: feedUrl });
  const raws = data.data.map(
    (j): RawListing => ({
      externalId: j.slug,
      title: j.title,
      company: j.company_name,
      applyUrl: j.url,
      descriptionMd: htmlToMarkdown(j.description),
      locations: [j.location],
      remote: j.remote ?? null,
      postedAt: j.created_at ?? null,
      typeHints: j.job_types ?? [],
      skills: j.tags ?? [],
    }),
  );
  return result(raws, source, ctx);
};

// ── RemoteOK ─────────────────────────────────────────────────────────────────────────
interface RemoteOkJob {
  id?: string;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  date?: string;
  description?: string;
  salary_min?: number | string;
  salary_max?: number | string;
  tags?: string[];
  legal?: string;
}
export const fetchRemoteOk: ProviderFetcher = async (source, ctx, feedUrl) => {
  const { data } = await httpJson<RemoteOkJob[]>(feedUrl, { headers: { accept: 'application/json' } });
  if (!Array.isArray(data)) throw new SourceError('parse', 'RemoteOK response is not an array', { url: feedUrl });
  // Element 0 is the legal notice, not a job.
  const jobs = data.filter((j) => j.id && j.position && !j.legal);
  const raws = jobs.map((j): RawListing => {
    const min = Number(j.salary_min) || null;
    const max = Number(j.salary_max) || null;
    return {
      externalId: j.id ?? '',
      title: j.position,
      company: j.company,
      applyUrl: j.url ?? j.apply_url,
      descriptionMd: htmlToMarkdown(j.description),
      locations: [j.location],
      remote: 'remote',
      postedAt: j.date ?? null,
      stipend: min || max ? { min, max, currency: 'USD', period: 'year' } : null,
      skills: j.tags ?? [],
    };
  });
  return result(raws, source, ctx);
};

// ── Jobicy ───────────────────────────────────────────────────────────────────────────
interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobIndustry?: string[];
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}
const JOBICY_PERIODS: Record<string, PayPeriod> = { yearly: 'year', monthly: 'month', weekly: 'week', daily: 'day', hourly: 'hour' };
export const fetchJobicy: ProviderFetcher = async (source, ctx, feedUrl) => {
  const { data } = await httpJson<{ jobs?: JobicyJob[] }>(feedUrl);
  if (!Array.isArray(data?.jobs)) throw new SourceError('parse', 'Jobicy response has no jobs[]', { url: feedUrl });
  const raws = data.jobs.map(
    (j): RawListing => ({
      externalId: j.id,
      title: stripTags(j.jobTitle),
      company: stripTags(j.companyName),
      applyUrl: j.url,
      descriptionMd: j.jobDescription ? htmlToMarkdown(j.jobDescription) : plainToMarkdown(j.jobExcerpt),
      locations: (j.jobGeo ?? '').split(/\s*,\s*/),
      remote: 'remote',
      postedAt: j.pubDate ?? null,
      typeHints: [...(Array.isArray(j.jobType) ? j.jobType : [j.jobType]), j.jobLevel],
      stipend:
        j.salaryMin || j.salaryMax
          ? { min: j.salaryMin ?? null, max: j.salaryMax ?? null, currency: j.salaryCurrency ?? 'USD', period: JOBICY_PERIODS[j.salaryPeriod ?? ''] ?? 'year' }
          : null,
    }),
  );
  return result(raws, source, ctx);
};

// ── The Muse ─────────────────────────────────────────────────────────────────────────
interface MuseJob {
  id: number;
  name: string;
  contents?: string;
  publication_date?: string;
  locations?: { name: string }[];
  categories?: { name: string }[];
  levels?: { name: string }[];
  refs?: { landing_page?: string };
  company?: { name?: string };
}
interface MuseResponse {
  page: number;
  page_count: number;
  results?: MuseJob[];
}
export const fetchTheMuse: ProviderFetcher = async (source, ctx, feedUrl) => {
  const maxPages = Number(source.config.maxPages ?? 3);
  const jobs: MuseJob[] = [];
  let pageCount = 1;
  for (let page = Number(new URL(feedUrl).searchParams.get('page') ?? 1); page <= Math.min(pageCount, maxPages); page++) {
    const url = withParam(feedUrl, 'page', page);
    const { data } = await httpJson<MuseResponse>(url);
    if (!Array.isArray(data?.results)) throw new SourceError('parse', 'The Muse response has no results[]', { url });
    jobs.push(...data.results);
    pageCount = data.page_count;
    if (ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
  }
  const raws = jobs.map(
    (j): RawListing => ({
      externalId: j.id,
      title: j.name,
      company: j.company?.name,
      applyUrl: j.refs?.landing_page,
      descriptionMd: htmlToMarkdown(j.contents),
      locations: (j.locations ?? []).map((l) => l.name),
      postedAt: j.publication_date ?? null,
      typeHints: [...(j.levels ?? []).map((l) => l.name), ...(j.categories ?? []).map((c) => c.name)],
    }),
  );
  return result(raws, source, ctx);
};

// ── Adzuna (needs keys) ──────────────────────────────────────────────────────────────
interface AdzunaJob {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  redirect_url: string;
  created?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
  category?: { label?: string };
}
export const fetchAdzuna: ProviderFetcher = async (source, ctx, feedUrl) => {
  const appId = ctx.keys?.adzunaAppId;
  const appKey = ctx.keys?.adzunaAppKey;
  if (!appId || !appKey) throw new SourceError('auth', 'Adzuna keys are not configured (ADZUNA_APP_ID / ADZUNA_APP_KEY)');
  const u = new URL(feedUrl);
  u.searchParams.set('app_id', appId);
  u.searchParams.set('app_key', appKey);
  if (!u.searchParams.has('results_per_page')) u.searchParams.set('results_per_page', '50');
  if (!u.searchParams.has('what')) u.searchParams.set('what', 'intern');
  u.searchParams.set('content-type', 'application/json');
  const country = /\/jobs\/([a-z]{2})\//.exec(u.pathname)?.[1] ?? 'in';
  const { data } = await httpJson<{ results?: AdzunaJob[] }>(u.toString());
  if (!Array.isArray(data?.results)) throw new SourceError('parse', 'Adzuna response has no results[]');
  const raws = data.results.map(
    (j): RawListing => ({
      externalId: j.id,
      title: stripTags(j.title),
      company: j.company?.display_name,
      applyUrl: j.redirect_url,
      descriptionMd: plainToMarkdown(stripTags(j.description)),
      locations: [j.location?.display_name],
      country,
      postedAt: j.created ?? null,
      typeHints: [j.contract_time, j.contract_type, j.category?.label],
      stipend:
        j.salary_min || j.salary_max
          ? { min: j.salary_min ?? null, max: j.salary_max ?? null, currency: country === 'in' ? 'INR' : null, period: 'year' }
          : null,
    }),
  );
  return result(raws, source, ctx);
};
