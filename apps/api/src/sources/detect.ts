/**
 * Source auto-detection: careers URL → ATS board (Greenhouse, Lever, Ashby, SmartRecruiters,
 * Workable, Workday) → known public API → RSS/Atom/sitemap → Firecrawl crawl fallback.
 * Endpoint quirks follow seed/VERIFICATION.md.
 */
import { SOURCE_KIND_LABELS, tryNormaliseUrl, type SourceKind } from '@kestrel/shared';

import { badRequest } from '../lib/errors.js';
import { safeFetch, SafeFetchError, tryJson, type FetchLike, type SafeResponse } from '../lib/http.js';

export type AtsKind = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workable' | 'workday';

export interface AtsMatch {
  kind: AtsKind;
  token: string;
  /** Workday only. */
  wdHost?: string;
  site?: string;
  /** Lever EU tenants. */
  eu?: boolean;
}

export interface DetectResult {
  url: string;
  kind: SourceKind;
  confidence: number;
  boardToken: string | null;
  company: string | null;
  name: string | null;
  previewCount: number | null;
  sampleTitles: string[];
  costsCredits: boolean;
  message: string;
  valid: boolean;
  apiUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  finalUrl: string | null;
  config: {
    boardToken: string | null;
    feedUrl: string | null;
    provider: string | null;
    apiUrl?: string | null;
    method?: 'GET' | 'POST' | null;
    body?: unknown;
    tenant?: string | null;
    site?: string | null;
    wdHost?: string | null;
  };
}

export interface DetectDeps {
  fetchImpl?: FetchLike;
  resolveDns?: boolean;
  timeoutMs?: number;
}

const TOKEN = '([A-Za-z0-9][A-Za-z0-9_.%-]*)';
const RESERVED_TOKENS = new Set(['embed', 'v1', 'v0', 'api', 'j', 'jobs', 'job', 'apply', 'en', 'static', 'assets', 'js']);

const okToken = (t: string | undefined): t is string => Boolean(t) && !RESERVED_TOKENS.has(t!.toLowerCase());

/** Match a URL against known ATS hosting patterns (no network). */
export function matchAtsUrl(input: URL | string): AtsMatch | null {
  let url: URL;
  try {
    url = typeof input === 'string' ? new URL(input) : input;
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const [first, second, third, fourth] = segments;

  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host)) {
    const forParam = url.searchParams.get('for');
    if (first === 'embed' && forParam) return { kind: 'greenhouse', token: forParam };
    if (okToken(first)) return { kind: 'greenhouse', token: first };
    return null;
  }
  if (host === 'boards-api.greenhouse.io' && first === 'v1' && second === 'boards' && okToken(third)) {
    return { kind: 'greenhouse', token: third };
  }
  if (/^jobs(\.eu)?\.lever\.co$/.test(host) && okToken(first)) {
    return { kind: 'lever', token: first, eu: host.includes('.eu.') };
  }
  if (/^api(\.eu)?\.lever\.co$/.test(host) && first === 'v0' && second === 'postings' && okToken(third)) {
    return { kind: 'lever', token: third, eu: host.includes('.eu.') };
  }
  if (host === 'jobs.ashbyhq.com' && okToken(first)) return { kind: 'ashby', token: first };
  if (host === 'api.ashbyhq.com' && first === 'posting-api' && second === 'job-board' && okToken(third)) {
    return { kind: 'ashby', token: third };
  }
  if (/^(careers|jobs)\.smartrecruiters\.com$/.test(host) && okToken(first)) {
    return { kind: 'smartrecruiters', token: first };
  }
  if (host === 'api.smartrecruiters.com' && first === 'v1' && second === 'companies' && okToken(third)) {
    return { kind: 'smartrecruiters', token: third };
  }
  if (host === 'apply.workable.com') {
    if (first === 'api' && second === 'v3' && third === 'accounts' && okToken(fourth)) {
      return { kind: 'workable', token: fourth };
    }
    if (okToken(first)) return { kind: 'workable', token: first };
    return null;
  }
  if (host === 'workable.com' && first === 'api' && second === 'accounts' && okToken(third)) {
    return { kind: 'workable', token: third };
  }
  const workableSub = /^([a-z0-9-]+)\.workable\.com$/.exec(host);
  if (workableSub?.[1] && !['www', 'apply', 'help', 'resources', 'jobs'].includes(workableSub[1])) {
    return { kind: 'workable', token: workableSub[1] };
  }
  const workday = /^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/.exec(host);
  if (workday?.[1] && workday[2]) {
    const tenant = workday[1];
    const wdHost = workday[2];
    if (first === 'wday' && second === 'cxs' && fourth) return { kind: 'workday', token: tenant, wdHost, site: fourth };
    const site = first && /^[a-z]{2}-[A-Z]{2}$/.test(first) ? second : first;
    if (site && !RESERVED_TOKENS.has(site.toLowerCase())) return { kind: 'workday', token: tenant, wdHost, site };
    return null;
  }
  return null;
}

