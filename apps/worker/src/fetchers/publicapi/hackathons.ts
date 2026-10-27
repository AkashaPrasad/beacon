import { canonicaliseSkill } from '@kestrel/shared';

import { parseLooseIso } from '../../lib/dates.js';
import { SourceError } from '../../lib/errors.js';
import { htmlToMarkdown, plainToMarkdown, stripTags } from '../../lib/html.js';
import { httpJson, sleep } from '../../lib/http.js';
import { buildAll, type RawListing } from '../build.js';
import { emptyResult, type FetchContext, type FetchResult, type FetchSource } from '../types.js';

type ProviderFetcher = (source: FetchSource, ctx: FetchContext, feedUrl: string) => Promise<FetchResult>;

/** Only themes that are real skills in the taxonomy ("Machine Learning/AI" yes, "Beginner Friendly" no). */
function knownSkills(names: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    for (const part of name.split(/\s*[/&,]\s*/)) {
      const canonical = canonicaliseSkill(part);
      if (canonical) out.add(canonical);
    }
  }
  return [...out];
}

function result(raws: RawListing[], source: FetchSource, ctx: FetchContext, total: number | null): FetchResult {
  const { listings, warnings } = buildAll(raws, source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, totalReported: total });
}

const maxPagesOf = (source: FetchSource, fallback: number) => Number(source.config.maxPages ?? fallback);

// ── Devpost ──────────────────────────────────────────────────────────────────────────
interface DevpostHackathon {
  id: number;
  title: string;
  url: string;
  organization_name?: string | null;
  displayed_location?: { icon?: string; location?: string };
  open_state?: string;
  submission_period_dates?: string;
  time_left_to_submission?: string;
  themes?: { name: string }[];
  prize_amount?: string;
  registrations_count?: number;
  invite_only?: boolean;
  eligibility_requirement_invite_only_description?: string | null;
}
interface DevpostResponse {
  hackathons?: DevpostHackathon[];
  meta?: { total_count?: number; per_page?: number };
}

export function mapDevpost(h: DevpostHackathon): RawListing {
  const online = h.displayed_location?.icon === 'globe' || /online/i.test(h.displayed_location?.location ?? '');
  const prize = stripTags(h.prize_amount);
  const lines = [
    h.submission_period_dates ? `**Submission period:** ${h.submission_period_dates}` : '',
    prize && prize !== '$0' ? `**Prizes:** ${prize}` : '',
    h.themes?.length ? `**Themes:** ${h.themes.map((t) => t.name).join(', ')}` : '',
    h.registrations_count ? `**Participants:** ${h.registrations_count.toLocaleString('en-US')}` : '',
    h.time_left_to_submission ? `**Status:** ${h.open_state ?? ''} · ${h.time_left_to_submission}` : '',
  ].filter(Boolean);
  return {
    externalId: h.id,
    title: h.title,
    company: h.organization_name || h.title,
    applyUrl: h.url,
    descriptionMd: lines.join('\n\n'),
    locations: [online ? 'Online' : h.displayed_location?.location],
    remote: online ? 'remote' : 'onsite',
    // The list API only has a display range ("Aug 26 - Oct 30, 2026"); the end is the deadline.
    deadlineText: h.submission_period_dates ?? null,
    type: 'hackathon',
    skills: knownSkills((h.themes ?? []).map((t) => t.name)),
    eligibility: h.invite_only ? { other: [h.eligibility_requirement_invite_only_description?.slice(0, 300) || 'Invite only'] } : {},
    structured: true,
  };
}

export const fetchDevpost: ProviderFetcher = async (source, ctx, feedUrl) => {
  const maxPages = maxPagesOf(source, 20);
  const items: DevpostHackathon[] = [];
  let total: number | null = null;
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL(feedUrl);
    u.searchParams.set('page', String(page));
    const { data } = await httpJson<DevpostResponse>(u.toString(), { headers: { accept: 'application/json' } });
    if (!Array.isArray(data?.hackathons)) throw new SourceError('parse', 'Devpost response has no hackathons[]', { url: u.toString() });
    total = data.meta?.total_count ?? total;
    items.push(...data.hackathons);
    const perPage = data.meta?.per_page ?? 9;
    if (data.hackathons.length < perPage || (total !== null && items.length >= total)) break;
    // Undocumented API: stay around 1 request/second.
    await sleep(ctx.detailDelayMs ?? 1_000);
  }
  return result(items.map(mapDevpost), source, ctx, total);
};

