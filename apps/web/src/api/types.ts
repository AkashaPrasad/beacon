/**
 * Response/request DTOs for docs/API.md. Domain shapes come from @kestrel/shared (type-only imports,
 * so nothing from shared is bundled here); API-only wrappers are declared below.
 */
import type {
  AiProvider,
  AiSettings,
  AlertRule,
  DetectSourceResponse,
  FeedQuery,
  FitResult,
  GhostReason,
  ListingPublic,
  Notification,
  OpportunityType,
  Profile,
  ProfileInput,
  PublicUser,
  Settings,
  Source,
  SourceKind,
  SourceScope,
  TrackerItem,
  TrackerStage,
  Weights,
  WeightsInput,
} from '@kestrel/shared';

export type {
  AiProvider,
  AiSettings,
  AlertRule,
  FitResult,
  ListingPublic,
  Notification,
  OpportunityType,
  Profile,
  ProfileInput,
  PublicUser,
  Settings,
  Source,
  SourceKind,
  TrackerItem,
  TrackerStage,
};

// ── Auth & me (§3) ────────────────────────────────────────────────────────────

export type OnboardingStep = 'consent' | 'resume' | 'preferences' | 'sources' | 'done';
export type AiMode = 'beacon' | 'byok' | 'off';

export interface Consent {
  version: string;
  aiMode: AiMode;
  resumeToAi: boolean;
  at: Date;
}

export interface MeResponse {
  user: PublicUser & { lastSeenFeedAt: Date | null };
  onboarding: {
    step: OnboardingStep;
    completedAt: Date | null;
    consent: Consent | null;
    hasProfile: boolean;
    hasResume: boolean;
    personalSources: number;
    enabledPacks: string[];
  };
  settings: {
    theme: Settings['appearance']['theme'];
    density: Settings['appearance']['density'];
    accent: string;
    fontSize: Settings['appearance']['fontSize'];
    reducedMotion: Settings['appearance']['reducedMotion'];
    aiEnabled: boolean;
    aiProvider: AiProvider;
    hasKey: boolean;
    consentGivenAt: Date | null;
    pushEnabled: boolean;
    timezone: string;
  };
  unreadNotifications: number;
}

export interface MePatch {
  name?: string;
  onboardingStep?: OnboardingStep;
  onboardingCompleted?: boolean;
  consent?: { version: string; aiMode: AiMode; resumeToAi: boolean };
}

export type GoogleAuthBody = { credential: string } | { code: string; redirectUri: string };
export interface GoogleAuthResponse {
  user: PublicUser;
  isNew: boolean;
}

// ── Profile (§4) ──────────────────────────────────────────────────────────────

export interface ResumeMeta {
  fileName: string;
  mimeType: string;
  size: number;
  textChars: number;
  uploadedAt: Date;
  parsedFrom: 'deterministic' | 'llm';
}
export interface ProfileResponse {
  profile: Profile;
  exists: boolean;
  profileHash: string | null;
  resume: ResumeMeta | null;
}
export interface ResumeUploadResponse {
  profile: ProfileInput;
  parsedFrom: 'deterministic' | 'llm';
  warnings: string[];
  sections: string[];
  skills: { canonical: string; matchedAlias: string; count: number }[];
  emails: string[];
  phones: string[];
  textChars: number;
  saved: boolean;
}

// ── Sources (§5) ──────────────────────────────────────────────────────────────

export type SourceDTO = Source & { companyDomain: string | null };
export type CommunitySourceDTO = SourceDTO & { subscribed: boolean };
export interface PackDTO {
  id: string;
  name: string;
  sourceCount: number;
  kinds: Partial<Record<SourceKind, number>>;
  optional: boolean;
  enabled: boolean;
}
export type DetectResult = DetectSourceResponse & {
  valid: boolean;
  apiUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  finalUrl: string | null;
  config: { boardToken: string | null; feedUrl: string | null; provider: string | null };
};
export interface CreditsResponse {
  date: string;
  cloudUsedToday: number;
  cap: number;
  selfHostedUsedToday: number;
  backend: 'cloud' | 'selfhosted';
  userUsedToday: number;
}
export interface SourceCreateBody {
  url: string;
  name?: string;
  typeTag?: OpportunityType | null;
  refreshInterval?: Source['refreshInterval'];
  kind?: SourceKind;
  boardToken?: string | null;
  feedUrl?: string | null;
}