/** Search HTML/JS for links or embeds pointing at an ATS board; the most frequent wins. */
export function findAtsInHtml(html: string): AtsMatch | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => AtsMatch | null][] = [
    [
      /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_.-]+)/gi,
      (m) => (okToken(m[1]) ? { kind: 'greenhouse', token: m[1] } : null),
    ],
    [/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9_.-]+)/gi, (m) => (okToken(m[1]) ? { kind: 'greenhouse', token: m[1] } : null)],
    [/boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_.-]+)/gi, (m) => (okToken(m[1]) ? { kind: 'greenhouse', token: m[1] } : null)],
    [/jobs\.(eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/gi, (m) => (okToken(m[2]) ? { kind: 'lever', token: m[2], eu: Boolean(m[1]) } : null)],
    [/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/gi, (m) => (okToken(m[1]) ? { kind: 'ashby', token: decodeURIComponent(m[1]) } : null)],
    [/(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/gi, (m) => (okToken(m[1]) ? { kind: 'smartrecruiters', token: m[1] } : null)],
    [/apply\.workable\.com\/([A-Za-z0-9_-]+)/gi, (m) => (okToken(m[1]) ? { kind: 'workable', token: m[1] } : null)],
    [
      /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/g,
      (m) => (m[1] && m[2] && okToken(m[3]) ? { kind: 'workday', token: m[1], wdHost: m[2], site: m[3] } : null),
    ],
  ];
  const counts = new Map<string, { match: AtsMatch; count: number }>();
  for (const [re, build] of patterns) {
    for (const m of html.matchAll(re)) {
      const match = build(m);
      if (!match) continue;
      const key = `${match.kind}:${match.token.toLowerCase()}:${match.site ?? ''}`;
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { match, count: 1 });
    }
  }
  let best: { match: AtsMatch; count: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  return best?.match ?? null;
}

