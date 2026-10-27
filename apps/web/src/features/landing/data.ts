/**
 * Seeded, fictional data for the landing page (DESIGN §6.3). Everything is made up: companies use
 * `.example` domains, so `CompanyLogo` draws letter avatars and the page makes no third-party requests.
 * Kept tiny (no @kestrel/shared fixtures) because it ships in the landing chunks.
 */
import type { GhostRiskLevelKey, OpportunityTypeKey } from '@kestrel/ui';

/** The demo clock. Deadlines are relative to it, so prerendered and hydrated text always match. */
export const DEMO_NOW = new Date('2026-10-27T09:00:00+05:30');
const DAY = 86_400_000;
export const daysFromNow = (days: number) => new Date(DEMO_NOW.getTime() + days * DAY);

export const STATS = { sources: 338, listings: 4812, updated: '2 min ago' } as const;
export const STUDENT = "CS '27 · Bengaluru · Go + Postgres";

/** Fit components in DESIGN §6.2 order, with the default weights (sum 1). */
export const COMPONENTS = ['Semantic', 'Skills', 'Role', 'Eligibility', 'Location', 'Freshness'] as const;
export type Weights = readonly [number, number, number, number, number, number];
export const DEFAULT_WEIGHTS: Weights = [0.35, 0.25, 0.12, 0.12, 0.08, 0.08];

export interface DemoListing {
  id: string;
  title: string;
  company: string;
  domain: string;
  type: OpportunityTypeKey;
  /** Row meta line: location · stipend · posted · source. */
  meta: string;
  why: string[];
  gaps: string[];
  /** Contributions per component (points), summing to the score. */
  parts: Weights;
  /** null = rolling deadline. */
  deadlineDays: number | null;
  ghost?: GhostRiskLevelKey;
}

const L = (
  id: string,
  title: string,
  company: string,
  domain: string,
  type: OpportunityTypeKey,
  meta: string,
  why: string[],
  gaps: string[],
  parts: Weights,
  deadlineDays: number | null,
  ghost?: GhostRiskLevelKey,
): DemoListing => ({ id, title, company, domain, type, meta, why, gaps, parts, deadlineDays, ghost });

export const scoreOf = (l: DemoListing) => Math.round(l.parts.reduce((a, b) => a + b, 0));

/** The first six assemble in the hero; the rest arrive one by one in live mode. */
export const FEED: readonly DemoListing[] = [
  L('nw', 'Platform Engineering Intern', 'Northwind Labs', 'northwind.example', 'internship', 'Remote · ₹45k/mo · 2d ago · Greenhouse', ['Go', 'Postgres', '2027'], ['Docker'], [34.1, 21, 12, 10, 5, 3.9], 6),
  L('mr', 'ML Research Intern', 'Meridian AI Lab', 'meridian.example', 'research', 'Bengaluru · ₹60k/mo · 5h ago · Lever', ['PyTorch', 'Python'], ['CUDA'], [36, 22.5, 12, 10, 6, 4.5], 9),
  L('ll', 'Data Analyst Intern', 'Lotus Logistics', 'lotus.example', 'internship', 'Pune · ₹25k/mo · 51d ago · Careers page', ['SQL', 'Python'], [], [26.2, 15.5, 8, 10, 3.1, 1.2], 14, 'medium'),
  L('mh', 'Monsoon Hack 2026', 'Kaveri Collective', 'kaveri.example', 'hackathon', 'Online · Team of 4 · 1d ago · RSS', ['Next.js', 'Go'], [], [30.4, 18, 10, 10, 6, 3.6], 3),
  L('sp', 'Backend Engineer Intern', 'Saffron Pay', 'saffronpay.example', 'internship', 'Bengaluru · ₹40k/mo · 3d ago · Ashby', ['Go', 'gRPC'], ['Kafka'], [29.5, 17.5, 11, 10, 4, 2], 11),
  L('kf', 'Kaveri Engineering Fellowship', 'Kaveri Trust', 'kavtrust.example', 'fellowship', 'India · ₹1.2L/yr · 4d ago · Careers page', ['2027', 'CGPA 8+'], [], [24.8, 14, 9, 12, 6, 3.2], 21),
  L('cs', 'Backend Intern (Go)', 'Coral Stack', 'coralstack.example', 'internship', 'Remote · ₹50k/mo · just now · Lever', ['Go', 'Postgres', 'Redis'], [], [35, 23, 12, 10, 5, 3], 2),
  L('tf', 'Winter of Code mentee', 'Tamarind Foundation', 'tamarind.example', 'opensource', 'Remote · ₹30k stipend · 1h ago · RSS', ['Go', 'Git'], [], [32, 20, 11, 10, 5, 4], 12),
  L('dr', 'Research Fellow, Systems', 'Deccan Institute', 'deccan.example', 'research', 'Hyderabad · ₹55k/mo · 6h ago · Careers page', ['Linux', 'C'], ['Rust'], [33, 19, 12, 10, 6, 4], 18),
  L('ig', 'Frontend Intern', 'Indigo Grid', 'indigogrid.example', 'internship', 'Remote · ₹35k/mo · 2h ago · Workable', ['TypeScript', 'React'], ['Go'], [27, 16, 10, 10, 5, 3], 20),
  L('nt', 'Women in Engineering Scholarship', 'Neem Trust', 'neemtrust.example', 'scholarship', 'India · ₹80k/yr · 1d ago · Careers page', ['2027', 'B.Tech'], [], [25, 15, 9, 12, 7, 5], null),
  L('sw', 'SDE Intern, Payments', 'Saffron Pay', 'saffronpay.example', 'internship', 'Mumbai · ₹45k/mo · 30 min ago · Ashby', ['Go', 'SQL'], [], [31, 20, 11, 10, 2, 3], 5),
];

