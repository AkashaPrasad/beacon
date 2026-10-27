/**
 * MSW handlers for docs/API.md §5 (sources, packs, detection, credits).
 *
 * Scenario switches (read per request, so e2e can set them with `page.addInitScript`):
 *   localStorage['beacon:mock:credits'] = 'cloud' (default, 312/500) | 'warning' (430/500)
 *                                         | 'selfhosted' (500/500, standby active) | 'paused' (500/500, no standby)
 *   localStorage['beacon:mock:sources'] = 'default' | 'empty' (no personal sources, all packs off)
 *
 * Detection rules (POST /v1/sources/detect, ~600 ms latency):
 *   boards.greenhouse.io/<t> | job-boards.greenhouse.io/<t> → greenhouse (token containing "invalid"/"strpie" → valid:false)
 *   jobs.lever.co/<c> · jobs.ashbyhq.com/<b> · careers.smartrecruiters.com/<c> · apply.workable.com/<s> · *.myworkdayjobs.com
 *   northwind.dev/careers → redirects to jobs.lever.co/northwind (finalUrl set)
 *   *.invalid / unreachable.* → 502 UPSTREAM_ERROR
 *   …/feed, *.rss, *.xml → rss · anything else → firecrawl crawl fallback (costsCredits)
 */
import { delay, http, HttpResponse } from 'msw';

import { COMMUNITY_FIXTURES, PACK_FIXTURES } from '@/features/sources/mocks/community';

type Kind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'workable'
  | 'workday'
  | 'publicapi'
  | 'rss'
  | 'sitemap'
  | 'firecrawl'
  | 'jobspy';
type Health = 'pending' | 'healthy' | 'degraded' | 'failing';

interface MockSource {
  id: string;
  url: string;
  name: string;
  kind: Kind;
  scope: 'personal' | 'community';
  ownerId: string | null;
  packId: string | null;
  typeTag: string | null;
  enabled: boolean;
  refreshInterval: '1h' | '6h' | 'daily' | 'weekly';
  health: Health;
  healthCode: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  listingsFound: number;
  errorReason: string | null;
  config: { boardToken: string | null; feedUrl: string | null; provider: string | null };
  etag: null;
  lastModified: null;
  createdAt: string;
  updatedAt: string;
  companyDomain: string | null;
  /** mock-only: when a pending source turns healthy */
  readyAt?: number;
  readyListings?: number;
}

