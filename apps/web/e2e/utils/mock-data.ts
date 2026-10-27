/**
 * World state for the Playwright-side fake API (`mock-api.ts`) plus one modifier per SPEC §8
 * edge case. Everything is built from `@kestrel/shared` fixtures and scoring, so the UI sees
 * the same shapes and the same fit maths as against the real API (docs/API.md).
 *
 * Dates in the shared fixtures are relative to FIXTURE_NOW; they are re-based onto the real
 * clock here, so the browser needs no fake timers.
 */
import {
  computeFit,
  DEFAULT_WEIGHTS,
  SOURCE_PACK_LABELS,
  SOURCE_PACK_IDS,
  type AlertRule,
  type FitResult,
  type Listing,
  type Notification,
  type Profile,
  type Settings,
  type SourceHealth,
  type SourceKind,
  type TrackerItem,
  type TrackerStage,
} from '@kestrel/shared';
import { FIXTURE_NOW, sampleListings, sampleProfiles } from '@kestrel/shared/fixtures';

// ── Small helpers ───────────────────────────────────────────────────────────

const DAY = 86_400_000;
/** Offset that moves fixture dates onto the wall clock of the test run. */
const SHIFT = Date.now() - FIXTURE_NOW.getTime();
export const now = () => new Date();
export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
const rebase = (d: Date | null | undefined): Date | null =>
  d ? new Date(d.getTime() + SHIFT) : null;

/** Deterministic 24-hex ObjectId-like id (the API only ever returns these). */
export function hexId(prefix: number, n: number): string {
  return prefix.toString(16).padStart(4, '0') + n.toString(16).padStart(20, '0');
}

export type ListingPublic = Omit<Listing, 'embedding' | 'contentHash'>;
export type OnboardingStep = 'consent' | 'resume' | 'preferences' | 'sources' | 'done';
export type AiMode = 'beacon' | 'byok' | 'off';

export interface FeedItemDTO {
  listing: ListingPublic;
  fit: FitResult | null;
  score: number | null;
  saved: boolean;
  hidden: boolean;
  trackerItemId: string | null;
}

