
import { buildAll, type RawListing } from './build.js';
import { detectSourceKind } from './detect.js';
import { emptyResult, type FetchContext, type Fetcher, type FetchSource } from './types.js';
import { companyOf, rethrowNotFound, str } from './util.js';
import { parseRelativePosted } from '../lib/dates.js';
import { SourceError } from '../lib/errors.js';
import { htmlToMarkdown } from '../lib/html.js';
import { httpJson, sleep } from '../lib/http.js';

interface WdListItem {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}
interface WdList {
  total?: number;
  jobPostings?: WdListItem[];
}
interface WdDetail {
  jobPostingInfo?: {
    id?: string;
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    postedOn?: string;
    startDate?: string;
    timeType?: string;
    jobReqId?: string;
    externalUrl?: string;
    country?: { descriptor?: string; alpha2Code?: string };
    jobRequisitionLocation?: { country?: { alpha2Code?: string } };
  };
  hiringOrganization?: { name?: string };
}

export interface WorkdayTarget {
  tenant: string;
  wdHost: string;
  site: string;
  base: string;
}

const PAGE = 20;
const MAX_POSTINGS = 200;

export function workdayTarget(source: FetchSource): WorkdayTarget {
  const cfg = source.config;
  let tenant = str(cfg.tenant);
  let wdHost = str(cfg.wdHost);
  let site = str(cfg.site);
  if (!tenant || !wdHost || !site) {
    const detected = detectSourceKind(str(cfg.feedUrl) ?? source.url).workday ?? detectSourceKind(source.url).workday;
    tenant ??= detected?.tenant ?? null;
    wdHost ??= detected?.wdHost ?? null;
    site ??= detected?.site ?? null;
  }
  if (!tenant || !wdHost || !site) throw new SourceError('notfound', `Cannot derive Workday tenant/site from ${source.url}`);
  return { tenant, wdHost, site, base: `https://${tenant}.${wdHost}.myworkdayjobs.com` };
}

export const workdayListUrl = (t: WorkdayTarget) => `${t.base}/wday/cxs/${t.tenant}/${t.site}/jobs`;
export const workdayDetailUrl = (t: WorkdayTarget, externalPath: string) => `${t.base}/wday/cxs/${t.tenant}/${t.site}${externalPath}`;

function mapWorkday(item: WdListItem, t: WorkdayTarget, company: string, detail: WdDetail | null, knownDescription: string, now: Date): RawListing {
  const info = detail?.jobPostingInfo;
  const multi = /^\d+\s+locations?$/i.test(item.locationsText ?? '');
  const locations = info ? [info.location, ...(info.additionalLocations ?? [])] : multi ? [] : [item.locationsText];
  return {
    externalId: item.bulletFields?.[0] ?? item.externalPath,
    title: info?.title ?? item.title,
    company,
    applyUrl: info?.externalUrl ?? `${t.base}/${t.site}${item.externalPath}`,
    descriptionMd: info?.jobDescription ? htmlToMarkdown(info.jobDescription) : knownDescription,
    locations,
    country: info?.jobRequisitionLocation?.country?.alpha2Code ?? info?.country?.alpha2Code ?? null,
    postedAt: info?.startDate ?? parseRelativePosted(info?.postedOn ?? item.postedOn, now),
    typeHints: [info?.timeType],
    structured: true,
    // Without the detail the list item has no description and only "N Locations".
    partial: !detail && Boolean(knownDescription),
  };
}

/**
 * Workday CXS API: POST `/wday/cxs/<tenant>/<site>/jobs` paged by 20 up to 200 postings;
 * the description needs a detail GET per posting (only for new ids). "Posted N Days
 * Ago" becomes an approximate date when the detail has no startDate.
 */
export const fetchWorkday: Fetcher = async (source, ctx: FetchContext) => {
  const t = workdayTarget(source);
  const listUrl = workdayListUrl(t);
  const searchText = str(source.config.searchText) ?? '';
  const max = Math.min(ctx.maxItems ?? MAX_POSTINGS, MAX_POSTINGS);
  const items: WdListItem[] = [];
  let total: number | null = null;
  for (let offset = 0; offset < max; offset += PAGE) {
    const { data } = await httpJson<WdList>(listUrl, {
      method: 'POST',
      body: { appliedFacets: {}, limit: PAGE, offset, searchText },
    }).catch((err: unknown) => rethrowNotFound(err, `Workday site ${t.tenant}/${t.site}`));
    if (!data || !Array.isArray(data.jobPostings)) throw new SourceError('parse', 'Workday response has no jobPostings[]', { url: listUrl });
    // Workday reports `total` on the first page only (later pages say 0).
    if (offset === 0) total = data.total ?? data.jobPostings.length;
    items.push(...data.jobPostings);
    if (data.jobPostings.length < PAGE || items.length >= (total ?? 0)) break;
    if (ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
  }

  const company = companyOf(source);
  const warnings: string[] = [];
  const maxDetail = ctx.maxDetailCalls ?? 50;
  let detailCalls = 0;
  const raws: RawListing[] = [];
  for (const item of items.slice(0, max)) {
    const id = item.bulletFields?.[0] ?? item.externalPath;
    const known = ctx.known?.get(id);
    let detail: WdDetail | null = null;
    if ((!known || !known.descriptionMd) && detailCalls < maxDetail) {
      if (detailCalls > 0 && ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
      detailCalls++;
      detail = await httpJson<WdDetail>(workdayDetailUrl(t, item.externalPath), { maxBytes: 2 * 1024 * 1024 })
        .then((r) => r.data)
        .catch((err: unknown) => {
          warnings.push(`detail ${id}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        });
    }
    raws.push(mapWorkday(item, t, company, detail, known?.descriptionMd ?? '', ctx.now));
  }
  const built = buildAll(raws, source, ctx.now, max);
  return emptyResult({ listings: built.listings, warnings: [...warnings, ...built.warnings], totalReported: total });
};