const USER_ID = '650000000000000000000001';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function oid(prefix: string, n: number): string {
  return `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
}

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function readScenario(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`beacon:mock:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

// ── State ────────────────────────────────────────────────────────────────────────────────────

interface Db {
  personal: MockSource[];
  community: MockSource[];
  enabledPacks: Set<string>;
  seq: number;
}

let db: Db | null = null;

function communitySeed(): MockSource[] {
  return COMMUNITY_FIXTURES.map(([packId, name, url, kind, boardToken, domain, typeTag, count], i) => {
    const h = hash(`${packId}:${name}`);
    const crawled = kind === 'firecrawl';
    const failing = crawled && h % 17 === 0;
    const degraded = !failing && h % 11 === 0;
    return {
      id: oid('6c', i + 1),
      url,
      name,
      kind: kind as Kind,
      scope: 'community',
      ownerId: null,
      packId,
      typeTag,
      enabled: true,
      refreshInterval: crawled ? 'daily' : '6h',
      health: failing ? 'failing' : degraded ? 'degraded' : 'healthy',
      healthCode: failing ? 'blocked' : degraded ? 'ratelimited' : 'ok',
      lastCheckedAt: iso((h % 300) * MIN + MIN),
      lastSuccessAt: iso(failing ? 4 * DAY : (h % 300) * MIN + MIN),
      listingsFound: failing ? 0 : count || (h % 40) + 1,
      errorReason: failing
        ? '403 Forbidden: the site blocks crawlers.'
        : degraded
          ? 'Rate limited by the source; retrying with backoff.'
          : null,
      config: { boardToken, feedUrl: null, provider: kind === 'publicapi' ? name.toLowerCase().split(' ')[0] ?? null : null },
      etag: null,
      lastModified: null,
      createdAt: iso(30 * DAY),
      updatedAt: iso(DAY),
      companyDomain: domain || null,
    };
  });
}

function personalSeed(): MockSource[] {
  const base = (n: number, s: Partial<MockSource> & Pick<MockSource, 'url' | 'name' | 'kind'>): MockSource => ({
    id: oid('6a', n),
    scope: 'personal',
    ownerId: USER_ID,
    packId: null,
    typeTag: null,
    enabled: true,
    refreshInterval: 'daily',
    health: 'healthy',
    healthCode: 'ok',
    lastCheckedAt: iso(40 * MIN),
    lastSuccessAt: iso(40 * MIN),
    listingsFound: 0,
    errorReason: null,
    config: { boardToken: null, feedUrl: null, provider: null },
    etag: null,
    lastModified: null,
    createdAt: iso((10 - n) * DAY),
    updatedAt: iso(DAY),
    companyDomain: null,
    ...s,
  });
  return [
    base(1, {
      url: 'https://boards.greenhouse.io/stripe',
      name: 'Stripe',
      kind: 'greenhouse',
      typeTag: 'internship',
      refreshInterval: '6h',
      lastCheckedAt: iso(12 * MIN),
      listingsFound: 142,
      config: { boardToken: 'stripe', feedUrl: null, provider: null },
      companyDomain: 'stripe.com',
    }),
    base(2, {
      url: 'https://northwind.example/careers',
      name: 'Northwind careers',
      kind: 'firecrawl',
      health: 'degraded',
      healthCode: 'ratelimited',
      lastCheckedAt: iso(3 * HOUR),
      listingsFound: 18,
      errorReason: 'Responded slowly (9.4 s) and returned a partial page.',
    }),
    base(3, {
      url: 'https://acme.example/careers',
      name: 'Acme careers',
      kind: 'firecrawl',
      health: 'failing',
      healthCode: 'blocked',
      lastCheckedAt: iso(2 * HOUR),
      lastSuccessAt: iso(4 * DAY),
      listingsFound: 0,
      errorReason: '403 Forbidden: the site blocks crawlers. Last success 4 days ago.',
    }),
    base(4, {
      url: 'https://devfolio.co/hackathons',
      name: 'Devfolio hackathons',
      kind: 'publicapi',
      typeTag: 'hackathon',
      refreshInterval: '6h',
      listingsFound: 25,
      config: { boardToken: null, feedUrl: null, provider: 'devfolio' },
      companyDomain: 'devfolio.co',
    }),
    base(5, {
      url: 'https://jobs.ashbyhq.com/meridian-ai',
      name: 'Meridian AI Lab',
      kind: 'ashby',
      typeTag: 'research',
      listingsFound: 7,
      config: { boardToken: 'meridian-ai', feedUrl: null, provider: null },
    }),
    base(6, {
      url: 'https://kaveri-foundation.example/scholarships/feed',
      name: 'Kaveri Foundation scholarships',
      kind: 'rss',
      typeTag: 'scholarship',
      refreshInterval: 'weekly',
      lastCheckedAt: iso(2 * DAY),
      listingsFound: 4,
    }),
  ];
}

function getDb(): Db {
  if (db) return db;
  const empty = readScenario('sources', 'default') === 'empty';
  db = {
    personal: empty ? [] : personalSeed(),
    community: communitySeed(),
    enabledPacks: new Set(
      empty ? [] : ['top-indian-product', 'faang-plus-india', 'yc-startups-interns', 'hackathons-india'],
    ),
    seq: 100,
  };
  return db;
}

/** Test helper: forget all mock state. */
export function resetSourcesMock(): void {
  db = null;
}

/** Simulate the worker: pending sources settle a few seconds after they were added. */
function settle(source: MockSource): MockSource {
  if (source.health === 'pending' && source.readyAt && Date.now() >= source.readyAt) {
    const crawled = source.kind === 'firecrawl';
    const paused = crawled && creditsFor().mode === 'paused';
    source.health = paused ? 'degraded' : 'healthy';
    source.healthCode = paused ? 'paused:credits' : 'ok';
    source.errorReason = paused ? "Today's crawl budget is used up." : null;
    source.lastCheckedAt = new Date().toISOString();
    source.lastSuccessAt = paused ? null : source.lastCheckedAt;
    source.listingsFound = paused ? 0 : (source.readyListings ?? 0);
    delete source.readyAt;
  }
  return source;
}

function publicSource(s: MockSource) {
  const { readyAt: _r, readyListings: _l, ...rest } = s;
  return rest;
}

function creditsFor() {
  const scenario = readScenario('credits', 'cloud');
  const cap = 500;
  const used = scenario === 'warning' ? 430 : scenario === 'cloud' ? 312 : 500;
  return {
    mode: scenario === 'paused' ? 'paused' : scenario === 'selfhosted' ? 'selfhosted' : 'cloud',
    body: {
      date: new Date().toISOString().slice(0, 10),
      cloudUsedToday: used,
      cap,
      selfHostedUsedToday: scenario === 'selfhosted' ? 37 : 0,
      backend: scenario === 'selfhosted' ? 'selfhosted' : 'cloud',
      userUsedToday: scenario === 'cloud' ? 14 : 22,
    },
  } as const;
}

function applyCreditPause(s: MockSource): MockSource {
  if (s.kind === 'firecrawl' && creditsFor().mode === 'paused' && s.health !== 'failing') {
    return { ...s, health: 'degraded', healthCode: 'paused:credits', errorReason: "Today's crawl budget is used up." };
  }
  return s;
}

function normalise(raw: string): string {
  let text = raw.trim();
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) text = `https://${text.replace(/^\/+/, '')}`;
  try {
    const u = new URL(text);
    u.hostname = u.hostname.toLowerCase().replace(/^www\d*\./, '');
    u.protocol = 'https:';
    u.hash = '';
    let path = u.pathname.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path === '/') path = '';
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return text;
  }
}

