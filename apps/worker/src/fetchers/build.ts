import {
  canonicaliseSkills,
  classifyRole,
  type DeadlineKind,
  type Eligibility,
  inferRemote,
  LIMITS,
  listingDraftSchema,
  normaliseCountry,
  normaliseLocation,
  type OpportunityType,
  type PayPeriod,
  parseDeadline,
  parseStipend,
  type RemoteMode,
  tryNormaliseUrl,
} from '@kestrel/shared';

import type { FetchSource, NormalisedListing } from './types.js';

export interface RawListing {
  externalId: string | number;
  title: string | null | undefined;
  company: string | null | undefined;
  applyUrl: string | null | undefined;
  descriptionMd?: string | null;
  locations?: readonly (string | null | undefined)[];
  /** Explicit remote mode, or a boolean "is remote" flag from the source. */
  remote?: RemoteMode | boolean | null;
  country?: string | null;
  postedAt?: Date | string | number | null;
  deadlineAt?: Date | string | number | null;
  /** Free-text deadline / date range ("Aug 26 - Oct 30, 2026"), parsed with the shared parser. */
  deadlineText?: string | null;
  deadlineKind?: DeadlineKind;
  /** Type fixed by the provider (hackathon APIs). */
  type?: OpportunityType | null;
  /** Employment-type strings that help inference ("Intern", "internship", "FullTime"). */
  typeHints?: readonly (string | null | undefined)[];
  stipend?: { min: number | null; max: number | null; currency: string | null; period: PayPeriod | null } | null;
  stipendText?: string | null;
  stipendDefaultCurrency?: string;
  skills?: readonly string[];
  skillsNice?: readonly string[];
  eligibility?: Partial<Eligibility>;
  companyDomain?: string | null;
  structured?: boolean;
  version?: string | null;
  /** Known posting re-listed without its detail (see NormalisedListing.partial). */
  partial?: boolean;
}

const TYPE_RULES: readonly [OpportunityType, RegExp][] = [
  ['hackathon', /\b(hackathon|hack ?day|hackfest|buildathon|ideathon|codathon)\b/i],
  ['scholarship', /\bscholarships?\b/i],
  ['opensource', /\b(gsoc|summer of code|outreachy|lfx mentorship|season of (docs|kde)|open[- ]source (program|programme|mentorship|fellowship))\b/i],
  ['fellowship', /\bfellowships?\b/i],
  ['internship', /\b(intern|interns|internship|internships|trainee|apprentice|apprenticeship|co-?op|industrial placement|summer analyst|summer associate)\b/i],
  ['research', /\b(research (assistant|associate|programme|program|fellow)|summer research|srfp|reu)\b/i],
];

/**
 * Opportunity type: provider-fixed type → source typeTag → title/employment-type rules
 * → `fulltime`.
 */
export function inferOpportunityType(
  title: string,
  hints: readonly (string | null | undefined)[] = [],
  typeTag: OpportunityType | null = null,
  fixed: OpportunityType | null = null,
): OpportunityType {
  if (fixed) return fixed;
  if (typeTag) return typeTag;
  const text = [title, ...hints.filter(Boolean)].join(' | ');
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type;
  return 'fulltime';
}

/** Accepts Date, ISO string, unix seconds or unix ms; returns null when unparseable. */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const trimmed = value.trim();
  if (/^\d{9,13}$/.test(trimmed)) return toDate(Number(trimmed));
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Absolute http(s) URL (protocol-relative "//host/x" upgraded to https), else null. */
export function absoluteHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return tryNormaliseUrl(url.toString()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanLine(text: string | null | undefined, max: number): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function uniqueLocations(raw: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const v = cleanLine(r, 200);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 50) break;
  }
  return out;
}

function resolveRemote(raw: RawListing, locations: string[], title: string): RemoteMode {
  if (typeof raw.remote === 'string') return raw.remote;
  const fromText = inferRemote([title, ...locations].join(' | '));
  if (raw.remote === true) return fromText === 'hybrid' ? 'hybrid' : 'remote';
  if (fromText !== 'unknown') return fromText;
  if (raw.remote === false) return locations.length > 0 ? 'onsite' : 'unknown';
  return 'unknown';
}

export type BuildOutcome = { ok: true; listing: NormalisedListing } | { ok: false; reason: string };

/**
 * Normalises one raw record into the shared listing shape and validates it with
 * `listingDraftSchema`. Invalid records (no title, bad apply URL, ...) are rejected with
 * a reason instead of throwing, so one bad posting never fails a whole source.
 */
