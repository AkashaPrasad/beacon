import { buildAll, type RawListing } from './build.js';
import { emptyResult, type Fetcher } from './types.js';
import { asArray, boardTokenOf, companyOf, rethrowNotFound, str } from './util.js';
import { SourceError } from '../lib/errors.js';
import { escapedHtmlToMarkdown } from '../lib/html.js';
import { httpJson } from '../lib/http.js';


interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string | null } | null;
  metadata?: { name: string; value: unknown; value_type?: string }[] | null;
  offices?: { name?: string | null; location?: string | null }[] | null;
  departments?: { name?: string | null }[] | null;
  updated_at?: string | null;
  first_published?: string | null;
  application_deadline?: string | null;
  content?: string | null;
}
interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
  meta?: { total?: number };
}

export function greenhouseUrl(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

function metadataValues(job: GreenhouseJob, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const m of job.metadata ?? []) {
    if (!pattern.test(m.name)) continue;
    for (const v of asArray(m.value as string | string[] | null)) if (typeof v === 'string' && v.trim()) out.push(v.trim());
  }
  return out;
}

export function mapGreenhouseJob(job: GreenhouseJob, company: string): RawListing {
  const locations = [
    ...(job.location?.name ?? '').split(/\s*;\s*/),
    ...metadataValues(job, /location/i),
    ...(job.offices ?? []).map((o) => o.location ?? null),
  ];
  return {
    externalId: job.id,
    title: job.title,
    company,
    applyUrl: job.absolute_url,
    descriptionMd: escapedHtmlToMarkdown(job.content),
    locations,
    postedAt: job.first_published ?? job.updated_at ?? null,
    deadlineAt: str(job.application_deadline),
    typeHints: [...metadataValues(job, /employment|job type|commitment|level/i), ...(job.departments ?? []).map((d) => d.name)],
    version: job.updated_at ?? null,
    structured: true,
  };
}

/** Greenhouse Job Board API (`?content=true`; content is entity-escaped HTML). A bad token is a 404. */
export const fetchGreenhouse: Fetcher = async (source, ctx) => {
  const token = boardTokenOf(source);
  const url = greenhouseUrl(token);
  const { data, res } = await httpJson<GreenhouseResponse>(url, { etag: source.etag, lastModified: source.lastModified }).catch(
    (err: unknown) => rethrowNotFound(err, `Greenhouse board "${token}"`),
  );
  if (res.notModified) return emptyResult({ notModified: true, etag: source.etag ?? null, lastModified: source.lastModified ?? null });
  if (!data || !Array.isArray(data.jobs)) throw new SourceError('parse', 'Greenhouse response has no jobs[]', { url });
  const fallbackCompany = data.jobs[0]?.company_name ?? null;
  const company = companyOf(source, fallbackCompany);
  const { listings, warnings } = buildAll(data.jobs.map((j) => mapGreenhouseJob(j, company)), source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, etag: res.etag, lastModified: res.lastModified, totalReported: data.meta?.total ?? data.jobs.length });
};
