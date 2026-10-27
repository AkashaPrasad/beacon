import { OPPORTUNITY_TYPES, type OpportunityType, tryNormaliseUrl } from '@kestrel/shared';

import { buildAll, type RawListing } from './build.js';
import { emptyResult, type CrawlIndexItem, type FetchContext, type Fetcher, type FetchSource } from './types.js';
import { companyOf, str } from './util.js';
import type { ScrapeFormat } from '../crawl/backend.js';
import type { CrawlerClient } from '../crawl/client.js';
import { SourceError } from '../lib/errors.js';
import { plainToMarkdown } from '../lib/html.js';
import { httpRequest } from '../lib/http.js';


/** JSON schema Firecrawl fills on an index or detail page (one call, +4 credits). */
export const LISTING_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    listings: {
      type: 'array',
      description: 'Every open opportunity (job, internship, hackathon, scholarship, fellowship, research or open-source program) on the page.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string', description: 'Organisation offering it' },
          url: { type: 'string', description: 'Absolute link to the detail or apply page' },
          location: { type: 'string' },
          remote: { type: 'boolean' },
          type: { type: 'string', enum: [...OPPORTUNITY_TYPES] },
          deadline: { type: 'string', description: 'Application deadline as written' },
          stipend: { type: 'string', description: 'Pay/stipend/prize as written' },
          postedDate: { type: 'string' },
          summary: { type: 'string', description: 'One or two sentences' },
          skills: { type: 'array', items: { type: 'string' } },
          eligibility: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  required: ['listings'],
} as const;

const EXTRACTION_PROMPT =
  'Extract the open opportunities listed on this page. Skip navigation, blog posts and closed or past items. Use absolute URLs.';

const DETAIL_MAX_CHARS = 30_000;
const JOBLIKE = /\b(job|jobs|career|careers|intern|internship|position|opening|vacanc|apply|hackathon|scholarship|fellowship|program|programme|role|opportunit)/i;

function crawlerOf(ctx: FetchContext): CrawlerClient {
  if (!ctx.crawler) throw new SourceError('credits', 'No crawler configured for this worker');
  return ctx.crawler;
}

function asType(value: string | null | undefined): OpportunityType | null {
  return value && (OPPORTUNITY_TYPES as readonly string[]).includes(value) ? (value as OpportunityType) : null;
}