/** `<link rel="alternate" type="application/rss+xml" href="...">` (attribute order agnostic). */
export function findFeedLink(html: string, baseUrl: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?alternate/i.test(tag)) continue;
    if (!/type\s*=\s*["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      return new URL(href.replace(/&amp;/g, '&'), baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

export function looksLikeFeed(res: Pick<SafeResponse, 'contentType' | 'text'>): boolean {
  if (/(rss|atom)\+xml/.test(res.contentType)) return true;
  const head = res.text.slice(0, 600).trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.test(head);
}

export function parseFeed(xml: string): { title: string | null; count: number; titles: string[] } {
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const titles = items
    .map((item) => /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(item)?.[1])
    .filter((t): t is string => Boolean(t))
    .map(decodeEntities)
    .filter(Boolean);
  const channel = xml.replace(/<(item|entry)\b[\s\S]*?<\/\1>/gi, '');
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(channel)?.[1];
  return { title: title ? decodeEntities(title) : null, count: items.length, titles: titles.slice(0, 5) };
}

function htmlTitle(html: string): string | null {
  const og = /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const value = og ?? title;
  return value ? decodeEntities(value).split(/\s[|–—-]\s/)[0]!.trim().slice(0, 160) || null : null;
}

const ATS_HOSTS =
  /(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|myworkdayjobs\.com)$/i;

/** careers.stripe.com → stripe.com; ATS-hosted URLs have no company domain. */
export function companyDomainOf(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (ATS_HOSTS.test(host)) return null;
  return host.replace(/^(www\d*|careers?|jobs|apply|work|hiring|join|talent)\./, '') || null;
}

function prettyToken(token: string): string {
  const base = token.replace(/[-_.]+/g, ' ').trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Public APIs (no preview fetch; the worker knows each provider) ───────────

const PUBLIC_APIS: readonly { host: RegExp; path?: RegExp; provider: string; apiUrl: string; method?: 'GET' | 'POST' }[] = [
  { host: /(^|\.)devpost\.com$/, path: /^\/(api\/)?hackathons/, provider: 'devpost', apiUrl: 'https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=1' },
  { host: /(^|\.)devfolio\.co$/, provider: 'devfolio', apiUrl: 'https://api.devfolio.co/api/search/hackathons', method: 'POST' },
  { host: /(^|\.)unstop\.com$/, path: /^\/(hackathons|api\/public)/, provider: 'unstop', apiUrl: 'https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=20&oppstatus=open' },
  { host: /(^|\.)kaggle\.com$/, path: /^\/competitions/, provider: 'kaggle', apiUrl: 'https://www.kaggle.com/api/i/competitions.CompetitionService/ListCompetitions', method: 'POST' },
  { host: /(^|\.)hackerearth\.com$/, path: /^\/(challenges|chrome-extension)/, provider: 'hackerearth', apiUrl: 'https://www.hackerearth.com/chrome-extension/events/' },
  { host: /(^|\.)remotive\.com$/, provider: 'remotive', apiUrl: 'https://remotive.com/api/remote-jobs?category=software-dev' },
  { host: /(^|\.)arbeitnow\.com$/, provider: 'arbeitnow', apiUrl: 'https://www.arbeitnow.com/api/job-board-api' },
  { host: /(^|\.)remoteok\.(com|io)$/, provider: 'remoteok', apiUrl: 'https://remoteok.com/api' },
  { host: /(^|\.)jobicy\.com$/, provider: 'jobicy', apiUrl: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=developer' },
  { host: /(^|\.)themuse\.com$/, provider: 'themuse', apiUrl: 'https://www.themuse.com/api/public/jobs?page=1' },
];

export function matchPublicApi(url: URL): (typeof PUBLIC_APIS)[number] | null {
  const host = url.hostname.toLowerCase();
  return PUBLIC_APIS.find((api) => api.host.test(host) && (!api.path || api.path.test(url.pathname))) ?? null;
}

// ── ATS preview (JSON endpoint → posting count) ──────────────────────────────

interface AtsPreview {
  ok: boolean;
  status: number | null;
  count: number | null;
  titles: string[];
  company: string | null;
  apiUrl: string;
  method: 'GET' | 'POST';
  body?: unknown;
  error?: string;
}

export const WORKDAY_BODY = { appliedFacets: {}, limit: 20, offset: 0, searchText: '' } as const;

export function atsApiUrl(match: AtsMatch): { apiUrl: string; method: 'GET' | 'POST'; body?: unknown } {
  const t = encodeURIComponent(match.token);
  switch (match.kind) {
    case 'greenhouse':
      return { apiUrl: `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`, method: 'GET' };
    case 'lever':
      return { apiUrl: `https://api${match.eu ? '.eu' : ''}.lever.co/v0/postings/${t}?mode=json`, method: 'GET' };
    case 'ashby':
      return { apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${t}`, method: 'GET' };
    case 'smartrecruiters':
      return { apiUrl: `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`, method: 'GET' };
    case 'workable':
      return { apiUrl: `https://www.workable.com/api/accounts/${t}?details=true`, method: 'GET' };
    case 'workday':
      return {
        apiUrl: `https://${match.token}.${match.wdHost}.myworkdayjobs.com/wday/cxs/${match.token}/${match.site}/jobs`,
        method: 'POST',
        body: WORKDAY_BODY,
      };
  }
}

type Json = Record<string, unknown>;
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function previewAts(match: AtsMatch, deps: DetectDeps): Promise<AtsPreview> {
  const { apiUrl, method, body } = atsApiUrl(match);
  const base: AtsPreview = { ok: false, status: null, count: null, titles: [], company: null, apiUrl, method, body };
  let res: SafeResponse;
  try {
    res = await safeFetch(apiUrl, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      timeoutMs: deps.timeoutMs ?? 10_000,
      maxBytes: 5 * 1024 * 1024,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      resolveDns: deps.resolveDns ?? true,
    });
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
  base.status = res.status;
  if (!res.ok) return { ...base, error: `HTTP ${res.status}` };
  const json = tryJson<unknown>(res.text);
  if (json === null) return { ...base, ok: true, error: res.truncated ? 'response too large to count' : 'invalid JSON' };

  switch (match.kind) {
    case 'greenhouse': {
      const data = json as Json;
      const jobs = asArray(data['jobs']);
      const total = (data['meta'] as Json | undefined)?.['total'];
      return {
        ...base,
        ok: true,
        count: typeof total === 'number' ? total : jobs.length,
        titles: jobs.map((j) => str(j['title'])).filter((t): t is string => Boolean(t)).slice(0, 5),
        company: str(jobs[0]?.['company_name']),
      };
    }
    case 'lever': {
      const jobs = asArray(json);
      return { ...base, ok: true, count: jobs.length, titles: jobs.map((j) => str(j['text'])).filter((t): t is string => Boolean(t)).slice(0, 5) };
    }
    case 'ashby': {
      const jobs = asArray((json as Json)['jobs']).filter((j) => j['isListed'] !== false);
      return { ...base, ok: true, count: jobs.length, titles: jobs.map((j) => str(j['title'])).filter((t): t is string => Boolean(t)).slice(0, 5) };
    }
    case 'smartrecruiters': {
      const data = json as Json;
      const content = asArray(data['content']);
      const total = typeof data['totalFound'] === 'number' ? data['totalFound'] : content.length;
      return {
        ...base,
        ok: true,
        count: total,
        titles: content.map((j) => str(j['name'])).filter((t): t is string => Boolean(t)).slice(0, 5),
        company: str((content[0]?.['company'] as Json | undefined)?.['name']),
      };
    }
    case 'workable': {
      const data = json as Json;
      const jobs = asArray(data['jobs']);
      return {
        ...base,
        ok: true,
        count: jobs.length,
        titles: jobs.map((j) => str(j['title'])).filter((t): t is string => Boolean(t)).slice(0, 5),
        company: str(data['name']),
      };
    }
    case 'workday': {
      const data = json as Json;
      const postings = asArray(data['jobPostings']);
      return {
        ...base,
        ok: true,
        count: typeof data['total'] === 'number' ? data['total'] : postings.length,
        titles: postings.map((j) => str(j['title'])).filter((t): t is string => Boolean(t)).slice(0, 5),
      };
    }
  }
}

async function atsResult(
  match: AtsMatch,
  context: { url: string; finalUrl: string | null; companyDomain: string | null; viaHtml: boolean },
  deps: DetectDeps,
): Promise<DetectResult> {
  const preview = await previewAts(match, deps);
  const label = SOURCE_KIND_LABELS[match.kind];
  const company = preview.company ?? prettyToken(match.token);
  const notFound = preview.status === 404 || (preview.status !== null && preview.status >= 400 && preview.status < 500);
  const empty = preview.ok && preview.count === 0;
  const valid = preview.ok && !empty;
  let message: string;
  if (valid) {
    message = `Detected: ${label} board \`${match.token}\` → ${preview.count ?? 'some'} ${preview.count === 1 ? 'job' : 'jobs'}`;
  } else if (notFound) {
    message = `${label} board "${match.token}" was not found (HTTP ${preview.status}). Check the board token.`;
  } else if (empty) {
    message =
      match.kind === 'smartrecruiters'
        ? `SmartRecruiters company "${match.token}" has no public postings (unknown companies also return 0).`
        : `${label} board "${match.token}" has no open postings right now.`;
  } else {
    message = `Detected a ${label} board, but the preview failed (${preview.error ?? 'unknown error'}).`;
  }
  const baseConfidence = context.viaHtml ? 0.8 : 1;
  return {
    url: context.url,
    kind: match.kind,
    confidence: valid ? baseConfidence : notFound || empty ? 0.3 : 0.6,
    boardToken: match.token,
    company,
    name: company,
    previewCount: preview.ok ? preview.count : notFound ? 0 : null,
    sampleTitles: preview.titles,
    costsCredits: false,
    message,
    valid: valid || (!notFound && !empty),
    apiUrl: preview.apiUrl,
    companyName: company,
    companyDomain: context.companyDomain,
    finalUrl: context.finalUrl,
    config: {
      boardToken: match.token,
      feedUrl: preview.apiUrl,
      provider: null,
      apiUrl: preview.apiUrl,
      method: preview.method,
      ...(preview.body ? { body: preview.body } : {}),
      ...(match.kind === 'workday' ? { tenant: match.token, site: match.site ?? null, wdHost: match.wdHost ?? null } : {}),
    },
  };
}

function firecrawlResult(
  url: string,
  finalUrl: string | null,
  name: string | null,
  companyDomain: string | null,
  message: string,
  valid = true,
): DetectResult {
  return {
    url,
    kind: 'firecrawl',
    confidence: valid ? 0.4 : 0.1,
    boardToken: null,
    company: name,
    name,
    previewCount: null,
    sampleTitles: [],
    costsCredits: true,
    message,
    valid,
    apiUrl: null,
    companyName: name,
    companyDomain,
    finalUrl,
    config: { boardToken: null, feedUrl: null, provider: null },
  };
}

function feedResult(
  url: string,
  feedUrl: string,
  finalUrl: string | null,
  feed: ReturnType<typeof parseFeed>,
  companyDomain: string | null,
  confidence: number,
): DetectResult {
  return {
    url,
    kind: 'rss',
    confidence,
    boardToken: null,
    company: feed.title,
    name: feed.title,
    previewCount: feed.count,
    sampleTitles: feed.titles,
    costsCredits: false,
    message: `Detected: RSS/Atom feed → ${feed.count} ${feed.count === 1 ? 'item' : 'items'}`,
    valid: true,
    apiUrl: feedUrl,
    companyName: feed.title,
    companyDomain,
    finalUrl,
    config: { boardToken: null, feedUrl, provider: null, apiUrl: feedUrl, method: 'GET' },
  };
}

/** Make a user-typed URL fetchable ("jobs.lever.co/acme" → "https://jobs.lever.co/acme"). */
export function toFetchUrl(input: string): URL {
  const raw = input.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw badRequest('Enter a valid http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('Only http(s) URLs are supported');
  return url;
}

export async function detectSource(input: string, deps: DetectDeps = {}): Promise<DetectResult> {
  const target = toFetchUrl(input);
  const url = tryNormaliseUrl(target.toString()) ?? target.toString();
  const fetchOpts = {
    timeoutMs: deps.timeoutMs ?? 10_000,
    maxBytes: 2 * 1024 * 1024,
    maxRedirects: 3,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    resolveDns: deps.resolveDns ?? true,
  };

  const direct = matchAtsUrl(target);
  if (direct) return atsResult(direct, { url, finalUrl: null, companyDomain: null, viaHtml: false }, deps);

  const api = matchPublicApi(target);
  if (api) {
    return {
      url,
      kind: 'publicapi',
      confidence: 0.9,
      boardToken: null,
      company: null,
      name: prettyToken(api.provider),
      previewCount: null,
      sampleTitles: [],
      costsCredits: false,
      message: `Detected: ${prettyToken(api.provider)} public API`,
      valid: true,
      apiUrl: api.apiUrl,
      companyName: null,
      companyDomain: null,
      finalUrl: null,
      config: { boardToken: null, feedUrl: api.apiUrl, provider: api.provider, apiUrl: api.apiUrl, method: api.method ?? 'GET' },
    };
  }

  const companyDomain = companyDomainOf(target);
  let page: SafeResponse;
  try {
    page = await safeFetch(target, { ...fetchOpts, headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
  } catch (err) {
    if (err instanceof SafeFetchError && (err.reason === 'blocked_host' || err.reason === 'bad_url')) {
      throw badRequest(err.message);
    }
    return firecrawlResult(
      url,
      null,
      null,
      companyDomain,
      `Couldn't reach the page (${(err as Error).message}). It will be crawled with Firecrawl (uses crawl credits).`,
      false,
    );
  }

  const finalUrl = page.finalUrl;
  const redirected = finalUrl !== target.toString();
  if (redirected) {
    const viaRedirect = matchAtsUrl(finalUrl);
    if (viaRedirect) return atsResult(viaRedirect, { url, finalUrl, companyDomain, viaHtml: false }, deps);
  }

  if (page.ok && looksLikeFeed(page)) {
    return feedResult(url, finalUrl, finalUrl, parseFeed(page.text), companyDomain, 0.95);
  }

  if (page.ok && /<urlset\b/i.test(page.text.slice(0, 2_000))) {
    const count = (page.text.match(/<url>/gi) ?? []).length;
    return {
      ...firecrawlResult(url, finalUrl, null, companyDomain, ''),
      kind: 'sitemap',
      confidence: 0.7,
      previewCount: count,
      costsCredits: false,
      message: `Detected: sitemap → ${count} URLs`,
      apiUrl: finalUrl,
      config: { boardToken: null, feedUrl: finalUrl, provider: null, apiUrl: finalUrl, method: 'GET' },
    };
  }

  if (!page.ok) {
    return firecrawlResult(
      url,
      finalUrl,
      null,
      companyDomain,
      `The page answered HTTP ${page.status}; it will be crawled with Firecrawl (uses crawl credits).`,
      page.status < 500 && page.status !== 404,
    );
  }

  const html = page.text;
  const embedded = findAtsInHtml(html);
  if (embedded) return atsResult(embedded, { url, finalUrl: redirected ? finalUrl : null, companyDomain, viaHtml: true }, deps);

  const feedHref = findFeedLink(html, finalUrl);
  if (feedHref) {
    try {
      const feed = await safeFetch(feedHref, fetchOpts);
      if (feed.ok && looksLikeFeed(feed)) {
        return feedResult(url, feedHref, redirected ? finalUrl : null, parseFeed(feed.text), companyDomain, 0.75);
      }
    } catch {
      /* fall through to crawl */
    }
  }

  const name = htmlTitle(html);
  return firecrawlResult(
    url,
    redirected ? finalUrl : null,
    name,
    companyDomain,
    "No job board API here. We'll read the page instead (uses crawl credits).",
  );
}
