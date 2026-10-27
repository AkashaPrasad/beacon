import { normaliseCompany } from '@kestrel/shared';

import { buildAll, type RawListing } from './build.js';
import { emptyResult, type FetchContext, type Fetcher } from './types.js';
import { boardTokenOf, companyOf, rethrowNotFound } from './util.js';
import { SourceError } from '../lib/errors.js';
import { htmlToMarkdown } from '../lib/html.js';
import { httpJson, sleep } from '../lib/http.js';


interface SrLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  fullLocation?: string;
}
interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: SrLocation;
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
  department?: { label?: string };
  function?: { label?: string };
}
interface SrList {
  offset: number;
  limit: number;
  totalFound: number;
  content: SrPosting[];
}
interface SrDetail extends SrPosting {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> };
}

const PAGE = 100;
const SECTION_ORDER = ['jobDescription', 'qualifications', 'additionalInformation', 'companyDescription'];

export const smartRecruitersListUrl = (company: string, offset: number) =>
  `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=${PAGE}&offset=${offset}`;
export const smartRecruitersDetailUrl = (company: string, id: string) =>
  `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(id)}`;

function detailMarkdown(d: SrDetail): string {
  const sections = d.jobAd?.sections ?? {};
  return SECTION_ORDER.map((k) => sections[k])
    .filter((s): s is { title?: string; text?: string } => Boolean(s?.text))
    .map((s) => `### ${s.title ?? ''}\n\n${htmlToMarkdown(s.text)}`.trim())
    .join('\n\n');
}

export function mapSrPosting(p: SrPosting, company: string, companyId: string, detail: SrDetail | null, knownDescription: string): RawListing {
  const loc = p.location ?? {};
  const fallbackUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(p.company?.identifier ?? companyId)}/${encodeURIComponent(p.id)}`;
  return {
    externalId: p.id,
    title: p.name,
    company,
    applyUrl: detail?.postingUrl ?? fallbackUrl,
    descriptionMd: detail ? detailMarkdown(detail) : knownDescription,
    locations: [loc.fullLocation ?? [loc.city, loc.region, loc.country].filter(Boolean).join(', ')],
    remote: loc.remote ? 'remote' : loc.hybrid ? 'hybrid' : false,
    country: loc.country ?? null,
    postedAt: p.releasedDate ?? null,
    typeHints: [p.typeOfEmployment?.label, p.experienceLevel?.label, p.function?.label],
    version: p.releasedDate ?? null,
    structured: true,
  };
}

async function fetchDetail(companyId: string, id: string): Promise<SrDetail | null> {
  const { data } = await httpJson<SrDetail>(smartRecruitersDetailUrl(companyId, id), { maxBytes: 2 * 1024 * 1024 });
  return data;
}

/**
 * SmartRecruiters Posting API. The list has no description, so a detail call is made
 * per posting — only for postings that are new or whose `releasedDate` changed.
 * Unknown company ids return 200 with totalFound=0, which is treated as not found.
 */
export const fetchSmartRecruiters: Fetcher = async (source, ctx: FetchContext) => {
  const companyId = boardTokenOf(source);
  const maxItems = ctx.maxItems ?? 1_000;
  const postings: SrPosting[] = [];
  let totalFound = 0;
  for (let offset = 0; offset < Math.min(maxItems, 2_000); offset += PAGE) {
    const url = smartRecruitersListUrl(companyId, offset);
    const { data } = await httpJson<SrList>(url).catch((err: unknown) => rethrowNotFound(err, `SmartRecruiters company "${companyId}"`));
    if (!data || !Array.isArray(data.content)) throw new SourceError('parse', 'SmartRecruiters response has no content[]', { url });
    totalFound = data.totalFound;
    postings.push(...data.content);
    if (data.content.length < PAGE || postings.length >= totalFound) break;
  }
  if (totalFound === 0) {
    throw new SourceError('notfound', `SmartRecruiters company "${companyId}" has no public postings (unknown id?)`);
  }
  const warnings: string[] = [];
  const company = companyOf(source);
  const reported = postings[0]?.company?.name;
  if (reported && !normaliseCompany(reported).includes(normaliseCompany(company).split(' ')[0] ?? '')) {
    warnings.push(`company name mismatch: board reports "${reported}"`);
  }

  const maxDetail = ctx.maxDetailCalls ?? 50;
  let detailCalls = 0;
  const raws: RawListing[] = [];
  for (const p of postings.slice(0, maxItems)) {
    const known = ctx.known?.get(p.id);
    const needsDetail = !known || known.version !== (p.releasedDate ?? null) || !known.descriptionMd;
    let detail: SrDetail | null = null;
    if (needsDetail && detailCalls < maxDetail) {
      if (detailCalls > 0 && ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
      detailCalls++;
      detail = await fetchDetail(companyId, p.id).catch((err: unknown) => {
        warnings.push(`detail ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });
    } else if (needsDetail) {
      warnings.push(`detail cap reached; ${p.id} queued for next run`);
    }
    raws.push(mapSrPosting(p, company, companyId, detail, known?.descriptionMd ?? ''));
  }
  const built = buildAll(raws, source, ctx.now, maxItems);
  return emptyResult({ listings: built.listings, warnings: [...warnings, ...built.warnings], totalReported: totalFound });
};
