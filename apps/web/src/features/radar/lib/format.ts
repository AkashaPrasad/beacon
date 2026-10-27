/**
 * Display strings for listing rows and the drawer (DESIGN §2: Indian number formatting, mono units;
 * §8: calm, specific copy). Pure functions so rows stay cheap to render.
 */
import type { GhostReason, ListingPublic } from '@kestrel/shared';
import { formatInr, formatInrShort, formatRelative, ghostLevelOf, GHOST_META } from '@kestrel/ui';

type StipendFields = Pick<ListingPublic, 'stipendMin' | 'stipendMax' | 'currency' | 'period' | 'type'>;

const PERIOD_SUFFIX: Record<string, string> = {
  hour: '/hr',
  day: '/day',
  week: '/wk',
  month: '/mo',
  year: '/yr',
  total: '',
};

const symbolCache = new Map<string, Intl.NumberFormat>();
function foreign(amount: number, currency: string, short: boolean): string {
  const key = `${currency}:${short}`;
  let f = symbolCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: short && amount >= 1000 ? 1 : 0,
      notation: short && amount >= 10_000 ? 'compact' : 'standard',
    });
    symbolCache.set(key, f);
  }
  return f.format(amount);
}

function money(amount: number, currency: string | null, short: boolean): string {
  if (!currency || currency === 'INR') return short ? formatInrShort(amount) : formatInr(amount);
  try {
    return foreign(amount, currency, short);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

/**
 * `₹45k/mo` (rows, `short`) or `₹45,000/mo` (drawer). Ranges: `₹30k–40k/mo`. Lump sums read as what
 * they are: hackathon `₹5L prizes`, scholarship `₹50k award`. Null when no amount is known.
 */
export function stipendText(listing: StipendFields, { short = true }: { short?: boolean } = {}): string | null {
  const { stipendMin, stipendMax, currency, period, type } = listing;
  const low = stipendMin ?? stipendMax;
  const high = stipendMax ?? stipendMin;
  if (low == null || high == null || high <= 0) return null;
  const range =
    low === high ? money(high, currency, short) : `${money(low, currency, short)}–${money(high, currency, short).replace(/^[^\d]+/, '')}`;
  if (period === 'total' || period == null) {
    if (type === 'hackathon') return `${range} prizes`;
    if (type === 'scholarship' || type === 'fellowship') return `${range} award`;
    if (type === 'opensource') return `${range} stipend`;
    return range;
  }
  return `${range}${PERIOD_SUFFIX[period] ?? ''}`;
}

function city(location: string): string {
  return location.split(',')[0]?.trim() ?? location;
}

/** `Remote` · `Hybrid · Bengaluru` · `Pune` · `Bengaluru +1` · `Online`. */
export function locationText(listing: Pick<ListingPublic, 'remote' | 'location'>): string {
  const places = listing.location
    .map(city)
    .filter((place) => place && !/^remote$/i.test(place));
  const first = places[0];
  const more = places.length > 1 ? ` +${places.length - 1}` : '';
  switch (listing.remote) {
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return first ? `Hybrid · ${first}${more}` : 'Hybrid';
    case 'onsite':
      return first ? `${first}${more}` : 'On-site';
    case 'unknown':
      return first ? `${first}${more}` : listing.location.some((l) => /remote/i.test(l)) ? 'Remote' : 'Location not stated';
  }
}

/** `2d ago` (posted date, else first seen). */
export function postedText(listing: Pick<ListingPublic, 'postedAt' | 'firstSeenAt'>, now: Date): string {
  return formatRelative(listing.postedAt ?? listing.firstSeenAt, now);
}

const ATS_LABELS: [RegExp, string][] = [
  [/greenhouse\.io$/i, 'Greenhouse'],
  [/lever\.co$/i, 'Lever'],
  [/ashbyhq\.com$/i, 'Ashby'],
  [/smartrecruiters\.com$/i, 'SmartRecruiters'],
  [/workable\.com$/i, 'Workable'],
  [/myworkdayjobs\.com$/i, 'Workday'],
  [/devfolio\.co$/i, 'Devfolio'],
  [/unstop\.com$/i, 'Unstop'],
  [/devpost\.com$/i, 'Devpost'],
];

/**
 * Source badge text. The feed has no source name yet (requested in SHARED-REQUESTS "web → api"), so
 * the apply host stands in: ATS hosts get their product name, other hosts their bare domain.
 */
export function sourceLabel(listing: Pick<ListingPublic, 'applyUrl'>, source?: { name: string } | null): string {
  if (source?.name) return source.name;
  try {
    const host = new URL(listing.applyUrl).hostname.replace(/^www\./, '');
    return ATS_LABELS.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return 'Source';
  }
}

/** Host of the apply link (drawer "Apply link" line). */
export function applyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** DESIGN §8 #16: "Likely ghost: posted 63 days ago, reposted 4 times, apply link redirects to the homepage." */
export function ghostTooltip(score: number, reasons: readonly GhostReason[]): string {
  const { label } = GHOST_META[ghostLevelOf(score)];
  if (!reasons.length) return `${label}.`;
  return `${label}: ${reasons.map((r) => lowerFirst(r.message.replace(/\.$/, ''))).join(', ')}.`;
}

/** Truncate for toasts (DESIGN §8 rule 8: toasts ≤ 12 words). */
export function shortTitle(title: string, max = 42): string {
  const clean = title.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** `5,000` (QA: `toLocaleString('en-IN')`). */
export function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}