export interface SourceDTO {
  id: string;
  url: string;
  name: string;
  kind: SourceKind;
  scope: 'personal' | 'community';
  ownerId: string | null;
  packId: string | null;
  typeTag: Listing['type'] | null;
  enabled: boolean;
  refreshInterval: '1h' | '6h' | 'daily' | 'weekly';
  health: SourceHealth;
  /** Worker detail next to `health` (docs/SHARED-REQUESTS.md qa → api #1). */
  healthCode: string | null;
  lastCheckedAt: Date | null;
  listingsFound: number;
  errorReason: string | null;
  config: { boardToken: string | null; feedUrl: string | null; provider: string | null };
  etag: null;
  lastModified: null;
  companyDomain: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PackDTO {
  id: string;
  name: string;
  sourceCount: number;
  kinds: Partial<Record<SourceKind, number>>;
  optional: boolean;
  enabled: boolean;
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
  message: string | null;
  valid: boolean;
  apiUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  finalUrl: string | null;
  config: { boardToken: string | null; feedUrl: string | null; provider: string | null };
}

export interface CreditsResponse {
  date: string;
  cloudUsedToday: number;
  cap: number;
  selfHostedUsedToday: number;
  backend: 'cloud' | 'selfhosted';
  userUsedToday: number;
}

export interface ResumeUploadOk {
  ok: true;
  body: {
    profile: Partial<Profile>;
    parsedFrom: 'deterministic' | 'llm';
    warnings: string[];
    sections: string[];
    skills: { canonical: string; matchedAlias: string; count: number }[];
    emails: string[];
    phones: string[];
    textChars: number;
    saved: boolean;
  };
}
export interface ResumeUploadFail {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export interface FixtureUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  onboardingStep: OnboardingStep;
  aiMode: AiMode | null;
  profileIndex: number | null;
  createdAt: Date;
}

export type TrackerItemDTO = TrackerItem & { history: { stage: TrackerStage; at: Date }[] };

/** An injected failure for one route: `'GET /v1/feed'` → 500 for the next `times` calls. */
export interface InjectedFailure {
  status: number;
  code: string;
  message: string;
  times: number;
}

export interface MockState {
  session: FixtureUser | null;
  /** Result of POST /v1/auth/google: who signs in, or the failure to return. */
  googleLogin: { user: FixtureUser; isNew: boolean } | { error: 'INVALID_GOOGLE_TOKEN' };
  profile: Profile | null;
  hasResume: boolean;
  settings: Settings;
  /** The ranked feed (already sorted by fit). Generated lazily for big scenarios. */
  feed: {
    total: number;
    warmingUp: boolean;
    item: (index: number) => FeedItemDTO;
    /**
     * When set, every page after the first starts with a copy of the previous page's last item
     * (same id), passed through this function: ranks shifting between requests.
     */
    repeatAcrossPages: ((item: FeedItemDTO) => FeedItemDTO) | null;
  };
  interactions: Map<string, { saved: boolean; hidden: boolean }>;
  tracker: TrackerItemDTO[];
  sources: SourceDTO[];
  packs: PackDTO[];
  credits: CreditsResponse;
  alerts: AlertRule[];
  notifications: Notification[];
  /** Detection answers by normalised input URL (no scheme, no trailing slash). */
  detect: Map<string, DetectResult>;
  /** POST /v1/sources conflicts: normalised URL → existing source id. */
  conflicts: Map<string, string>;
  resumeUpload: ResumeUploadOk | ResumeUploadFail;
  failures: Map<string, InjectedFailure>;
  /** Artificial latency for every response (ms). */
  latencyMs: number;
}

// ── Fixture users ───────────────────────────────────────────────────────────

export const fixtureUsers = {
  /** Onboarded full-stack student, Beacon AI with consent. The default. */
  aarav: {
    id: hexId(1, 1),
    email: 'aarav@beacon.test',
    name: 'Aarav Sharma',
    avatarUrl: null,
    role: 'user',
    onboardingStep: 'done',
    aiMode: 'beacon',
    profileIndex: 0,
    createdAt: daysFromNow(-20),
  },
  /** Brand-new account: signed in, nothing chosen yet (lands on consent). */
  newbie: {
    id: hexId(1, 2),
    email: 'new.student@beacon.test',
    name: 'Nisha Rao',
    avatarUrl: null,
    role: 'user',
    onboardingStep: 'consent',
    aiMode: null,
    profileIndex: null,
    createdAt: now(),
  },
  /** Onboarded with their own OpenAI-compatible key saved. */
  byok: {
    id: hexId(1, 3),
    email: 'meera@beacon.test',
    name: 'Meera Iyer',
    avatarUrl: null,
    role: 'user',
    onboardingStep: 'done',
    aiMode: 'byok',
    profileIndex: 1,
    createdAt: daysFromNow(-40),
  },
} as const satisfies Record<string, FixtureUser>;

export type FixtureUserName = keyof typeof fixtureUsers;

// ── Listings and the feed ───────────────────────────────────────────────────

const LISTING_PREFIX = 0x11;

function toPublic(l: Listing, id: string): ListingPublic {
  const { embedding: _e, contentHash: _c, ...rest } = l;
  return {
    ...rest,
    id,
    postedAt: rebase(l.postedAt),
    deadlineAt: rebase(l.deadlineAt),
    firstSeenAt: rebase(l.firstSeenAt) ?? now(),
    lastSeenAt: rebase(l.lastSeenAt) ?? now(),
    descriptionMd: l.descriptionMd.slice(0, 500),
  };
}

/** The 12 shared sample listings, re-based to today, with 24-hex ids. */
export const baseListings: readonly ListingPublic[] = sampleListings.map((l, i) =>
  toPublic(l, hexId(LISTING_PREFIX, i + 1)),
);

export function fitFor(listing: ListingPublic, profile: Profile | null): FitResult | null {
  if (!profile) return null;
  return computeFit({ profile, listing, weights: DEFAULT_WEIGHTS, now: now() });
}

export function feedItem(listing: ListingPublic, profile: Profile | null): FeedItemDTO {
  const fit = fitFor(listing, profile);
  return {
    listing,
    fit,
    score: fit?.score ?? null,
    saved: false,
    hidden: false,
    trackerItemId: null,
  };
}

function staticFeed(items: FeedItemDTO[]): MockState['feed'] {
  const sorted = [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return {
    total: sorted.length,
    warmingUp: false,
    item: (i) => sorted[i]!,
    repeatAcrossPages: null,
  };
}

/** Replace the feed with exactly these listings (sorted by fit). */
export function setFeed(state: MockState, listings: readonly ListingPublic[]): void {
  state.feed = staticFeed(listings.map((l) => feedItem(l, state.profile)));
}

// ── Sources, packs, credits ─────────────────────────────────────────────────

const SOURCE_PREFIX = 0x22;
const PACK_SIZES: Record<string, number> = {
  'top-indian-product': 48,
  'faang-plus-india': 106,
  'yc-startups-interns': 66,
  'hackathons-india': 25,
  'scholarships-engineering': 31,
  'remote-friendly-startups': 45,
  opensource: 17,
};

export function makeSource(n: number, over: Partial<SourceDTO> = {}): SourceDTO {
  return {
    id: hexId(SOURCE_PREFIX, n),
    url: 'https://boards.greenhouse.io/northwindlabs',
    name: 'Northwind Labs',
    kind: 'greenhouse',
    scope: 'personal',
    ownerId: fixtureUsers.aarav.id,
    packId: null,
    typeTag: null,
    enabled: true,
    refreshInterval: '6h',
    health: 'healthy',
    healthCode: 'ok',
    lastCheckedAt: daysFromNow(-0.05),
    listingsFound: 14,
    errorReason: null,
    config: { boardToken: 'northwindlabs', feedUrl: null, provider: null },
    etag: null,
    lastModified: null,
    companyDomain: 'northwind.example',
    createdAt: daysFromNow(-10),
    updatedAt: daysFromNow(-0.05),
    ...over,
  };
}

function defaultPacks(enabled: readonly string[]): PackDTO[] {
  return SOURCE_PACK_IDS.map((id) => ({
    id,
    name: SOURCE_PACK_LABELS[id],
    sourceCount: PACK_SIZES[id] ?? 20,
    kinds: {
      greenhouse: Math.round((PACK_SIZES[id] ?? 20) * 0.6),
      lever: Math.round((PACK_SIZES[id] ?? 20) * 0.4),
    },
    optional: false,
    enabled: enabled.includes(id),
  }));
}

export function utcDate(d = now()): string {
  return d.toISOString().slice(0, 10);
}

// ── Settings, profile, tracker ──────────────────────────────────────────────

export function defaultSettings(user: FixtureUser): Settings {
  const hasKey = user.aiMode === 'byok';
  return {
    userId: user.id,
    appearance: {
      theme: 'system',
      accent: 'default',
      density: 'comfortable',
      fontSize: 'md',
      reducedMotion: 'system',
    },
    ai: {
      provider: hasKey ? 'openai' : 'default',
      baseUrl: hasKey ? 'https://api.openai.com/v1' : null,
      model: hasKey ? 'gpt-4.1-mini' : null,
      hasKey,
      keyLast4: hasKey ? '3f9a' : null,
      enabled: user.aiMode !== 'off' && user.aiMode !== null,
      consentGivenAt: user.aiMode === 'beacon' ? daysFromNow(-20) : null,
    },
    notifications: {
      push: false,
      inapp: true,
      deadlineReminders: [7, 3, 1],
      nudges: true,
      digestTime: '09:00',
      quietHours: null,
      timezone: 'Asia/Kolkata',
    },
    privacy: { sendResumeToAi: user.aiMode === 'beacon' },
    weights: { ...DEFAULT_WEIGHTS },
  };
}

const TRACKER_PREFIX = 0x33;

export function trackerItemFor(
  listing: ListingPublic,
  stage: TrackerStage,
  position: number,
  n: number,
): TrackerItemDTO {
  const at = daysFromNow(-12);
  return {
    id: hexId(TRACKER_PREFIX, n),
    userId: fixtureUsers.aarav.id,
    listingId: listing.id,
    title: listing.title,
    company: listing.company,
    type: listing.type,
    applyUrl: listing.applyUrl,
    deadlineAt: listing.deadlineAt,
    sourceId: listing.sourceId,
    stage,
    position,
    notes: '',
    contacts: [],
    documents: [],
    appliedAt: stage === 'saved' ? null : at,
    lastActivityAt: at,
    nudges: [],
    createdAt: at,
    updatedAt: at,
    history: [{ stage, at }],
  };
}

// ── The default world ───────────────────────────────────────────────────────

export function createState(user: FixtureUser | null = fixtureUsers.aarav): MockState {
  const profileUser = user ?? fixtureUsers.aarav;
  const profile =
    profileUser.profileIndex === null
      ? null
      : { ...sampleProfiles[profileUser.profileIndex]!, userId: profileUser.id };
  const state: MockState = {
    session: user,
    googleLogin: {
      user: user ?? fixtureUsers.aarav,
      isNew: (user ?? fixtureUsers.aarav).onboardingStep === 'consent',
    },
    profile,
    hasResume: profile !== null,
    settings: defaultSettings(profileUser),
    feed: staticFeed([]),
    interactions: new Map(),
    tracker: [],
    sources: [makeSource(1)],
    packs: defaultPacks(['top-indian-product', 'hackathons-india']),
    credits: {
      date: utcDate(),
      cloudUsedToday: 312,
      cap: 500,
      selfHostedUsedToday: 0,
      backend: 'cloud',
      userUsedToday: 9,
    },
    alerts: [],
    notifications: [],
    detect: new Map(),
    conflicts: new Map(),
    resumeUpload: resumeOk(sampleProfiles[0]!),
    failures: new Map(),
    latencyMs: 0,
  };
  setFeed(state, baseListings);
  const [first, second, third] = baseListings;
  if (first && second && third) {
    state.tracker = [
      trackerItemFor(first, 'saved', 0, 1),
      trackerItemFor(second, 'saved', 1, 2),
      trackerItemFor(third, 'applied', 0, 3),
    ];
  }
  return state;
}

export function resumeOk(profile: Profile): ResumeUploadOk {
  return {
    ok: true,
    body: {
      profile,
      parsedFrom: 'deterministic',
      warnings: [],
      sections: ['summary', 'education', 'experience', 'projects', 'skills', 'links'],
      skills: profile.skills.map((s) => ({ canonical: s.name, matchedAlias: s.name, count: 1 })),
      emails: ['student@beacon.test'],
      phones: [],
      textChars: 3200,
      saved: false,
    },
  };
}

// ── SPEC §8 edge cases ──────────────────────────────────────────────────────
// Each modifier mutates the state; call it before the page loads, or mid-test followed by
// a refetch trigger (navigation, focus, or the UI's own Retry).

const first = (): ListingPublic => baseListings[0]!;

/** Resume parses, but there is no skills section: no skills, a warning. */
export function resumeWithNoSkills(state: MockState): void {
  const p = sampleProfiles[0]!;
  state.resumeUpload = {
    ok: true,
    body: {
      ...resumeOk(p).body,
      profile: { ...p, skills: [] },
      sections: ['summary', 'education', 'experience', 'links'],
      skills: [],
      warnings: ['No skills section found'],
    },
  };
}

/** Resume text is mostly Devanagari: no sections, no grad year, a language warning. */
export function resumeNonEnglish(state: MockState): void {
  state.resumeUpload = {
    ok: true,
    body: {
      profile: {
        headline: null,
        summary: null,
        skills: [],
        education: [],
        experience: [],
        projects: [],
        links: [],
      },
      parsedFrom: 'deterministic',
      warnings: ['Most of this resume is not in English, so only links and dates were read.'],
      sections: [],
      skills: [],
      emails: ['vidyarthi@beacon.test'],
      phones: [],
      textChars: 2100,
      saved: false,
    },
  };
}

/** Scanned (image-only) PDF: 422 RESUME_NO_TEXT. */
export function resumeScanned(state: MockState): void {
  state.resumeUpload = {
    ok: false,
    status: 422,
    code: 'RESUME_NO_TEXT',
    message: 'This PDF has no readable text',
  };
}

/** A rolling deadline and an unknown deadline at the top of the feed. */
export function listingsWithNoDeadline(state: MockState): {
  rolling: ListingPublic;
  unknown: ListingPublic;
} {
  const rolling: ListingPublic = {
    ...first(),
    id: hexId(LISTING_PREFIX, 0x101),
    title: 'Open Source Mentorship (rolling intake)',
    deadlineAt: null,
    deadlineKind: 'rolling',
  };
  const unknown: ListingPublic = {
    ...baseListings[1]!,
    id: hexId(LISTING_PREFIX, 0x102),
    title: 'Research Assistant, Speech Lab',
    deadlineAt: null,
    deadlineKind: 'unknown',
  };
  setFeed(state, [rolling, unknown, ...baseListings.slice(2)]);
  return { rolling, unknown };
}

/** A listing whose deadline passed 3 days ago (the API returns it with includeExpired / saved). */
export function listingPastDeadline(state: MockState): ListingPublic {
  const closed: ListingPublic = {
    ...first(),
    id: hexId(LISTING_PREFIX, 0x103),
    title: 'Winter Analytics Intern',
    deadlineAt: daysFromNow(-3),
    deadlineKind: 'date',
  };
  const item = { ...feedItem(closed, state.profile), saved: true };
  const rest = baseListings.slice(1).map((l) => feedItem(l, state.profile));
  state.feed = staticFeed([...rest]);
  // Pin the closed one first regardless of its capped score, as a saved view would show it.
  const sorted = [item, ...rest.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))];
  state.feed.item = (i) => sorted[i]!;
  state.feed.total = sorted.length;
  state.interactions.set(closed.id, { saved: true, hidden: false });
  return closed;
}