// ── Devfolio ─────────────────────────────────────────────────────────────────────────
interface DevfolioHackathon {
  uuid: string;
  name: string;
  slug: string;
  tagline?: string | null;
  desc?: string | null;
  hosted_by?: { name?: string } | string | null;
  is_online?: boolean;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  themes?: { name: string }[];
  prizes?: { name?: string; desc?: string }[];
  team_size?: number | null;
  hackathon_setting?: { reg_ends_at?: string | null; women_only?: boolean; external_apply_url?: string | null; site?: string | null };
}
interface DevfolioResponse {
  hits?: { total?: { value?: number }; hits?: { _source: DevfolioHackathon }[] };
}

export function mapDevfolio(h: DevfolioHackathon): RawListing {
  const host = typeof h.hosted_by === 'string' ? h.hosted_by : h.hosted_by?.name;
  const where = h.is_online ? 'Online' : [h.city, h.state, h.country].filter(Boolean).join(', ') || h.location;
  const lines = [
    h.tagline ? `**${h.tagline.trim()}**` : '',
    h.starts_at ? `**Dates:** ${h.starts_at.slice(0, 10)} → ${(h.ends_at ?? '').slice(0, 10)}` : '',
    h.prizes?.length ? `**Prizes:** ${h.prizes.map((p) => p.name).filter(Boolean).join(', ')}` : '',
    h.team_size ? `**Team size:** up to ${h.team_size}` : '',
    plainToMarkdown(h.desc),
  ].filter(Boolean);
  return {
    externalId: h.uuid,
    title: h.name,
    company: host || h.name,
    applyUrl: `https://${h.slug}.devfolio.co/`,
    descriptionMd: lines.join('\n\n'),
    locations: [where],
    remote: h.is_online ? 'remote' : 'onsite',
    country: h.country ?? null,
    deadlineAt: h.hackathon_setting?.reg_ends_at ?? h.ends_at ?? null,
    type: 'hackathon',
    skills: knownSkills((h.themes ?? []).map((t) => t.name)),
    eligibility: h.hackathon_setting?.women_only ? { other: ['Women only'] } : {},
    structured: true,
  };
}

export const fetchDevfolio: ProviderFetcher = async (source, ctx, feedUrl) => {
  const size = 20;
  const maxPages = maxPagesOf(source, 5);
  const type = typeof source.config.searchType === 'string' ? source.config.searchType : 'application_open';
  const items: DevfolioHackathon[] = [];
  let total: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    const { data } = await httpJson<DevfolioResponse>(feedUrl, {
      method: 'POST',
      body: { type, from: page * size, size },
      headers: { accept: 'application/json' },
    });
    const hits = data?.hits?.hits;
    if (!Array.isArray(hits)) throw new SourceError('parse', 'Devfolio response has no hits.hits[]', { url: feedUrl });
    total = data?.hits?.total?.value ?? total;
    items.push(...hits.map((h) => h._source));
    if (hits.length < size || (total !== null && items.length >= total)) break;
    if (ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
  }
  return result(items.map(mapDevfolio), source, ctx, total);
};

// ── Unstop ───────────────────────────────────────────────────────────────────────────
interface UnstopOpportunity {
  id: number;
  title: string;
  seo_url?: string;
  public_url?: string;
  region?: string;
  details?: string;
  organisation?: { name?: string };
  end_date?: string | null;
  required_skills?: { skill_name?: string; skill?: string }[];
  filters?: { name: string; type: string }[];
  address_with_country_logo?: { city?: string; state?: string; country?: { name?: string; iso?: string } | null } | null;
  regnRequirements?: { end_regn_dt?: string | null; min_team_size?: number; max_team_size?: number } | null;
  prizes?: { cash?: number | null; currency?: string | null; rank?: string | null }[];
}
interface UnstopResponse {
  data?: { current_page: number; last_page: number; total?: number; data?: UnstopOpportunity[] };
}

