import { buildAll, type RawListing } from './build.js';
import { emptyResult, type Fetcher } from './types.js';
import { boardTokenOf, companyOf, rethrowNotFound } from './util.js';
import { SourceError } from '../lib/errors.js';
import { htmlToMarkdown } from '../lib/html.js';
import { httpJson } from '../lib/http.js';


interface WorkableJob {
  title: string;
  shortcode: string;
  employment_type?: string | null;
  telecommuting?: boolean;
  department?: string | null;
  url: string;
  application_url?: string;
  published_on?: string | null;
  created_at?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  experience?: string | null;
  education?: string | null;
  function?: string | null;
  locations?: { country?: string | null; countryCode?: string | null; city?: string | null; region?: string | null; hidden?: boolean }[];
  description?: string | null;
}
interface WorkableResponse {
  name?: string;
  jobs?: WorkableJob[];
}

export function workableUrl(slug: string): string {
  return `https://www.workable.com/api/accounts/${encodeURIComponent(slug)}?details=true`;
}

export function mapWorkableJob(job: WorkableJob, company: string): RawListing {
  const locs = (job.locations ?? []).filter((l) => !l.hidden).map((l) => [l.city, l.region, l.country].filter(Boolean).join(', '));
  if (locs.length === 0) locs.push([job.city, job.state, job.country].filter(Boolean).join(', '));
  return {
    externalId: job.shortcode,
    title: job.title,
    company,
    applyUrl: job.url,
    descriptionMd: htmlToMarkdown(job.description),
    locations: locs,
    remote: job.telecommuting ?? null,
    country: job.locations?.[0]?.countryCode ?? job.country ?? null,
    postedAt: job.published_on ?? job.created_at ?? null,
    typeHints: [job.employment_type, job.experience, job.function, job.department],
    structured: true,
  };
}

/** Workable public widget API (`?details=true` includes the full description). */
export const fetchWorkable: Fetcher = async (source, ctx) => {
  const slug = boardTokenOf(source);
  const url = workableUrl(slug);
  const { data, res } = await httpJson<WorkableResponse>(url, { etag: source.etag, lastModified: source.lastModified }).catch(
    (err: unknown) => rethrowNotFound(err, `Workable account "${slug}"`),
  );
  if (res.notModified) return emptyResult({ notModified: true, etag: source.etag ?? null, lastModified: source.lastModified ?? null });
  if (!data || !Array.isArray(data.jobs)) throw new SourceError('parse', 'Workable response has no jobs[]', { url });
  const company = companyOf(source, data.name);
  const { listings, warnings } = buildAll(data.jobs.map((j) => mapWorkableJob(j, company)), source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, etag: res.etag, lastModified: res.lastModified, totalReported: data.jobs.length });
};
