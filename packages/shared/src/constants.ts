/**
 * Domain constants shared by api, worker and web. Enumerations live here (as
 * `as const` tuples) so zod schemas, Mongoose models and UI selects agree.
 */

// ── Opportunity types ────────────────────────────────────────────────────────

export const OPPORTUNITY_TYPES = [
  'internship',
  'fulltime',
  'hackathon',
  'scholarship',
  'fellowship',
  'research',
  'opensource',
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  internship: 'Internship',
  fulltime: 'Full-time',
  hackathon: 'Hackathon',
  scholarship: 'Scholarship',
  fellowship: 'Fellowship',
  research: 'Research',
  opensource: 'Open source',
};

/**
 * Colour token keys per type. Convention (Tailwind v4 `@theme`): the design tokens
 * define `--color-<key>` (e.g. `--color-type-internship`), giving utilities such as
 * `bg-type-internship`. Shared code never hard-codes colour values.
 */
export const OPPORTUNITY_TYPE_COLOR_KEYS: Record<OpportunityType, `type-${OpportunityType}`> = {
  internship: 'type-internship',
  fulltime: 'type-fulltime',
  hackathon: 'type-hackathon',
  scholarship: 'type-scholarship',
  fellowship: 'type-fellowship',
  research: 'type-research',
  opensource: 'type-opensource',
};

// ── Listings ─────────────────────────────────────────────────────────────────

export const REMOTE_MODES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export type RemoteMode = (typeof REMOTE_MODES)[number];

export const REMOTE_MODE_LABELS: Record<RemoteMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  unknown: 'Location unspecified',
};

export const PAY_PERIODS = ['hour', 'day', 'week', 'month', 'year', 'total'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const DEADLINE_KINDS = ['date', 'rolling', 'unknown'] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** Embedding model `Xenova/bge-small-en-v1.5` produces 384-dimensional vectors. */
export const EMBEDDING_DIM = 384;

/** Listings unseen for this many days are archived by the cleanup queue. */
export const LISTING_ARCHIVE_AFTER_DAYS = 60;

// ── Sources ──────────────────────────────────────────────────────────────────

export const SOURCE_KINDS = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
  'workday',
  'publicapi',
  'rss',
  'sitemap',
  'firecrawl',
  'jobspy',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  workable: 'Workable',
  workday: 'Workday',
  publicapi: 'Public API',
  rss: 'RSS / Atom',
  sitemap: 'Sitemap',
  firecrawl: 'Web page (crawled)',
  jobspy: 'Job boards (best effort)',
};

/** ATS kinds are polled via JSON endpoints and cost zero crawl credits. */
export const ATS_SOURCE_KINDS = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
  'workday',
] as const satisfies readonly SourceKind[];

export const SOURCE_SCOPES = ['personal', 'community'] as const;
export type SourceScope = (typeof SOURCE_SCOPES)[number];

export const REFRESH_INTERVALS = ['1h', '6h', 'daily', 'weekly'] as const;
export type RefreshInterval = (typeof REFRESH_INTERVALS)[number];

export const REFRESH_INTERVAL_MS: Record<RefreshInterval, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
};

export const SOURCE_HEALTH = ['pending', 'healthy', 'degraded', 'failing'] as const;
export type SourceHealth = (typeof SOURCE_HEALTH)[number];

export const SOURCE_PACK_IDS = [
  'top-indian-product',
  'faang-plus-india',
  'yc-startups-interns',
  'hackathons-india',
  'scholarships-engineering',
  'remote-friendly-startups',
] as const;
export type SourcePackId = (typeof SOURCE_PACK_IDS)[number];

export const SOURCE_PACK_LABELS: Record<SourcePackId, string> = {
  'top-indian-product': 'Top Indian product companies',
  'faang-plus-india': 'FAANG+ India',
  'yc-startups-interns': 'YC startups hiring interns',
  'hackathons-india': 'Hackathons India',
  'scholarships-engineering': 'Scholarships for engineering students',
  'remote-friendly-startups': 'Remote-friendly startups',
};

// ── Tracker ──────────────────────────────────────────────────────────────────

/** Kanban column order. */
export const TRACKER_STAGES = [
  'saved',
  'applied',
  'oa',
  'interview',
  'offer',
  'rejected',
  'ghosted',
] as const;
export type TrackerStage = (typeof TRACKER_STAGES)[number];

export const TRACKER_STAGE_LABELS: Record<TrackerStage, string> = {
  saved: 'Saved',
  applied: 'Applied',
  oa: 'OA / Test',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
};

export const TERMINAL_TRACKER_STAGES = [
  'offer',
  'rejected',
  'ghosted',
] as const satisfies readonly TrackerStage[];

/** Follow-up nudge after this many days without a response. */
export const NUDGE_FOLLOW_UP_DAYS = 10;
/** Suggest "move to ghosted" after this many days without a response. */
export const NUDGE_GHOSTED_DAYS = 30;