/** Deterministic fallback when neither Firecrawl JSON nor an LLM is available: job-like markdown links. */
export function linksFromMarkdown(markdown: string, pageUrl: string): CrawlIndexItem[] {
  const out: CrawlIndexItem[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(/\[([^\]\n]{4,160})\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    const text = (m[1] ?? '').replace(/[*_`#]/g, '').trim();
    const href = m[2] ?? '';
    let abs: string;
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!JOBLIKE.test(`${text} ${abs}`) || /^(apply|learn more|read more|view all|see all|careers?|jobs?)$/i.test(text)) continue;
    if (seen.has(abs) || abs === pageUrl) continue;
    seen.add(abs);
    out.push({ title: text, url: abs });
  }
  return out.slice(0, 100);
}

function toRaw(item: CrawlIndexItem, source: FetchSource, pageUrl: string, description: string): RawListing {
  let url: string | null = null;
  if (item.url) {
    try {
      url = new URL(item.url, pageUrl).toString();
    } catch {
      url = null;
    }
  }
  const applyUrl = url ?? pageUrl;
  const externalId = url ? (tryNormaliseUrl(url) ?? url) : `${pageUrl}#${item.title.toLowerCase().replace(/\W+/g, '-').slice(0, 80)}`;
  const summary = item.summary ? plainToMarkdown(item.summary) : '';
  const extras = [item.eligibility ? `**Eligibility:** ${item.eligibility}` : '', item.stipend ? `**Stipend / prize:** ${item.stipend}` : '']
    .filter(Boolean)
    .join('\n\n');
  return {
    externalId,
    title: item.title,
    company: item.company || companyOf(source),
    applyUrl,
    descriptionMd: description || [summary, extras].filter(Boolean).join('\n\n'),
    locations: [item.location],
    remote: item.remote ?? null,
    postedAt: item.postedDate ?? null,
    deadlineText: item.deadline ?? null,
    type: asType(item.type),
    stipendText: item.stipend ?? null,
    skills: item.skills ?? [],
    structured: false,
  };
}

async function itemsFromIndex(source: FetchSource, ctx: FetchContext, pageUrl: string, warnings: string[]) {
  const crawler = crawlerOf(ctx);
  const formats: ScrapeFormat[] = ['markdown', 'links', { type: 'json', schema: LISTING_EXTRACTION_SCHEMA, prompt: EXTRACTION_PROMPT }];
  const outcome = await crawler.scrape(pageUrl, { formats, userId: source.ownerId });
  let items: CrawlIndexItem[] | null = null;
  const json = outcome.data.json as { listings?: CrawlIndexItem[] } | undefined;
  if (Array.isArray(json?.listings)) items = json.listings.filter((i) => typeof i?.title === 'string' && i.title.trim());
  const markdown = outcome.data.markdown ?? '';
  if (!items && markdown && ctx.extractIndex) {
    items = await ctx.extractIndex(markdown.slice(0, 60_000), pageUrl).catch((err: unknown) => {
      warnings.push(`llm index extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
  }
  if (!items) {
    warnings.push('no structured extraction available; used job-like links from the page');
    items = linksFromMarkdown(markdown, pageUrl);
  }
  return { items, outcome };
}

/**
 * Firecrawl fallback for any other URL: scrape the page with a JSON listing schema,
 * then scrape (markdown only, 1 credit each) up to N *new* detail links. Respects
 * robots.txt, the daily/per-user credit caps and the cloud → standby switch.
 */
export const fetchFirecrawl: Fetcher = async (source, ctx) => {
  const warnings: string[] = [];
  const pageUrl = str(source.config.feedUrl) ?? source.url;
  const { items, outcome } = await itemsFromIndex(source, ctx, pageUrl, warnings);
  let creditsUsed = outcome.creditsUsed;
  const backend = outcome.backend;

  const maxDetail = ctx.maxDetailCalls ?? 20;
  let detailCalls = 0;
  const raws: RawListing[] = [];
  for (const item of items) {
    const raw = toRaw(item, source, pageUrl, '');
    const known = ctx.known?.get(String(raw.externalId));
    const isDetailLink = raw.applyUrl !== pageUrl && tryNormaliseUrl(raw.applyUrl ?? '') !== tryNormaliseUrl(pageUrl);
    if (known?.descriptionMd) {
      raw.descriptionMd = known.descriptionMd;
    } else if (isDetailLink && detailCalls < maxDetail) {
      detailCalls++;
      try {
        const detail = await crawlerOf(ctx).scrape(raw.applyUrl as string, { formats: ['markdown'], userId: source.ownerId });
        creditsUsed += detail.creditsUsed;
        const md = (detail.data.markdown ?? '').slice(0, DETAIL_MAX_CHARS);
        if (md) raw.descriptionMd = md;
      } catch (err) {
        if (err instanceof SourceError && err.kind === 'credits') {
          warnings.push(`credits ran out after ${detailCalls - 1} detail pages`);
          detailCalls = maxDetail;
        } else {
          warnings.push(`detail ${raw.applyUrl ?? ''}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    raws.push(raw);
  }
  const built = buildAll(raws, source, ctx.now, ctx.maxItems);
  return emptyResult({
    listings: built.listings,
    warnings: [...warnings, ...built.warnings],
    totalReported: items.length,
    backend,
    creditsUsed,
  });
};

/** Sitemap: job-like `<loc>` URLs, each new one scraped as a detail page (markdown). */
export const fetchSitemap: Fetcher = async (source, ctx) => {
  const sitemapUrl = str(source.config.feedUrl) ?? source.url;
  const res = await httpRequest(sitemapUrl, { headers: { accept: 'application/xml,text/xml' }, maxBytes: 10 * 1024 * 1024 });
  const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] ?? '').filter((u) => JOBLIKE.test(u));
  if (locs.length === 0) throw new SourceError('parse', 'Sitemap has no job-like URLs');
  const warnings: string[] = [];
  const raws: RawListing[] = [];
  let creditsUsed = 0;
  let backend: 'cloud' | 'selfhosted' | null = null;
  const maxDetail = ctx.maxDetailCalls ?? 20;
  let calls = 0;
  for (const loc of locs.slice(0, ctx.maxItems ?? 500)) {
    const id = tryNormaliseUrl(loc) ?? loc;
    const known = ctx.known?.get(id);
    if (known?.descriptionMd) {
      const title = /^#\s+(.+)$/m.exec(known.descriptionMd)?.[1] ?? decodeURIComponent(new URL(loc).pathname.split('/').filter(Boolean).pop() ?? loc).replace(/[-_]+/g, ' ');
      raws.push({ ...toRaw({ title, url: loc }, source, sitemapUrl, known.descriptionMd), externalId: id });
      continue;
    }
    if (calls >= maxDetail) break;
    calls++;
    try {
      const out = await crawlerOf(ctx).scrape(loc, { formats: ['markdown'], userId: source.ownerId });
      creditsUsed += out.creditsUsed;
      backend = out.backend;
      const md = (out.data.markdown ?? '').slice(0, DETAIL_MAX_CHARS);
      const title = out.data.metadata?.title ?? /^#\s+(.+)$/m.exec(md)?.[1] ?? loc;
      raws.push({ ...toRaw({ title, url: loc }, source, sitemapUrl, md), externalId: id });
    } catch (err) {
      if (err instanceof SourceError && err.kind === 'credits') {
        if (raws.length === 0) throw err;
        warnings.push('credits ran out; remaining sitemap URLs next run');
        break;
      }
      warnings.push(`${loc}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const built = buildAll(raws, source, ctx.now, ctx.maxItems);
  return emptyResult({ listings: built.listings, warnings: [...warnings, ...built.warnings], totalReported: locs.length, backend, creditsUsed });
};