const UNSTOP_TYPES = { hackathons: 'hackathon', competitions: 'hackathon', internships: 'internship', jobs: 'fulltime', scholarships: 'scholarship' } as const;

export function mapUnstop(o: UnstopOpportunity, kind: (typeof UNSTOP_TYPES)[keyof typeof UNSTOP_TYPES]): RawListing {
  const addr = o.address_with_country_logo;
  const online = (o.region ?? '').toLowerCase() === 'online';
  const where = online ? 'Online' : [addr?.city, addr?.state, addr?.country?.name].filter(Boolean).join(', ');
  const eligible = (o.filters ?? []).filter((f) => f.type === 'eligible').map((f) => f.name);
  const cash = (o.prizes ?? []).reduce((sum, p) => sum + (p.cash ?? 0), 0);
  const team = o.regnRequirements?.max_team_size ? `**Team size:** ${o.regnRequirements.min_team_size ?? 1}–${o.regnRequirements.max_team_size}` : '';
  return {
    externalId: o.id,
    title: o.title,
    company: o.organisation?.name,
    applyUrl: o.seo_url ?? (o.public_url ? `https://unstop.com/${o.public_url}` : null),
    descriptionMd: [cash > 0 ? `**Prize pool:** ₹${cash.toLocaleString('en-IN')}` : '', team, htmlToMarkdown(o.details)].filter(Boolean).join('\n\n'),
    locations: [where],
    remote: online ? 'remote' : 'onsite',
    country: addr?.country?.iso ?? null,
    deadlineAt: o.regnRequirements?.end_regn_dt ?? o.end_date ?? null,
    type: kind,
    skills: (o.required_skills ?? []).map((s) => s.skill_name ?? s.skill ?? '').filter(Boolean),
    eligibility: { other: eligible.slice(0, 20) },
    structured: true,
  };
}

export const fetchUnstop: ProviderFetcher = async (source, ctx, feedUrl) => {
  const opportunity = (new URL(feedUrl).searchParams.get('opportunity') ?? 'hackathons') as keyof typeof UNSTOP_TYPES;
  const kind = UNSTOP_TYPES[opportunity] ?? 'hackathon';
  const maxPages = maxPagesOf(source, 5);
  const items: UnstopOpportunity[] = [];
  let total: number | null = null;
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL(feedUrl);
    u.searchParams.set('page', String(page));
    const { data } = await httpJson<UnstopResponse>(u.toString(), { headers: { accept: 'application/json' } });
    const pageData = data?.data;
    if (!Array.isArray(pageData?.data)) throw new SourceError('parse', 'Unstop response has no data.data[]', { url: u.toString() });
    total = pageData.total ?? total;
    items.push(...pageData.data);
    if (pageData.current_page >= pageData.last_page) break;
    if (ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
  }
  return result(items.map((o) => mapUnstop(o, kind)), source, ctx, total);
};