/** L2 act 1: the noise. ATS kinds with fictional board slugs. */
export const SOURCE_CHIPS: readonly string[] = [
  'Greenhouse · northwind', 'Lever · meridian', 'Ashby · saffronpay', 'RSS · kaveri-hacks', 'Workday · lotus',
  'Careers page · deccan', 'Lever · coralstack', 'Greenhouse · indigogrid', 'Workable · banyan', 'SmartRecruiters · teak',
  'RSS · neem-trust', 'Careers page · tamarind', 'Ashby · monsoon', 'Greenhouse · palash', 'Lever · ashoka-labs',
  'Workday · godavari', 'RSS · open-mentors', 'Careers page · sahyadri', 'Greenhouse · tulsi', 'Ashby · vetiver',
  'Lever · konkan', 'Workable · marigold', 'RSS · campus-fellows', 'Greenhouse · banyan', 'Careers page · chinar',
  'SmartRecruiters · sal', 'Lever · jamun', 'Ashby · peepal', 'RSS · winter-of-code', 'Greenhouse · indus',
  'Workday · narmada', 'Careers page · aravalli', 'Lever · ketaki', 'Greenhouse · champa', 'RSS · research-calls', 'Ashby · kesar',
];

/** L2 act 2: six listings ranked; `feedOrder` is where they arrive, the array order is by score. */
export const STORY_ROWS = [
  { id: 'mr', title: 'ML Research Intern', company: 'Meridian AI Lab', score: 91, feedOrder: 3 },
  { id: 'nw', title: 'Platform Engineering Intern', company: 'Northwind Labs', score: 86, feedOrder: 0 },
  { id: 'mh', title: 'Monsoon Hack 2026', company: 'Kaveri Collective', score: 78, feedOrder: 5 },
  { id: 'sp', title: 'Backend Engineer Intern', company: 'Saffron Pay', score: 74, feedOrder: 1 },
  { id: 'll', title: 'Data Analyst Intern', company: 'Lotus Logistics', score: 54, feedOrder: 2 },
  { id: 'ig', title: 'Content Intern', company: 'Indigo Grid', score: 38, feedOrder: 4 },
] as const;

/** L3: five weeks of deadlines (day 0 = Monday 26 Oct; today is day 1). */
export const TIMELINE_START = new Date('2026-10-26T00:00:00+05:30');
export const TIMELINE_DAYS = 35;
export const TIMELINE_TODAY = 1;
export const TIMELINE_PILLS: readonly { day: number; title: string; type: OpportunityTypeKey; fit: number }[] = [
  { day: 2, title: 'Monsoon Hack 2026', type: 'hackathon', fit: 78 },
  { day: 4, title: 'Backend Intern (Go)', type: 'internship', fit: 88 },
  { day: 6, title: 'SDE Intern, Payments', type: 'internship', fit: 77 },
  { day: 7, title: 'Platform Engineering Intern', type: 'internship', fit: 86 },
  { day: 10, title: 'ML Research Intern', type: 'research', fit: 91 },
  { day: 13, title: 'Winter of Code', type: 'opensource', fit: 82 },
  { day: 17, title: 'Data Analyst Intern', type: 'internship', fit: 64 },
  { day: 19, title: 'Research Fellow, Systems', type: 'research', fit: 84 },
  { day: 22, title: 'Kaveri Fellowship', type: 'fellowship', fit: 69 },
  { day: 24, title: 'Women in Engineering', type: 'scholarship', fit: 73 },
  { day: 27, title: 'Frontend Intern', type: 'internship', fit: 71 },
  { day: 29, title: 'Backend Engineer Intern', type: 'internship', fit: 74 },
  { day: 31, title: 'Open Data Hackathon', type: 'hackathon', fit: 66 },
  { day: 33, title: 'Summer Research Program', type: 'research', fit: 79 },
];

/** L4: component values (0..1) per listing; score = 100 × Σ weight × value. */
export const EXPLAINER_ROWS = [
  { id: 'nw', title: 'Platform Engineering Intern', company: 'Northwind Labs', meta: 'Remote · ₹45k/mo', values: [0.97, 0.84, 1, 0.83, 0.62, 0.49] },
  { id: 'mr', title: 'ML Research Intern', company: 'Meridian AI Lab', meta: 'Bengaluru · ₹60k/mo', values: [0.92, 0.62, 0.8, 1, 0.4, 0.95] },
  { id: 'ig', title: 'Frontend Intern', company: 'Indigo Grid', meta: 'Remote · ₹35k/mo', values: [0.7, 0.6, 0.65, 1, 1, 0.9] },
] as const satisfies readonly { id: string; title: string; company: string; meta: string; values: Weights }[];

export const PRESETS: readonly { name: string; weights: Weights }[] = [
  { name: 'Balanced', weights: DEFAULT_WEIGHTS },
  { name: 'Skills first', weights: [0.25, 0.45, 0.1, 0.1, 0.05, 0.05] },
  { name: 'Remote first', weights: [0.25, 0.15, 0.1, 0.1, 0.3, 0.1] },
];
