/**
 * In-memory radar data for MSW (`VITE_MOCK_API=1`): ≥ 60 listings with the edge cases the screens
 * must survive (no deadline, rolling, past deadline, due within hours, emoji in title, very long
 * company and title, ghost risk, hard-fail eligibility, unpaid), plus a 5,000-item scenario for the
 * scroll-performance test. Dates are relative to the moment the module loads, so the fixtures never
 * go stale. Everything is fictional.
 *
 * Scenario switch (read on every request, so Playwright can flip it with an init script):
 *   localStorage['beacon:mock:radar'] = 'default' | 'large' | 'warming' | 'empty' | 'error' | 'returning'
 */
import {
  computeFit,
  type FitResult,
  type Listing,
  type ListingPublic,
  type OpportunityType,
  type RemoteMode,
} from '@kestrel/shared';
import { FIXTURE_NOW, sampleListings, sampleProfiles } from '@kestrel/shared/fixtures';

export type RadarScenario = 'default' | 'large' | 'warming' | 'empty' | 'error' | 'returning';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const PROFILE = sampleProfiles[0]!;

export function readScenario(): RadarScenario {
  try {
    const value = globalThis.localStorage?.getItem('beacon:mock:radar');
    if (
      value === 'large' ||
      value === 'warming' ||
      value === 'empty' ||
      value === 'error' ||
      value === 'returning'
    ) {
      return value;
    }
  } catch {
    // Storage blocked: use the default scenario.
  }
  return 'default';
}

export function readWarmingMs(): number {
  try {
    const raw = Number(globalThis.localStorage?.getItem('beacon:mock:warmMs'));
    if (Number.isFinite(raw) && raw > 0) return raw;
  } catch {
    // ignore
  }
  return 25_000;
}

// ── Deterministic pseudo-randomness ──────────────────────────────────────────

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(seed: string): number {
  return (hash(seed) % 10_000) / 10_000;
}
function pick<T>(items: readonly T[], seed: string): T {
  return items[hash(seed) % items.length]!;
}

// ── Templates ────────────────────────────────────────────────────────────────

const COMPANIES = [
  ['Northwind Labs', 'northwindlabs.example'],
  ['Meridian AI Lab', 'meridian.example'],
  ['Kaveri Robotics', 'kaveri.example'],
  ['Saffron Pay', 'saffronpay.example'],
  ['Lotus Logistics', 'lotuslogistics.example'],
  ['Banyan Health', 'banyanhealth.example'],
  ['Indigo Maps', 'indigomaps.example'],
  ['Peacock Media', 'peacock.example'],
  ['Teak Systems', 'teak.example'],
  ['Monsoon Cloud', 'monsooncloud.example'],
  ['Neem Analytics', 'neem.example'],
  ['Coral Security', 'coralsec.example'],
] as const;

const TITLES: Record<OpportunityType, readonly string[]> = {
  internship: [
    'Platform Engineering Intern',
    'Frontend Engineering Intern (React)',
    'Backend Intern, Payments',
    'Data Engineering Intern',
    'SDE Intern, Summer 2027',
    'Full-stack Intern (Node.js + MongoDB)',
    'Mobile Developer Intern (React Native)',
    'DevOps Intern',
  ],
  fulltime: ['Software Engineer I', 'Associate Product Engineer', 'Graduate Engineer Trainee'],
  hackathon: ['Monsoon Hack 2026', 'Fintech Build Sprint', 'Open Data Hack Weekend'],
  scholarship: ['Women in Engineering Scholarship', 'First-generation Learner Grant'],
  fellowship: ['Public Interest Tech Fellowship', 'Climate Data Fellowship'],
  research: ['Undergraduate Research Assistant, Systems Lab', 'Summer Research Intern, HCI'],
  opensource: ['Open Source Mentorship: Developer Tools', 'Docs Season Contributor'],
};

const SKILL_SETS = [
  ['JavaScript', 'React', 'TypeScript'],
  ['Node.js', 'Express', 'MongoDB'],
  ['Go', 'PostgreSQL', 'Docker'],
  ['Python', 'SQL', 'Pandas'],
  ['React', 'Tailwind CSS', 'Git'],
  ['Kubernetes', 'Docker', 'Terraform'],
  ['Java', 'Spring Boot', 'AWS'],
] as const;