/**
 * The same listing (same id; the apply URL differs only by tracking params) is returned at the
 * end of one page and again at the start of the next, as happens when ranks shift between
 * requests. Works for any page size the client asks for (≤ 100).
 */
export function duplicateListingAcrossPages(state: MockState): void {
  setFeed(state, generatedListings(130));
  state.feed.repeatAcrossPages = (item) => ({
    ...item,
    listing: {
      ...item.listing,
      applyUrl: `${item.listing.applyUrl}${item.listing.applyUrl.includes('?') ? '&' : '?'}utm_source=newsletter&utm_medium=email&gh_src=abc123`,
    },
  });
}

const norm = (url: string) =>
  url
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
export { norm as normaliseInputUrl };

/** Adding `https://boards.greenhouse.io/northwindlabs?utm_source=x` when the plain URL exists. */
export function duplicateSourceUrl(state: MockState): string {
  const existing = state.sources[0]!;
  const withParams = `${existing.url}?utm_source=linkedin&gh_src=1a2b`;
  state.detect.set(norm(withParams), {
    ...detectOk(existing.url, 'greenhouse', 'northwindlabs', 'Northwind Labs', 14),
    url: existing.url,
  });
  state.conflicts.set(norm(existing.url), existing.id);
  state.conflicts.set(norm(withParams), existing.id);
  return withParams;
}