// ── Feed & listings (§6) ──────────────────────────────────────────────────────

export interface FeedItemDTO {
  listing: ListingPublic;
  fit: FitResult | null;
  score: number | null;
  saved: boolean;
  hidden: boolean;
  trackerItemId: string | null;
}
export interface FeedResponse {
  items: FeedItemDTO[];
  nextCursor: string | null;
  warmingUp: boolean;
  total?: number;
}
/** Feed filters (shared `FeedQuery` minus pagination, all optional) plus the API extras. */
export type FeedFilters = Partial<Omit<FeedQuery, 'cursor' | 'limit'>> & {
  companies?: string[];
  sourceIds?: string[];
  savedOnly?: boolean;
  hideHidden?: boolean;
  limit?: number;
};
export interface FeedSummary {
  total: number;
  byType: Record<OpportunityType, number>;
  deadlinesThisWeek: number;
  newSinceLastVisit: number;
  lastSeenFeedAt: Date | null;
  saved: number;
  warmingUp: boolean;
}
export interface ListingDetail {
  listing: ListingPublic;
  /** Markdown → HTML, sanitised server-side (sanitize-html allowlist). */
  descriptionHtml: string;
  fit: FitResult | null;
  matchedSkills: string[];
  missingSkills: string[];
  saved: boolean;
  hidden: boolean;
  trackerItemId: string | null;
  source: { id: string; name: string; kind: SourceKind; scope: SourceScope } | null;
  applyLinkHealth: {
    status: 'ok' | 'dead' | 'redirect_home' | 'error' | 'unknown';
    httpStatus: number | null;
    checkedAt: Date | null;
    reasons: GhostReason[];
  };
  similar: { listing: ListingPublic; score: number | null }[];
}
export interface InteractionResponse {
  listingId: string;
  saved: boolean;
  hidden: boolean;
}
export interface Explanation {
  listingId: string;
  profileHash: string | null;
  source: 'llm' | 'cache' | 'deterministic';
  whyFit: string[];
  gaps: string[];
  tailoringTips: string[];
  generatedAt: Date;
}

// ── Tracker (§7) ──────────────────────────────────────────────────────────────

export type TrackerItemDTO = TrackerItem & { history: { stage: TrackerStage; at: Date }[] };
export type TrackerCreateBody =
  | { listingId: string; stage?: TrackerStage; notes?: string }
  | {
      manual: { title: string; company: string; url?: string; type?: OpportunityType; deadlineAt?: Date };
      stage?: TrackerStage;
      notes?: string;
    };
export interface TrackerMoveResponse {
  item: TrackerItemDTO;
  column: { id: string; position: number }[];
}
export interface TrackerAnalytics {
  total: number;
  applied: number;
  responded: number;
  responseRate: number;
  medianResponseDays: number | null;
  stageCounts: Record<TrackerStage, number>;
  bestSources: { sourceId: string; name: string; applied: number; responded: number; responseRate: number }[];
  followUp: { id: string; title: string; company: string; appliedAt: Date; daysSinceActivity: number }[];
  moveOn: { id: string; title: string; company: string; appliedAt: Date; daysSinceActivity: number }[];
}

// ── Notifications & push (§8, §9) ─────────────────────────────────────────────

export interface NotificationsResponse {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}
export interface PushSubscriptionDTO {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: Date;
}

// ── Settings (§10) ────────────────────────────────────────────────────────────

export interface AiTestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  provider?: string;
  error?: string;
}
export interface WeightsResponse {
  weights: WeightsInput;
  normalised: Weights;
}