const LOCATIONS: readonly [string[], RemoteMode][] = [
  [['Bengaluru, Karnataka'], 'hybrid'],
  [['Remote, India'], 'remote'],
  [['Pune, Maharashtra'], 'onsite'],
  [['Hyderabad'], 'onsite'],
  [['Remote'], 'remote'],
  [['Mumbai'], 'hybrid'],
  [['Chennai'], 'onsite'],
  [['Delhi NCR', 'Gurugram'], 'hybrid'],
];

const TYPE_CYCLE: readonly OpportunityType[] = [
  'internship',
  'internship',
  'internship',
  'hackathon',
  'internship',
  'fulltime',
  'scholarship',
  'internship',
  'research',
  'opensource',
  'fellowship',
  'hackathon',
];

const SOURCES = [
  { id: 'src_greenhouse_pack', name: 'Greenhouse · Top Indian product', kind: 'greenhouse', scope: 'community' },
  { id: 'src_lever_pack', name: 'Lever · YC startups', kind: 'lever', scope: 'community' },
  { id: 'src_devfolio', name: 'Devfolio hackathons', kind: 'publicapi', scope: 'community' },
  { id: 'src_rss_scholarships', name: 'Scholarships feed', kind: 'rss', scope: 'community' },
  { id: 'src_personal_acme', name: 'Acme careers', kind: 'firecrawl', scope: 'personal' },
] as const;

export type MockSource = (typeof SOURCES)[number];

function sourceFor(type: OpportunityType, seed: string): MockSource {
  if (type === 'hackathon') return SOURCES[2];
  if (type === 'scholarship' || type === 'fellowship') return SOURCES[3];
  return pick([SOURCES[0], SOURCES[1], SOURCES[4]], seed);
}

function istEndOfDay(ms: number): Date {
  const ist = new Date(ms + 5.5 * HOUR);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 23, 59, 59, 999) - 5.5 * HOUR,
  );
}

function publicOf(listing: Listing): ListingPublic {
  const { embedding: _embedding, contentHash: _hash, ...rest } = listing;
  return rest;
}

function shift(date: Date | null, delta: number): Date | null {
  return date ? new Date(date.getTime() + delta) : null;
}

/** The 12 shared fixtures, shifted so FIXTURE_NOW becomes `now`. */
function shiftedSamples(now: number): ListingPublic[] {
  const delta = now - FIXTURE_NOW.getTime();
  return sampleListings.map((l) => ({
    ...publicOf(l),
    postedAt: shift(l.postedAt, delta),
    deadlineAt: shift(l.deadlineAt, delta),
    firstSeenAt: shift(l.firstSeenAt, delta)!,
    lastSeenAt: shift(l.lastSeenAt, delta)!,
  }));
}

interface GeneratedSpec {
  index: number;
  now: number;
  suffix?: string;
}