export function detectOk(
  url: string,
  kind: SourceKind,
  token: string | null,
  company: string,
  count: number,
): DetectResult {
  return {
    url,
    kind,
    confidence: 0.98,
    boardToken: token,
    company,
    name: `${company} careers`,
    previewCount: count,
    sampleTitles: [
      'Software Engineer Intern',
      'Data Analyst Intern',
      'Product Design Intern',
    ].slice(0, Math.min(3, count)),
    costsCredits: kind === 'firecrawl',
    message: null,
    valid: true,
    apiUrl: token ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs` : null,
    companyName: company,
    companyDomain: `${token ?? 'acme'}.example`,
    finalUrl: null,
    config: { boardToken: token, feedUrl: null, provider: null },
  };
}

/** `acme.dev/jobs` 301s to `https://boards.greenhouse.io/acmedev` (detected after the redirect). */
export function redirectingSource(state: MockState): { input: string; finalUrl: string } {
  const input = 'https://acme.dev/jobs';
  const finalUrl = 'https://boards.greenhouse.io/acmedev';
  state.detect.set(norm(input), {
    ...detectOk(input, 'greenhouse', 'acmedev', 'Acme Dev', 23),
    finalUrl,
  });
  return { input, finalUrl };
}

/** `boards.greenhouse.io/<wrong token>`: the pattern matches, the board does not exist. */
export function wrongAtsToken(state: MockState): string {
  const input = 'https://boards.greenhouse.io/northwnd-labs-typo';
  state.detect.set(norm(input), {
    ...detectOk(input, 'greenhouse', 'northwnd-labs-typo', 'northwnd-labs-typo', 0),
    valid: false,
    previewCount: 0,
    sampleTitles: [],
    confidence: 0.9,
    message: 'No Greenhouse board called “northwnd-labs-typo”.',
  });
  return input;
}

/** A personal crawl source exists and credits are close to the cap (call `exhaustCredits` mid-run). */
export function crawlSourceNearCap(state: MockState): SourceDTO {
  const src = makeSource(2, {
    url: 'https://acme.dev/careers',
    name: 'Acme careers',
    kind: 'firecrawl',
    config: { boardToken: null, feedUrl: null, provider: null },
    healthCode: 'ok',
  });
  state.sources = [src, ...state.sources];
  state.credits = { ...state.credits, cloudUsedToday: 497, userUsedToday: 31 };
  return src;
}

/** Firecrawl quota exhausted mid-run: cap reached, crawl sources paused (`paused:credits`). */
export function exhaustCredits(state: MockState): void {
  state.credits = { ...state.credits, cloudUsedToday: state.credits.cap };
  state.sources = state.sources.map((s) =>
    s.kind === 'firecrawl'
      ? {
          ...s,
          health: 'degraded',
          healthCode: 'paused:credits',
          errorReason: "Today's crawl budget is used up. This source refreshes after 00:00 IST.",
          updatedAt: now(),
        }
      : s,
  );
}

/** The BYOK key disappears server-side (removed in another tab or by the user). */
export function removeApiKey(state: MockState): void {
  const enabled = state.session?.aiMode === 'beacon';
  state.settings = {
    ...state.settings,
    ai: {
      ...state.settings.ai,
      provider: 'default',
      baseUrl: null,
      model: null,
      hasKey: false,
      keyLast4: null,
      enabled,
    },
  };
}

export function setTimezone(state: MockState, timezone: string): void {
  state.settings = {
    ...state.settings,
    notifications: { ...state.settings.notifications, timezone },
  };
}

export const LONG_COMPANY =
  'The Extraordinarily Long-Named International Consortium for Collaborative Research, Applied Engineering, Open Source Stewardship and Student Outreach Programmes (Asia-Pacific and Indian Subcontinent Regional Office) Private Limited';
export const LONG_TITLE =
  'Senior Associate Platform Reliability and Developer Productivity Engineering Intern, Distributed Systems Infrastructure (Summer 2027, Hybrid)';

export function veryLongCompanyNames(state: MockState): ListingPublic {
  const long: ListingPublic = {
    ...first(),
    id: hexId(LISTING_PREFIX, 0x104),
    company: LONG_COMPANY,
    title: LONG_TITLE,
  };
  setFeed(state, [long, ...baseListings.slice(1)]);
  return long;
}

export const EMOJI_TITLE = '🚀 Rust 🦀 Systems Intern · 🧑🏽‍💻 Hack Week 🇮🇳';

export function emojiTitles(state: MockState): ListingPublic {
  const emoji: ListingPublic = {
    ...first(),
    id: hexId(LISTING_PREFIX, 0x105),
    title: EMOJI_TITLE,
    company: 'Kōan Labs ✨ (formerly Ångström)',
  };
  setFeed(state, [emoji, ...baseListings.slice(1)]);
  return emoji;
}

/** Ranking finished and nothing matched. */
export function zeroMatches(state: MockState): void {
  state.feed = staticFeed([]);
}

/** n synthetic listings derived from the 12 samples (unique ids, titles and keys). */
export function generatedListings(n: number): ListingPublic[] {
  const out: ListingPublic[] = [];
  for (let i = 0; i < n; i++) {
    const base = baseListings[i % baseListings.length]!;
    out.push({
      ...base,
      id: hexId(LISTING_PREFIX + 1, i + 1),
      title: `${base.title} #${i + 1}`,
      canonicalKey: `${base.canonicalKey}#${i + 1}`,
    });
  }
  return out;
}

/** 5,000 ranked matches, generated lazily per page (fit computed per item on demand). */
export function fiveThousandMatches(state: MockState, total = 5000): void {
  const profile = state.profile;
  const cache = new Map<number, FeedItemDTO>();
  state.feed = {
    total,
    warmingUp: false,
    repeatAcrossPages: null,
    item: (i) => {
      const hit = cache.get(i);
      if (hit) return hit;
      const base = baseListings[i % baseListings.length]!;
      const listing: ListingPublic = {
        ...base,
        id: hexId(LISTING_PREFIX + 2, i + 1),
        title: `${base.title} #${i + 1}`,
        canonicalKey: `${base.canonicalKey}#${i + 1}`,
      };
      const fit = fitFor(listing, profile);
      // Monotone descending scores so the order is stable and plausible.
      const score = Math.max(1, 99 - Math.floor((i * 98) / total));
      const item: FeedItemDTO = {
        listing,
        fit: fit ? { ...fit, score } : null,
        score,
        saved: false,
        hidden: false,
        trackerItemId: null,
      };
      cache.set(i, item);
      return item;
    },
  };
}

/** Warming-up radar: no match docs yet, rows have no fit. */
export function warmingUp(state: MockState): void {
  const items = baseListings.map((l) => ({ ...feedItem(l, null) }));
  state.feed = { ...staticFeed(items), warmingUp: true };
}

export function failNext(
  state: MockState,
  route: string,
  status = 500,
  times = 1,
  code = 'INTERNAL',
): void {
  state.failures.set(route, {
    status,
    code,
    message: status === 503 ? 'Service unavailable' : 'Internal server error',
    times,
  });
}

export function sampleNotification(
  state: MockState,
  over: Partial<Notification> = {},
): Notification {
  const n: Notification = {
    id: hexId(0x44, state.notifications.length + 1),
    userId: state.session?.id ?? fixtureUsers.aarav.id,
    kind: 'deadline',
    title: 'Closes tomorrow: Full-stack Developer Intern',
    body: 'Razorleaf Payments. Fit 86.',
    url: null,
    listingId: baseListings[0]!.id,
    trackerItemId: null,
    alertRuleId: null,
    channels: ['inapp'],
    readAt: null,
    createdAt: daysFromNow(-0.1),
    ...over,
  };
  state.notifications.unshift(n);
  return n;
}