function packDto(id: string) {
  const d = getDb();
  const fixture = PACK_FIXTURES.find((p) => p.id === id);
  const sources = d.community.filter((s) => s.packId === id);
  const kinds: Record<string, number> = {};
  for (const s of sources) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
  return {
    id,
    name: fixture?.name ?? id,
    sourceCount: sources.length,
    kinds,
    optional: fixture?.optional ?? false,
    enabled: d.enabledPacks.has(id),
  };
}

const ALIASES: Record<string, string> = {
  'india-product': 'top-indian-product',
  'faang-india': 'faang-plus-india',
  'yc-startups': 'yc-startups-interns',
  hackathons: 'hackathons-india',
  scholarships: 'scholarships-engineering',
  'remote-friendly': 'remote-friendly-startups',
};

function notFound(message = 'Source not found') {
  return HttpResponse.json({ error: { code: 'NOT_FOUND', message } }, { status: 404 });
}

// ── Detection ────────────────────────────────────────────────────────────────────────────────

const SAMPLE_TITLES = [
  'Software Engineer, Intern',
  'Backend Engineer',
  'Data Analyst Intern',
  'Product Design Intern',
  'Site Reliability Engineer',
];

function detect(input: string) {
  const url = normalise(input);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { status: 400 as const };
  }
  const host = u.hostname;
  const seg = u.pathname.split('/').filter(Boolean);
  const first = seg[0] ?? null;
  const base = {
    url,
    confidence: 1,
    company: null as string | null,
    name: null as string | null,
    previewCount: null as number | null,
    sampleTitles: [] as string[],
    costsCredits: false,
    message: '',
    valid: true,
    apiUrl: null as string | null,
    companyName: null as string | null,
    companyDomain: null as string | null,
    finalUrl: null as string | null,
    config: { boardToken: null as string | null, feedUrl: null as string | null, provider: null as string | null },
  };
  const titled = (token: string) => token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const ats = (kind: Kind, token: string | null, apiUrl: string | null) => {
    const bad = !token || /invalid|strpie|doesnotexist|notarealboard/i.test(token);
    const count = token === 'stripe' ? 142 : token ? (hash(token) % 120) + 3 : 0;
    const company = token ? titled(token) : null;
    return {
      ...base,
      kind,
      boardToken: token,
      company,
      name: company,
      companyName: company,
      companyDomain: token && !bad ? `${token.replace(/[^a-z0-9-]/gi, '')}.com` : null,
      previewCount: bad ? 0 : count,
      sampleTitles: bad ? [] : SAMPLE_TITLES.slice(0, 3),
      valid: !bad,
      apiUrl,
      message: bad ? `No ${kind} board called “${token ?? ''}”.` : `Detected ${kind} board ${token ?? ''}`,
      config: { ...base.config, boardToken: token },
    };
  };

  if (/\.invalid$/.test(host) || host.startsWith('unreachable.')) return { status: 502 as const };
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    return { status: 200 as const, body: ats('greenhouse', first, first ? `https://boards-api.greenhouse.io/v1/boards/${first}/jobs` : null) };
  }
  if (host === 'jobs.lever.co') return { status: 200 as const, body: ats('lever', first, first ? `https://api.lever.co/v0/postings/${first}?mode=json` : null) };
  if (host === 'jobs.ashbyhq.com') return { status: 200 as const, body: ats('ashby', first, null) };
  if (host === 'careers.smartrecruiters.com') return { status: 200 as const, body: ats('smartrecruiters', first, null) };
  if (host === 'apply.workable.com') return { status: 200 as const, body: ats('workable', first, null) };
  if (host.endsWith('.myworkdayjobs.com')) return { status: 200 as const, body: ats('workday', host.split('.')[0] ?? null, null) };
  if (host === 'northwind.dev' || host === 'go.northwind.dev') {
    const redirected = ats('lever', 'northwind', 'https://api.lever.co/v0/postings/northwind?mode=json');
    return { status: 200 as const, body: { ...redirected, confidence: 0.9, previewCount: 18, finalUrl: 'https://jobs.lever.co/northwind' } };
  }
  if (/(\.rss|\.xml|\/feed|\/rss)$/.test(u.pathname)) {
    return {
      status: 200 as const,
      body: {
        ...base,
        kind: 'rss' as Kind,
        boardToken: null,
        confidence: 0.95,
        name: titled(host.split('.')[0] ?? host),
        previewCount: 6,
        sampleTitles: ['Merit scholarship 2026', 'Women in engineering fellowship'],
        message: 'RSS feed',
        config: { ...base.config, feedUrl: url },
      },
    };
  }
  return {
    status: 200 as const,
    body: {
      ...base,
      kind: 'firecrawl' as Kind,
      boardToken: null,
      confidence: 0.4,
      name: titled(host.split('.')[0] ?? host),
      companyDomain: host,
      costsCredits: true,
      message: 'No job board API here. We will read the page instead.',
    },
  };
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────────────