// ── HackerEarth ──────────────────────────────────────────────────────────────────────
interface HackerEarthEvent {
  title: string;
  description?: string;
  url: string;
  status?: string;
  challenge_type?: string;
  start_utc_tz?: string;
  end_utc_tz?: string;
  is_hackerearth?: boolean;
}
export const fetchHackerEarth: ProviderFetcher = async (source, ctx, feedUrl) => {
  const { data } = await httpJson<{ response?: HackerEarthEvent[] }>(feedUrl, { headers: { accept: 'application/json' } });
  if (!Array.isArray(data?.response)) throw new SourceError('parse', 'HackerEarth response has no response[]', { url: feedUrl });
  const raws = data.response.map((e): RawListing => {
    const start = parseLooseIso(e.start_utc_tz);
    return {
      externalId: e.url,
      title: e.title,
      company: 'HackerEarth',
      applyUrl: e.url,
      descriptionMd: [
        start ? `**Starts:** ${start.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '',
        e.challenge_type ? `**Format:** ${e.challenge_type}` : '',
        plainToMarkdown(stripTags(e.description)),
      ]
        .filter(Boolean)
        .join('\n\n'),
      locations: ['Online'],
      remote: 'remote',
      deadlineAt: parseLooseIso(e.end_utc_tz),
      type: 'hackathon',
      structured: true,
    };
  });
  return result(raws, source, ctx, raws.length);
};

// ── Kaggle ───────────────────────────────────────────────────────────────────────────
interface KaggleCompetition {
  id: number;
  competitionName: string;
  title: string;
  briefDescription?: string;
  dateEnabled?: string;
  deadline?: string;
  reward?: { id?: string; quantity?: number; clarification?: string } | string | null;
  numPrizes?: number;
  maxTeamSize?: number;
  categories?: { name?: string; displayName?: string }[];
  organization?: { name?: string } | null;
  hostName?: string;
}
interface KaggleResponse {
  competitions?: KaggleCompetition[];
  nextPageToken?: string;
  totalResults?: number;
}
export const KAGGLE_BODY = {
  selector: {
    competitionIds: [],
    listOption: 'LIST_OPTION_ACTIVE',
    sortOption: 'SORT_OPTION_NEWEST',
    hostSegmentIdFilter: 0,
    searchQuery: '',
    prestigeFilter: 'PRESTIGE_FILTER_UNSPECIFIED',
    participationFilter: 'PARTICIPATION_FILTER_UNSPECIFIED',
    tagIds: [],
    requireSimulations: false,
  },
  pageSize: 20,
};

function kaggleReward(reward: KaggleCompetition['reward']): string {
  if (!reward) return '';
  if (typeof reward === 'string') return reward;
  if (!reward.quantity) return '';
  const amount = `${reward.id === 'USD' ? '$' : ''}${reward.quantity.toLocaleString('en-US')}${reward.id && reward.id !== 'USD' ? ` ${reward.id}` : ''}`;
  return reward.clarification ? `${amount} (${reward.clarification})` : amount;
}

export const fetchKaggle: ProviderFetcher = async (source, ctx, feedUrl) => {
  const maxPages = maxPagesOf(source, 3);
  const items: KaggleCompetition[] = [];
  let total: number | null = null;
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const { data } = await httpJson<KaggleResponse>(feedUrl, {
      method: 'POST',
      // Browser-like UAs get an HTML consent page; the default bot UA gets JSON.
      headers: { accept: 'application/json' },
      body: pageToken ? { ...KAGGLE_BODY, pageToken } : KAGGLE_BODY,
    });
    if (!Array.isArray(data?.competitions)) throw new SourceError('parse', 'Kaggle response has no competitions[]', { url: feedUrl });
    total = data.totalResults ?? total;
    items.push(...data.competitions);
    pageToken = data.nextPageToken || undefined;
    if (!pageToken) break;
    if (ctx.detailDelayMs) await sleep(ctx.detailDelayMs);
  }
  const raws = items.map((c): RawListing => {
    const reward = kaggleReward(c.reward);
    const categories = (c.categories ?? []).map((cat) => cat.displayName ?? cat.name ?? '');
    return {
      externalId: c.id,
      title: c.title,
      company: c.organization?.name ?? c.hostName ?? 'Kaggle',
      applyUrl: `https://www.kaggle.com/competitions/${c.competitionName}`,
      descriptionMd: [
        c.briefDescription ? `**${c.briefDescription.trim()}**` : '',
        reward ? `**Prize:** ${reward}` : '',
        c.maxTeamSize ? `**Team size:** up to ${c.maxTeamSize}` : '',
        categories.length ? `**Topics:** ${categories.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      locations: ['Online'],
      remote: 'remote',
      postedAt: c.dateEnabled ?? null,
      deadlineAt: c.deadline ?? null,
      type: 'hackathon',
      skills: knownSkills(categories),
      eligibility: c.maxTeamSize ? { other: [`Teams of up to ${c.maxTeamSize}`] } : {},
      structured: true,
    };
  });
  return result(raws, source, ctx, total);
};