export function buildListing(raw: RawListing, source: FetchSource, now: Date = new Date()): BuildOutcome {
  const title = cleanLine(raw.title, LIMITS.titleMax);
  const company = cleanLine(raw.company, LIMITS.companyMax) || cleanLine(source.name, LIMITS.companyMax);
  if (!title) return { ok: false, reason: `missing title (${String(raw.externalId)})` };
  if (!company) return { ok: false, reason: `missing company (${String(raw.externalId)})` };
  // Keep the URL as the source gave it (normalising can break hosts that need "www.");
  // the normalised form is only a dedupe key (`applyUrlKey`, set by ingest).
  const applyUrl = absoluteHttpUrl(raw.applyUrl);
  if (!applyUrl) {
    return { ok: false, reason: `invalid apply URL (${String(raw.externalId)})` };
  }

  const location = uniqueLocations(raw.locations ?? []);
  const remote = resolveRemote(raw, location, title);
  const firstCountry = location.map((l) => normaliseLocation(l).country).find((c) => c !== null) ?? null;
  const country =
    (raw.country ? normaliseCountry(raw.country) : null) ??
    firstCountry ??
    (source.country ? normaliseCountry(source.country) : null);

  let deadlineAt = toDate(raw.deadlineAt ?? null);
  let deadlineKind: DeadlineKind = raw.deadlineKind ?? (deadlineAt ? 'date' : 'unknown');
  if (!deadlineAt && raw.deadlineText) {
    const parsed = parseDeadline(raw.deadlineText, { now });
    if (parsed.kind === 'date') {
      deadlineAt = parsed.at;
      deadlineKind = 'date';
    } else if (parsed.kind === 'rolling') deadlineKind = 'rolling';
  }

  let stipend = raw.stipend ?? null;
  if (!stipend && raw.stipendText) {
    const parsed = parseStipend(raw.stipendText, raw.stipendDefaultCurrency ? { defaultCurrency: raw.stipendDefaultCurrency } : {});
    if (parsed.kind === 'amount') stipend = { min: parsed.min, max: parsed.max, currency: parsed.currency, period: parsed.period };
  }
  if (stipend && stipend.min !== null && stipend.max !== null && stipend.min > stipend.max) {
    stipend = { ...stipend, min: stipend.max, max: stipend.min };
  }

  const type = inferOpportunityType(title, raw.typeHints, source.typeTag, raw.type ?? null);
  const descriptionMd = (raw.descriptionMd ?? '').slice(0, LIMITS.descriptionMax);
  const companyDomain = cleanLine(raw.companyDomain ?? source.companyDomain ?? null, 253).toLowerCase() || null;

  const candidate = {
    type,
    title,
    company,
    companyDomain,
    location,
    remote,
    country,
    stipendMin: stipend?.min ?? null,
    stipendMax: stipend?.max ?? null,
    currency: stipend?.currency ?? null,
    period: stipend?.period ?? null,
    postedAt: toDate(raw.postedAt ?? null),
    deadlineAt,
    deadlineKind,
    eligibility: raw.eligibility ?? {},
    skillsRequired: canonicaliseSkills(raw.skills ?? []).slice(0, 100),
    skillsNice: canonicaliseSkills(raw.skillsNice ?? []).slice(0, 100),
    descriptionMd,
    applyUrl,
    sourceId: source.id,
    roleFamily: classifyRole(title)?.family ?? null,
  };
  const parsed = listingDraftSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `invalid listing ${String(raw.externalId)}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim() };
  }
  const {
    sourceId: _sourceId,
    embedding: _embedding,
    canonicalKey: _canonicalKey,
    contentHash: _contentHash,
    firstSeenAt: _firstSeenAt,
    lastSeenAt: _lastSeenAt,
    seenCount: _seenCount,
    ghostRisk: _ghostRisk,
    archived: _archived,
    ...rest
  } = parsed.data;
  return {
    ok: true,
    listing: {
      ...rest,
      externalId: String(raw.externalId),
      structured: raw.structured ?? true,
      version: raw.version ?? null,
      ...(raw.partial ? { partial: true } : {}),
    },
  };
}

/** Builds many raw records; returns valid listings plus one warning per rejected record. */
export function buildAll(
  raws: readonly RawListing[],
  source: FetchSource,
  now: Date,
  maxItems = Number.POSITIVE_INFINITY,
): { listings: NormalisedListing[]; warnings: string[] } {
  const listings: NormalisedListing[] = [];
  const warnings: string[] = [];
  for (const raw of raws) {
    if (listings.length >= maxItems) {
      warnings.push(`truncated at ${maxItems} listings`);
      break;
    }
    const outcome = buildListing(raw, source, now);
    if (outcome.ok) listings.push(outcome.listing);
    else warnings.push(outcome.reason);
  }
  return { listings, warnings };
}