function generated({ index, now, suffix = '' }: GeneratedSpec): ListingPublic {
  const seed = `gen-${index}${suffix}`;
  const type = TYPE_CYCLE[index % TYPE_CYCLE.length]!;
  const [company, domain] = COMPANIES[index % COMPANIES.length]!;
  const title = pick(TITLES[type], `${seed}-title`);
  const [location, remote] = pick(LOCATIONS, `${seed}-loc`);
  const skills = pick(SKILL_SETS, `${seed}-skills`);
  const nice = pick(SKILL_SETS, `${seed}-nice`).filter((s) => !skills.includes(s as never));
  const postedDaysAgo = Math.floor(rand(`${seed}-posted`) * 50);
  // Spread deadlines from 9 days ago to 60 days ahead; every 9th is rolling, every 13th unknown.
  const rolling = index % 9 === 4;
  const unknown = index % 13 === 7;
  const deadlineDays = Math.round(rand(`${seed}-deadline`) * 69) - 9;
  const deadlineAt = rolling || unknown ? null : istEndOfDay(now + deadlineDays * DAY);
  const paid = type === 'internship' || type === 'fulltime' || type === 'fellowship' || type === 'research';
  const stipend = paid ? (type === 'fulltime' ? 0 : 10_000 + Math.round(rand(`${seed}-pay`) * 8) * 5_000) : 0;
  const firstSeenAt = new Date(now - postedDaysAgo * DAY + 2 * HOUR);
  const ghostScore =
    postedDaysAgo > 40 ? 62 + Math.round(rand(`${seed}-ghost`) * 20) : postedDaysAgo > 25 ? 35 : 5;
  const ghostReasons =
    ghostScore >= 60
      ? [
          { code: 'age' as const, message: `Posted ${postedDaysAgo} days ago`, points: 30 },
          { code: 'reposted' as const, message: 'Reposted 4 times', points: 20 },
          { code: 'apply_link_redirect_home' as const, message: 'Apply link redirects to the homepage', points: 15 },
        ]
      : ghostScore >= 30
        ? [{ code: 'age' as const, message: `Posted ${postedDaysAgo} days ago`, points: 30 }]
        : [];
  const gradYears = index % 17 === 3 ? [2025] : index % 5 === 0 ? [2026, 2027] : [];
  return {
    id: `lst_gen_${String(index).padStart(4, '0')}${suffix}`,
    type,
    title: suffix ? `${title} · ${suffix.replace(/^_/, '#')}` : title,
    company,
    companyDomain: domain,
    location,
    remote,
    country: 'IN',
    stipendMin: type === 'fulltime' ? 900_000 : stipend || null,
    stipendMax: type === 'fulltime' ? 1_400_000 : stipend || null,
    currency: stipend || type === 'fulltime' ? 'INR' : null,
    period: type === 'fulltime' ? 'year' : stipend ? 'month' : null,
    postedAt: new Date(now - postedDaysAgo * DAY),
    deadlineAt,
    eligibility: { gradYears, degrees: [], minExperienceYears: null, citizenship: [], other: [] },
    skillsRequired: [...skills],
    skillsNice: nice.slice(0, 2),
    descriptionMd: `## About the role\nJoin ${company} to work on ${skills.join(', ')}.\n\n## You have\n- ${skills.join('\n- ')}\n\n## Nice to have\n- ${nice.slice(0, 2).join('\n- ') || 'Curiosity'}`,
    applyUrl: `https://${domain}/careers/${index}${suffix}`,
    sourceId: sourceFor(type, seed).id,
    canonicalKey: `${company}|${title}|${location[0] ?? ''}|${index}${suffix}`.toLowerCase(),
    firstSeenAt,
    lastSeenAt: new Date(now - HOUR),
    seenCount: 1 + (index % 4),
    ghostRisk: { score: ghostScore, reasons: ghostReasons },
    deadlineKind: rolling ? 'rolling' : unknown ? 'unknown' : 'date',
    archived: false,
    roleFamily: null,
  };
}

/** Hand-written edge cases on top of the shared fixtures. */
function edgeCases(now: number): ListingPublic[] {
  const base = generated({ index: 1000, now });
  return [
    {
      ...base,
      id: 'lst_edge_due_hours',
      type: 'hackathon',
      title: 'Registration closing: Night Owl Hack',
      company: 'Night Owl Collective',
      companyDomain: 'nightowl.example',
      deadlineAt: new Date(now + 5 * HOUR),
      deadlineKind: 'date',
      postedAt: new Date(now - 9 * DAY),
      applyUrl: 'https://nightowl.example/register',
      sourceId: 'src_devfolio',
    },
    {
      ...base,
      id: 'lst_edge_due_soon',
      type: 'internship',
      title: 'Backend Engineering Intern (Go, Postgres)',
      company: 'Northwind Labs',
      companyDomain: 'northwindlabs.example',
      skillsRequired: ['Go', 'PostgreSQL', 'Docker'],
      deadlineAt: istEndOfDay(now + 2 * DAY),
      deadlineKind: 'date',
      applyUrl: 'https://northwindlabs.example/careers/backend-intern',
    },
    {
      ...base,
      id: 'lst_edge_long_title',
      title:
        'Graduate Software Engineering Intern — Distributed Systems, Storage, Observability and Developer Productivity (Hybrid, 6 months, PPO possible)',
      company: 'Teak Systems',
      companyDomain: 'teak.example',
      deadlineAt: istEndOfDay(now + 16 * DAY),
      applyUrl: 'https://teak.example/careers/long',
    },
    {
      ...base,
      id: 'lst_edge_emoji',
      type: 'scholarship',
      title: '🎓 STEM Futures Scholarship ✨ 2027',
      company: 'Futures Trust',
      companyDomain: 'futurestrust.example',
      stipendMin: 75_000,
      stipendMax: 75_000,
      period: 'total',
      currency: 'INR',
      deadlineAt: istEndOfDay(now + 6 * DAY),
      applyUrl: 'https://futurestrust.example/apply',
      sourceId: 'src_rss_scholarships',
    },
    {
      ...base,
      id: 'lst_edge_unpaid',
      title: 'Open Source Documentation Volunteer',
      type: 'opensource',
      company: 'Docs Commons',
      companyDomain: 'docscommons.example',
      stipendMin: null,
      stipendMax: null,
      currency: null,
      period: null,
      deadlineAt: null,
      deadlineKind: 'rolling',
      applyUrl: 'https://docscommons.example/volunteer',
    },
    {
      ...base,
      id: 'lst_edge_past',
      title: 'Winter Analytics Internship',
      company: 'Neem Analytics',
      companyDomain: 'neem.example',
      deadlineAt: istEndOfDay(now - 2 * DAY),
      deadlineKind: 'date',
      applyUrl: 'https://neem.example/careers/winter',
    },
  ];
}