export const sourcesHandlers = [
  http.get('*/v1/sources', async () => {
    await delay(120);
    const d = getDb();
    const items = d.personal.map(settle).map(applyCreditPause).map(publicSource);
    return HttpResponse.json({ items });
  }),

  http.get('*/v1/sources/community', async ({ request }) => {
    await delay(160);
    const d = getDb();
    const params = new URL(request.url).searchParams;
    const pack = params.get('pack');
    const packId = pack ? (ALIASES[pack] ?? pack) : null;
    const limit = Math.min(200, Math.max(1, Number(params.get('limit') ?? 100)));
    const offset = Number(params.get('cursor') ?? 0) || 0;
    const all = d.community.filter((s) => !packId || s.packId === packId);
    const page = all.slice(offset, offset + limit).map((s) => ({
      ...publicSource(applyCreditPause(s)),
      subscribed: s.packId ? d.enabledPacks.has(s.packId) : false,
    }));
    const next = offset + limit < all.length ? String(offset + limit) : null;
    return HttpResponse.json({ items: page, nextCursor: next });
  }),

  http.get('*/v1/sources/packs', async () => {
    await delay(100);
    return HttpResponse.json({ items: PACK_FIXTURES.map((p) => packDto(p.id)) });
  }),

  http.post('*/v1/sources/packs/:packId/:action', async ({ params }) => {
    await delay(220);
    const d = getDb();
    const raw = String(params.packId);
    const id = ALIASES[raw] ?? raw;
    if (!PACK_FIXTURES.some((p) => p.id === id)) return notFound('Pack not found');
    const action = String(params.action);
    if (action === 'enable') {
      d.enabledPacks.add(id);
      const count = d.community.filter((s) => s.packId === id).length;
      return HttpResponse.json({ pack: packDto(id), subscribed: count, ingestQueued: Math.round(count / 3) });
    }
    if (action === 'disable') {
      d.enabledPacks.delete(id);
      return HttpResponse.json({ pack: packDto(id), unsubscribed: d.community.filter((s) => s.packId === id).length });
    }
    return notFound();
  }),

  http.get('*/v1/sources/credits', async () => {
    await delay(80);
    return HttpResponse.json(creditsFor().body);
  }),

  http.post('*/v1/sources/detect', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { url?: string } | null;
    await delay(600);
    if (!body?.url || !body.url.trim()) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION', message: 'Invalid request', issues: [{ path: ['url'], code: 'too_small', message: 'Required' }] } },
        { status: 400 },
      );
    }
    const result = detect(body.url);
    if (result.status === 400) {
      return HttpResponse.json({ error: { code: 'VALIDATION', message: 'Invalid URL' } }, { status: 400 });
    }
    if (result.status === 502) {
      return HttpResponse.json(
        { error: { code: 'UPSTREAM_ERROR', message: "Couldn't reach that page", details: { reason: 'ENOTFOUND' } } },
        { status: 502 },
      );
    }
    return HttpResponse.json(result.body);
  }),

  http.post('*/v1/sources', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      url?: string;
      name?: string;
      typeTag?: string | null;
      refreshInterval?: MockSource['refreshInterval'];
      kind?: Kind;
      boardToken?: string | null;
      feedUrl?: string | null;
    } | null;
    await delay(300);
    if (!body?.url) return HttpResponse.json({ error: { code: 'VALIDATION', message: 'Invalid request' } }, { status: 400 });
    const d = getDb();
    const url = normalise(body.url);
    const existing = d.personal.find((s) => normalise(s.url) === url);
    if (existing) {
      return HttpResponse.json(
        { error: { code: 'CONFLICT', message: 'Source already added', details: { existingId: existing.id } } },
        { status: 409 },
      );
    }
    const detection = detect(url);
    const det = detection.status === 200 ? detection.body : null;
    const now = new Date().toISOString();
    d.seq += 1;
    const source: MockSource = {
      id: oid('6b', d.seq),
      url,
      name: body.name?.trim() || det?.name || new URL(url).hostname,
      kind: body.kind ?? det?.kind ?? 'firecrawl',
      scope: 'personal',
      ownerId: USER_ID,
      packId: null,
      typeTag: body.typeTag ?? null,
      enabled: true,
      refreshInterval: body.refreshInterval ?? 'daily',
      health: 'pending',
      healthCode: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      listingsFound: 0,
      errorReason: null,
      config: { boardToken: body.boardToken ?? det?.boardToken ?? null, feedUrl: body.feedUrl ?? null, provider: null },
      etag: null,
      lastModified: null,
      createdAt: now,
      updatedAt: now,
      companyDomain: det?.companyDomain ?? null,
      readyAt: Date.now() + 2_500,
      readyListings: det?.previewCount ?? 9,
    };
    d.personal.unshift(source);
    return HttpResponse.json({ source: publicSource(source), detection: det }, { status: 201 });
  }),

  http.get('*/v1/sources/:id', async ({ params }) => {
    const d = getDb();
    const s = d.personal.find((x) => x.id === params.id) ?? d.community.find((x) => x.id === params.id);
    return s ? HttpResponse.json({ source: publicSource(settle(s)) }) : notFound();
  }),

  http.patch('*/v1/sources/:id', async ({ params, request }) => {
    await delay(160);
    const d = getDb();
    if (d.community.some((x) => x.id === params.id)) {
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Community sources are shared' } }, { status: 403 });
    }
    const s = d.personal.find((x) => x.id === params.id);
    if (!s) return notFound();
    const patch = (await request.json().catch(() => ({}))) as Partial<MockSource>;
    for (const key of ['name', 'typeTag', 'refreshInterval', 'enabled'] as const) {
      if (patch[key] !== undefined) (s as unknown as Record<string, unknown>)[key] = patch[key];
    }
    s.updatedAt = new Date().toISOString();
    return HttpResponse.json({ source: publicSource(s) });
  }),

  http.post('*/v1/sources/:id/refresh', async ({ params }) => {
    await delay(150);
    const d = getDb();
    const s = d.personal.find((x) => x.id === params.id);
    if (!s) return notFound();
    s.readyListings = s.listingsFound || s.readyListings || 5;
    s.health = 'pending';
    s.readyAt = Date.now() + 2_000;
    return HttpResponse.json({ queued: true }, { status: 202 });
  }),

  http.delete('*/v1/sources/:id', async ({ params }) => {
    await delay(150);
    const d = getDb();
    if (d.community.some((x) => x.id === params.id)) {
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Community sources are shared' } }, { status: 403 });
    }
    const before = d.personal.length;
    d.personal = d.personal.filter((x) => x.id !== params.id);
    return before === d.personal.length ? notFound() : new HttpResponse(null, { status: 204 });
  }),
];