export const NUDGE_KINDS = ['follow_up', 'move_to_ghosted'] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];

// ── Alerts & notifications (web push + in-app only; see docs/BRIEF.md) ──────

export const ALERT_CHANNELS = ['push', 'inapp'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const ALERT_CADENCES = ['instant', 'daily', 'weekly'] as const;
export type AlertCadence = (typeof ALERT_CADENCES)[number];

/** Deadline reminders fire this many days before a tracked/saved deadline. */
export const DEADLINE_REMINDER_DAYS = [7, 3, 1] as const;

export const NOTIFICATION_KINDS = [
  'match',
  'digest',
  'deadline',
  'nudge',
  'source',
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// ── Time ─────────────────────────────────────────────────────────────────────

/** Default time zone for deadlines and digests (India Standard Time). */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const DAY_MS = 86_400_000;

// ── Scoring (SPEC §4) ────────────────────────────────────────────────────────

export const SCORE_COMPONENTS = [
  'semantic',
  'skills',
  'role',
  'eligibility',
  'location',
  'freshness',
  'stipend',
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export const SCORE_COMPONENT_LABELS: Record<ScoreComponent, string> = {
  semantic: 'Profile similarity',
  skills: 'Skills',
  role: 'Role',
  eligibility: 'Eligibility',
  location: 'Location',
  freshness: 'Freshness',
  stipend: 'Stipend',
};

/**
 * SPEC §4 default weights. SPEC's formula has no stipend term, so its default
 * weight is 0; users can raise it with the Stipend slider (weights are always
 * re-normalised to sum to 1).
 */
export const DEFAULT_WEIGHTS: Readonly<Record<ScoreComponent, number>> = Object.freeze({
  semantic: 0.4,
  skills: 0.25,
  role: 0.15,
  eligibility: 0.1,
  location: 0.05,
  freshness: 0.05,
  stipend: 0,
});

export const SCORING = Object.freeze({
  /** Eligibility hard-fail (grad year, citizenship, min experience) caps the score here. */
  eligibilityHardFailCap: 35,
  /** Remote-only user vs on-site listing (no relocation) caps the score here. */
  remoteOnlyOnsiteCap: 50,
  /** A listing whose deadline has passed is capped here (never silently dropped). */
  deadlinePassedCap: 20,
  /** Ghost penalty scales linearly from ghostRisk.score 0..100 to 0..this many points. */
  ghostPenaltyMax: 20,
  /** Freshness decays linearly to 0 over this many days since posting. */
  freshnessWindowDays: 30,
  /** Deadlines within this many days get the urgency boost. */
  urgencyWindowDays: 7,
  /** Added to the freshness component (then clamped to 1) when the deadline is near. */
  urgencyBoost: 0.25,
  /** Skill weights for the weighted Jaccard. */
  skillWeightRequired: 2,
  skillWeightNice: 1,
  /** Profile-only skills in the listing's skill categories still dilute the overlap, at half weight. */
  skillWeightProfileOnly: 0.5,
  /** Neutral component value when there is no signal either way. */
  neutral: 0.5,
});

export const FIT_BANDS = [
  { min: 80, label: 'Strong fit' },
  { min: 60, label: 'Good fit' },
  { min: 40, label: 'Partial fit' },
  { min: 0, label: 'Weak fit' },
] as const;

/** Human label for a fit score (colour must never be the only signal). */
export function fitBand(score: number): string {
  return FIT_BANDS.find((band) => score >= band.min)?.label ?? 'Weak fit';
}

// ── Ghost / stale detection (SPEC §3.1 G) ────────────────────────────────────

export const GHOST_RULES = Object.freeze({
  /** Listing age (days since posted) above which it is likely stale. */
  maxAgeDays: 45,
  /** Older than this adds the "very old" increment on top. */
  veryOldDays: 90,
  /** Same role re-posted this many times. */
  repostThreshold: 3,
  /** Company with more than this many open identical roles. */
  identicalRolesThreshold: 5,
  /** Listing not seen in its source for this many days. */
  notSeenDays: 14,
  points: {
    age: 25,
    veryOld: 10,
    reposted: 25,
    applyLinkDead: 35,
    applyLinkRedirectHome: 30,
    applyLinkError: 10,
    boilerplate: 20,
    identicalRoles: 15,
    notSeenRecently: 15,
  },
});

export const GHOST_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type GhostRiskLevel = (typeof GHOST_RISK_LEVELS)[number];

export function ghostRiskLevel(score: number): GhostRiskLevel {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const LIMITS = Object.freeze({
  resumeMaxBytes: 10 * 1024 * 1024,
  feedPageDefault: 20,
  feedPageMax: 100,
  titleMax: 300,
  companyMax: 300,
  descriptionMax: 100_000,
  notesMax: 20_000,
});