export interface MockEntry {
  listing: ListingPublic;
  fit: FitResult;
  saved: boolean;
  hidden: boolean;
  trackerItemId: string | null;
  source: MockSource;
}

function fitOf(listing: ListingPublic, now: number): FitResult {
  const semantic = 0.3 + rand(`${listing.id}-semantic`) * 0.65;
  return computeFit({ profile: PROFILE, listing, now: new Date(now), semantic });
}

function entryOf(listing: ListingPublic, now: number): MockEntry {
  return {
    listing,
    fit: fitOf(listing, now),
    saved: false,
    hidden: false,
    trackerItemId: null,
    source:
      SOURCES.find((s) => s.id === listing.sourceId) ??
      ({ id: listing.sourceId, name: 'Community source', kind: 'greenhouse', scope: 'community' } as const as MockSource),
  };
}

export function buildDefaultListings(now: number): ListingPublic[] {
  const out = [...shiftedSamples(now), ...edgeCases(now)];
  for (let i = 0; out.length < 66; i += 1) out.push(generated({ index: i, now }));
  return out;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface Store {
  scenario: RadarScenario;
  now: number;
  entries: Map<string, MockEntry>;
  order: string[];
  warmingStartedAt: number | null;
  lastSeenFeedAt: number;
}

let store: Store | null = null;

function buildStore(scenario: RadarScenario): Store {
  const now = Date.now();
  const listings =
    scenario === 'large'
      ? (() => {
          const base = buildDefaultListings(now);
          const out = [...base];
          for (let i = 0; out.length < 5_000; i += 1) {
            out.push(generated({ index: i % 400, now, suffix: `_${Math.floor(i / 400) + 1}_${i}` }));
          }
          return out;
        })()
      : scenario === 'empty'
        ? []
        : buildDefaultListings(now);
  const entries = new Map<string, MockEntry>();
  for (const listing of listings) entries.set(listing.id, entryOf(listing, now));
  // A couple of saved items so "saved only" and the summary have something to show.
  for (const id of ['lst_01_fullstack_intern', 'lst_edge_due_soon', 'lst_06_hackathon_deccan']) {
    const e = entries.get(id);
    if (e) e.saved = true;
  }
  return {
    scenario,
    now,
    entries,
    order: listings.map((l) => l.id),
    warmingStartedAt: null,
    lastSeenFeedAt: now - 5 * DAY,
  };
}

export function getStore(): Store {
  const scenario = readScenario();
  if (!store || store.scenario !== scenario) store = buildStore(scenario);
  return store;
}

/** Test hook: rebuild on next access. */
export function resetStore(): void {
  store = null;
}

/** Fraction of the warming-up run that has completed (1 when not warming). */
export function warmingProgress(s: Store): number {
  if (s.scenario !== 'warming') return 1;
  if (s.warmingStartedAt == null) s.warmingStartedAt = Date.now();
  return Math.min(1, (Date.now() - s.warmingStartedAt) / readWarmingMs());
}

export const MOCK_SOURCES = SOURCES;
export const MOCK_PROFILE = PROFILE;

/**
 * For other MSW handlers (tracker): resolve a listing id to the fields a tracker item copies, and
 * record that it is tracked so feed rows and the drawer show "In tracker" after a refetch.
 */
export function lookupMockListing(id: string) {
  const entry = getStore().entries.get(id);
  if (!entry) return null;
  const { listing } = entry;
  return {
    title: listing.title,
    company: listing.company,
    type: listing.type,
    applyUrl: listing.applyUrl,
    deadlineAt: listing.deadlineAt ? listing.deadlineAt.toISOString() : null,
    sourceId: listing.sourceId,
  };
}

export function setMockTracked(listingId: string, trackerItemId: string | null): void {
  const entry = getStore().entries.get(listingId);
  if (entry) entry.trackerItemId = trackerItemId;
}
