import type { SourceKind } from '@kestrel/shared';

/**
 * URL → source kind detection (pure, no network). The API's `POST /sources/detect` uses
 * the same rules; this is a local copy until it moves to `@kestrel/shared`
 * (docs/SHARED-REQUESTS.md). Network-backed detection (careers HTML that links to an
 * ATS, RSS autodiscovery) lives in the API.
 */
export interface DetectedSource {
  kind: SourceKind;
  boardToken: string | null;
  /** Public API provider id for kind=publicapi. */
  provider: string | null;
  /** Resolved API/feed URL when it differs from the page URL. */
  feedUrl: string | null;
  /** Workday tenant parts. */
  workday?: { tenant: string; wdHost: string; site: string };
  confidence: number;
}

const firstSegment = (u: URL) => u.pathname.split('/').filter(Boolean)[0] ?? null;

/** Public API providers recognised by host (and the default feed URL each one polls). */
export const PUBLIC_API_HOSTS: Readonly<Record<string, { provider: string; feedUrl: string }>> = {
  'remotive.com': { provider: 'remotive', feedUrl: 'https://remotive.com/api/remote-jobs?category=software-dev' },
  'www.arbeitnow.com': { provider: 'arbeitnow', feedUrl: 'https://www.arbeitnow.com/api/job-board-api' },
  'arbeitnow.com': { provider: 'arbeitnow', feedUrl: 'https://www.arbeitnow.com/api/job-board-api' },
  'remoteok.com': { provider: 'remoteok', feedUrl: 'https://remoteok.com/api' },
  'jobicy.com': { provider: 'jobicy', feedUrl: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=developer' },
  'www.themuse.com': {
    provider: 'themuse',
    feedUrl: 'https://www.themuse.com/api/public/jobs?page=1&level=Internship&location=India',
  },
  'api.adzuna.com': { provider: 'adzuna', feedUrl: 'https://api.adzuna.com/v1/api/jobs/in/search/1' },
  'devpost.com': { provider: 'devpost', feedUrl: 'https://devpost.com/api/hackathons?status[]=upcoming&status[]=open' },
  'api.devfolio.co': { provider: 'devfolio', feedUrl: 'https://api.devfolio.co/api/search/hackathons' },
  'devfolio.co': { provider: 'devfolio', feedUrl: 'https://api.devfolio.co/api/search/hackathons' },
  'unstop.com': {
    provider: 'unstop',
    feedUrl: 'https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=20&oppstatus=open',
  },
  'www.hackerearth.com': { provider: 'hackerearth', feedUrl: 'https://www.hackerearth.com/chrome-extension/events/' },
  'www.kaggle.com': {
    provider: 'kaggle',
    feedUrl: 'https://www.kaggle.com/api/i/competitions.CompetitionService/ListCompetitions',
  },
};

export function detectSourceKind(input: string): DetectedSource {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { kind: 'firecrawl', boardToken: null, provider: null, feedUrl: null, confidence: 0 };
  }
  const host = url.hostname.toLowerCase();
  const seg = firstSegment(url);
  const result = (kind: SourceKind, boardToken: string | null, confidence = 0.95, extra: Partial<DetectedSource> = {}) => ({
    kind,
    boardToken,
    provider: null,
    feedUrl: null,
    confidence,
    ...extra,
  });

  // ── ATS boards ──
  if (host === 'boards-api.greenhouse.io') {
    const m = /\/boards\/([^/]+)/.exec(url.pathname);
    return result('greenhouse', m?.[1] ?? null);
  }
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const token = url.searchParams.get('for') ?? seg;
    return result('greenhouse', token && token !== 'embed' ? token : null);
  }
  if (host === 'api.lever.co' || host === 'api.eu.lever.co') {
    const m = /\/postings\/([^/?]+)/.exec(url.pathname);
    return result('lever', m?.[1] ?? null);
  }
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') return result('lever', seg);
  if (host === 'api.ashbyhq.com') {
    const m = /\/job-board\/([^/?]+)/.exec(url.pathname);
    return result('ashby', m?.[1] ?? null);
  }
  if (host === 'jobs.ashbyhq.com') return result('ashby', seg);
  if (host === 'api.smartrecruiters.com') {
    const m = /\/companies\/([^/]+)/.exec(url.pathname);
    return result('smartrecruiters', m?.[1] ?? null);
  }
  if (host === 'careers.smartrecruiters.com' || host === 'jobs.smartrecruiters.com') return result('smartrecruiters', seg);
  if (host === 'apply.workable.com') return result('workable', seg === 'api' ? null : seg);
  if (host === 'www.workable.com' && url.pathname.startsWith('/api/accounts/')) {
    return result('workable', url.pathname.split('/')[3] ?? null);
  }
  if (/\.workable\.com$/.test(host) && !host.startsWith('www.')) return result('workable', host.split('.')[0] ?? null, 0.8);
  const wd = /^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/.exec(host);
  if (wd) {
    const parts = url.pathname.split('/').filter(Boolean);
    // /wday/cxs/<tenant>/<site>/jobs  or  /<locale?>/<site>
    let site: string | undefined;
    if (parts[0] === 'wday' && parts[1] === 'cxs') site = parts[3];
    else site = parts.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p));
    const tenant = wd[1] ?? '';
    const wdHost = wd[2] ?? '';
    if (site) {
      return result('workday', tenant, 0.95, {
        workday: { tenant, wdHost, site },
        feedUrl: `https://${tenant}.${wdHost}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      });
    }
    return result('workday', tenant, 0.5);
  }

  // ── Public APIs ──
  const api = PUBLIC_API_HOSTS[host];
  if (api) {
    let feedUrl = api.feedUrl;
    if (url.pathname.startsWith('/api')) feedUrl = url.toString();
    if (api.provider === 'unstop' && !url.pathname.startsWith('/api')) {
      const opp = seg && ['hackathons', 'competitions', 'internships', 'jobs', 'scholarships'].includes(seg) ? seg : 'hackathons';
      feedUrl = `https://unstop.com/api/public/opportunity/search-result?opportunity=${opp}&per_page=20&oppstatus=open`;
    }
    return { kind: 'publicapi', boardToken: null, provider: api.provider, feedUrl, confidence: 0.9 };
  }

  // ── Feeds ──
  if (/\.(rss|atom|xml)$/i.test(url.pathname) || /\/(feed|rss|atom)(\/|$)/i.test(url.pathname)) {
    if (/sitemap/i.test(url.pathname)) return result('sitemap', null, 0.7, { feedUrl: url.toString() });
    return result('rss', null, 0.8, { feedUrl: url.toString() });
  }

  return result('firecrawl', null, 0.3);
}
