# `@kestrel/shared` public API

Single source of truth for domain types shared by `apps/api`, `apps/worker` and `apps/web`.
**Stability contract:** everything listed here is stable; changes from now on are additive only.

```ts
import { listingSchema, computeFit, type Listing } from '@kestrel/shared';
import { sampleProfiles, sampleListings, FIXTURE_NOW } from '@kestrel/shared/fixtures';
```

- Package: `packages/shared`, built with tsup to ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + `.d.ts`.
  Consumers depend on `"@kestrel/shared": "workspace:*"`; turbo builds it first (`^build`).
- Isomorphic: no Node built-ins (sha256 via `@noble/hashes`), safe in the browser.
- Runtime deps: `zod@4`, `date-fns@4`, `date-fns-tz@3`, `@noble/hashes@2`.
- All schemas are **zod 4**. Every `xxxSchema` has an inferred type `Xxx = z.infer<typeof xxxSchema>`.
  Date fields use `z.coerce.date()` (accept `Date` or ISO string, output `Date`).
- Convention for write DTOs: `*InputSchema` = full body with defaults; `*PatchSchema` = every
  field optional and **no defaults** (omitted = unchanged).

Status: every section below is **[ready]**: implemented and tested (850 tests, 99.6 % line
coverage, `pnpm --filter @kestrel/shared test`). The npm scope stays `@kestrel/*` until the
orchestrator's rename sweep to `@beacon/*`.

- Vite (apps/web) resolves the package's `source` export condition to `src/*.ts` so the browser
  bundle is tree-shaken per module (`resolve.conditions: ['source', ...defaultClientConditions]`).
  Node, tsc and Vitest use `dist`. Keep that condition in any new Vite/Vitest browser config.
- Additive since first publish: `formatStipend` (§4).

---

## 1. Constants — `src/constants.ts` [ready]

| Export                                                                               | Type / value                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPPORTUNITY_TYPES` / `OpportunityType`                                              | `'internship' \| 'fulltime' \| 'hackathon' \| 'scholarship' \| 'fellowship' \| 'research' \| 'opensource'`                                                                                                                            |
| `OPPORTUNITY_TYPE_LABELS`                                                            | `Record<OpportunityType, string>` ("Internship", "Full-time", …, "Open source")                                                                                                                                                       |
| `OPPORTUNITY_TYPE_COLOR_KEYS`                                                        | `Record<OpportunityType, 'type-<type>'>`; tokens define `--color-type-<type>` (Tailwind v4 `@theme` → `bg-type-internship`)                                                                                                           |
| `REMOTE_MODES` / `RemoteMode`, `REMOTE_MODE_LABELS`                                  | `'remote' \| 'hybrid' \| 'onsite' \| 'unknown'`                                                                                                                                                                                       |
| `PAY_PERIODS` / `PayPeriod`                                                          | `'hour' \| 'day' \| 'week' \| 'month' \| 'year' \| 'total'`                                                                                                                                                                           |
| `DEADLINE_KINDS` / `DeadlineKind`                                                    | `'date' \| 'rolling' \| 'unknown'`                                                                                                                                                                                                    |
| `EMBEDDING_DIM`                                                                      | `384`                                                                                                                                                                                                                                 |
| `LISTING_ARCHIVE_AFTER_DAYS`                                                         | `60`                                                                                                                                                                                                                                  |
| `SOURCE_KINDS` / `SourceKind`, `SOURCE_KIND_LABELS`, `ATS_SOURCE_KINDS`              | `greenhouse lever ashby smartrecruiters workable workday publicapi rss sitemap firecrawl jobspy`                                                                                                                                      |
| `SOURCE_SCOPES` / `SourceScope`                                                      | `'personal' \| 'community'`                                                                                                                                                                                                           |
| `REFRESH_INTERVALS` / `RefreshInterval`, `REFRESH_INTERVAL_MS`                       | `'1h' \| '6h' \| 'daily' \| 'weekly'`                                                                                                                                                                                                 |
| `SOURCE_HEALTH` / `SourceHealth`                                                     | `'pending' \| 'healthy' \| 'degraded' \| 'failing'`                                                                                                                                                                                   |
| `SOURCE_PACK_IDS` / `SourcePackId`, `SOURCE_PACK_LABELS`                             | `top-indian-product faang-plus-india yc-startups-interns hackathons-india scholarships-engineering remote-friendly-startups`                                                                                                          |
| `TRACKER_STAGES` / `TrackerStage`, `TRACKER_STAGE_LABELS`, `TERMINAL_TRACKER_STAGES` | `saved applied oa interview offer rejected ghosted` (column order)                                                                                                                                                                    |
| `NUDGE_FOLLOW_UP_DAYS` (10), `NUDGE_GHOSTED_DAYS` (30), `NUDGE_KINDS` / `NudgeKind`  | `'follow_up' \| 'move_to_ghosted'`                                                                                                                                                                                                    |
| `ALERT_CHANNELS` / `AlertChannel`                                                    | `'push' \| 'inapp'` (no email/Telegram, see BRIEF)                                                                                                                                                                                    |
| `ALERT_CADENCES` / `AlertCadence`                                                    | `'instant' \| 'daily' \| 'weekly'`                                                                                                                                                                                                    |
| `DEADLINE_REMINDER_DAYS`                                                             | `[7, 3, 1]`                                                                                                                                                                                                                           |
| `NOTIFICATION_KINDS` / `NotificationKind`                                            | `match digest deadline nudge source system`                                                                                                                                                                                           |
| `DEFAULT_TIMEZONE`, `DAY_MS`                                                         | `'Asia/Kolkata'`, `86_400_000`                                                                                                                                                                                                        |
| `SCORE_COMPONENTS` / `ScoreComponent`, `SCORE_COMPONENT_LABELS`                      | `semantic skills role eligibility location freshness stipend`                                                                                                                                                                         |
| `DEFAULT_WEIGHTS`                                                                    | `{ semantic: .40, skills: .25, role: .15, eligibility: .10, location: .05, freshness: .05, stipend: 0 }` (SPEC §4)                                                                                                                    |
| `SCORING`                                                                            | caps/penalties: `eligibilityHardFailCap 35`, `remoteOnlyOnsiteCap 50`, `deadlinePassedCap 20`, `ghostPenaltyMax 20`, `freshnessWindowDays 30`, `urgencyWindowDays 7`, `urgencyBoost 0.25`, skill weights `2 / 1 / 0.5`, `neutral 0.5` |
| `FIT_BANDS`, `fitBand(score): string`                                                | "Strong fit" ≥ 80, "Good fit" ≥ 60, "Partial fit" ≥ 40, "Weak fit"                                                                                                                                                                    |
| `GHOST_RULES`                                                                        | thresholds (age 45 d, very old 90 d, reposts ≥ 3, identical roles > 5, unseen 14 d) + points per signal                                                                                                                               |
| `GHOST_RISK_LEVELS` / `GhostRiskLevel`, `ghostRiskLevel(score)`                      | `'low'` < 30 ≤ `'medium'` < 60 ≤ `'high'`                                                                                                                                                                                             |
| `LIMITS`                                                                             | `resumeMaxBytes 10 MiB`, `feedPageDefault 20`, `feedPageMax 100`, `titleMax 300`, `companyMax 300`, `descriptionMax 100k`, `notesMax 20k`                                                                                             |

## 2. Schemas — `src/schemas/*` [ready]

### Common (`common.ts`)

`idSchema`, `objectIdSchema`, `dateSchema`, `countryCodeSchema` (ISO alpha-2, upper-cased),
`currencyCodeSchema` (ISO 4217), `httpUrlSchema`, `timeOfDaySchema` ("HH:mm"), `timeZoneSchema`
(IANA, Intl-validated), `timeZoneWithDefaultSchema`, `quietHoursSchema` / `QuietHours`
(`{ start, end }`, may wrap midnight), `opportunityTypeSchema`, `remoteModeSchema`,
`payPeriodSchema`, `nonEmptyTrimmed(max)`, `isValidTimeZone(tz): boolean`.

### User (`user.ts`)

`userSchema` / `User`, `publicUserSchema` / `PublicUser` (no `googleSub`), `USER_ROLES`.

```ts
User = {
  id,
  email,
  name,
  avatarUrl: string | null,
  googleSub,
  role: 'user' | 'admin',
  onboardingCompletedAt: Date | null,
  lastLoginAt: Date | null,
  createdAt,
  updatedAt,
};
```

### Profile (`profile.ts`)

`profileSchema` / `Profile`, `profileInputSchema` / `ProfileInput` (body with defaults),
`profilePatchSchema` / `ProfilePatch`, sub-schemas `profileSkillSchema`, `educationSchema`,
`experienceSchema`, `projectSchema`, `profileLinkSchema`, `spokenLanguageSchema`,
`stipendFloorSchema`, `workAuthSchema`; enums `SKILL_PROFICIENCIES`, `DEGREE_LEVELS`,
`LINK_KINDS`, `LANGUAGE_PROFICIENCIES`, `REMOTE_PREFS` / `RemotePref`.

```ts
Profile = {
  userId, headline: string|null, summary: string|null,
  skills: { name, proficiency: 'beginner'|'intermediate'|'advanced'|'expert', years: number|null }[],
  education: { institution, degree, degreeLevel: 'highschool'|'diploma'|'bachelor'|'master'|'phd'|'other',
               field: string|null, startYear: number|null, gradYear: number, current: boolean,
               gpa: { value, scale }|null }[],
  experience: { company, title, startDate: Date|null, endDate: Date|null, current, description }[],
  experienceYears: number,
  projects: { name, description: string|null, url: string|null, skills: string[] }[],
  links: { kind: 'github'|'linkedin'|'portfolio'|'leetcode'|'kaggle'|'devpost'|'scholar'|'other', url }[],
  preferredRoles: string[],          // role family ids or free text (resolveRoleFamily)
  preferredLocations: string[],      // free text, e.g. "Bengaluru", "Pune, India"
  remotePref: 'remote_only'|'prefer_remote'|'hybrid'|'onsite'|'any',
  openToRelocate: boolean,
  stipendFloor: { amount, currency: 'INR'…, period: PayPeriod } | null,
  workAuth: { citizenship: string[], authorisedCountries: string[], needsSponsorship: boolean },
  languages: { name, proficiency: 'basic'|'conversational'|'professional'|'native' }[],
  opportunityTypes: OpportunityType[],   // empty = all
  embeddingHash: string|null, updatedAt?: Date
}
```

### Listing (`listing.ts`)

`listingSchema` / `Listing` / `ListingInput`, `listingBaseSchema` (unrefined, for `.omit/.pick`),
`listingDraftSchema` / `ListingDraft` (pre-insert: no `id`; keys/timestamps optional),
`listingPublicSchema` / `ListingPublic` (no `embedding`, `contentHash`), `eligibilitySchema` /
`Eligibility`, `ghostRiskSchema` / `GhostRisk`, `ghostReasonSchema` / `GhostReason`,
`GHOST_SIGNAL_CODES` / `GhostSignalCode`, `embeddingSchema` (empty or 384-d).

```ts
Listing = {   // SPEC §9 shape, exactly:
  id, type: OpportunityType, title, company, companyDomain: string|null, location: string[],
  remote: RemoteMode, country: string|null, stipendMin: number|null, stipendMax: number|null,
  currency: string|null, period: PayPeriod|null, postedAt: Date|null, deadlineAt: Date|null,
  eligibility: { gradYears: number[], degrees: string[], minExperienceYears: number|null,
                 citizenship: string[], other: string[] },
  skillsRequired: string[], skillsNice: string[], descriptionMd: string, applyUrl: string,
  sourceId, canonicalKey, contentHash, firstSeenAt: Date, lastSeenAt: Date, seenCount: number,
  ghostRisk: { score: 0..100, reasons: { code: GhostSignalCode, message, points }[] },
  embedding: number[],
  // documented extensions:
  deadlineKind: 'date'|'rolling'|'unknown', archived: boolean, roleFamily: string|null
}
```

### Source (`source.ts`)

`sourceSchema` / `Source`, `sourceBaseSchema`, `sourceCreateSchema` / `SourceCreate`,
`sourceUpdateSchema` / `SourceUpdate`, `sourceConfigSchema` / `SourceConfig`, `sourceKindSchema`,
`sourceScopeSchema`, `refreshIntervalSchema`, `sourceHealthSchema`, `sourcePackIdSchema`.

```ts
Source = { id, url, name, kind: SourceKind, scope: 'personal'|'community', ownerId: string|null,
  packId: SourcePackId|null, typeTag: OpportunityType|null, enabled, refreshInterval,
  health: 'pending'|'healthy'|'degraded'|'failing', lastCheckedAt: Date|null, listingsFound,
  errorReason: string|null, config: { boardToken, feedUrl, provider } (all string|null),
  etag: string|null, lastModified: string|null, createdAt, updatedAt }
// refine: scope 'personal' requires ownerId
```

### Tracker (`tracker.ts`)

`trackerItemSchema` / `TrackerItem`, `trackerCreateSchema` / `TrackerCreate` (from `listingId`
**or** manual `title + company`), `trackerUpdateSchema` / `TrackerUpdate`, `trackerMoveSchema` /
`TrackerMove` (`{ stage, position }`), `trackerStageSchema`, `trackerContactSchema`,
`trackerDocumentSchema`, `trackerNudgeSchema`, `TRACKER_DOCUMENT_KINDS`.

```ts
TrackerItem = { id, userId, listingId: string|null, title, company, type: OpportunityType|null,
  applyUrl: string|null, deadlineAt: Date|null, sourceId: string|null, stage: TrackerStage,
  position: number, notes: string,
  contacts: { name, role, email, url, notes }[],
  documents: { name, url, kind: 'resume'|'cover_letter'|'portfolio'|'other', addedAt }[],
  appliedAt: Date|null, lastActivityAt: Date,
  nudges: { kind: 'follow_up'|'move_to_ghosted', dueAt, sentAt: Date|null, dismissedAt: Date|null }[],
  createdAt, updatedAt }
```

### Alert rule (`alert.ts`)

`alertRuleSchema` / `AlertRule`, `alertRuleInputSchema` / `AlertRuleInput`,
`alertRulePatchSchema` / `AlertRulePatch`, `alertConditionsSchema` / `AlertConditions`,
`alertChannelSchema`, `alertCadenceSchema`, `ALERT_REMOTE_FILTERS`.

```ts
AlertRule = { id, userId, name, enabled,
  conditions: { minFit: 0..100 (default 70), types: OpportunityType[], maxDeadlineDays: number|null,
                locations: string[], remote: 'any'|'remote'|'hybrid'|'onsite', keywords: string[] },
  channels: ('push'|'inapp')[] (≥1, unique), cadence: 'instant'|'daily'|'weekly',
  digestTime: 'HH:mm', digestDay: 0..6, quietHours: { start, end }|null, timezone: IANA,
  lastTriggeredAt: Date|null, createdAt, updatedAt }
```

### Notification (`notification.ts`)

`notificationSchema` / `Notification`, `notificationKindSchema`.

```ts
Notification = { id, userId, kind: NotificationKind, title, body, url: string|null,
  listingId, trackerItemId, alertRuleId (string|null), channels: AlertChannel[], readAt: Date|null, createdAt }
```

### Settings (`settings.ts`)

`settingsSchema` / `Settings`, `settingsPatchSchema` / `SettingsPatch`,
`appearanceSettingsSchema`, `aiSettingsSchema`, `notificationSettingsSchema`,
`privacySettingsSchema`, `aiKeyInputSchema` / `AiKeyInput` (write-only key),
enums `THEMES`, `DENSITIES`, `FONT_SIZES`, `REDUCED_MOTION_PREFS`, `AI_PROVIDERS` / `AiProvider`.

```ts
Settings = { userId,
  appearance: { theme: 'light'|'dark'|'system', accent: string, density: 'comfortable'|'compact',
                fontSize: 'sm'|'md'|'lg', reducedMotion: 'system'|'reduce'|'no-preference' },
  ai: { provider: 'default'|'openai'|'gemini'|'openrouter'|'ollama'|'custom', baseUrl: string|null,
        model: string|null, hasKey: boolean, keyLast4: string|null, enabled: boolean,
        consentGivenAt: Date|null },
  notifications: { push, inapp, deadlineReminders: number[], nudges, digestTime, quietHours, timezone },
  privacy: { sendResumeToAi: boolean },
  weights: WeightsInput,   // raw slider values
  updatedAt?: Date }
// settingsPatchSchema.ai.consent: true records consent now, false withdraws it.
```

### Weights (`weights.ts`)

`weightsInputSchema` / `WeightsInput` (7 non-negative numbers, any scale, ≥ 1 positive),
`weightsPatchSchema`, `weightsSchema` (validates then **normalises** to sum 1), `Weights`,
`normaliseWeights(weights?: Partial<Weights> | null): Weights`.

### Fit result (`fit.ts`)

`fitResultSchema` / `FitResult`, `FitComponents`, `fitCapSchema` / `FitCap`, `hardFailSchema` /
`HardFail`, `FIT_CAP_CODES` (`eligibility_hard_fail`, `remote_only_onsite`, `deadline_passed`),
`HARD_FAIL_CODES` (`grad_year`, `citizenship`, `min_experience`).

```ts
FitResult = {
  score: 0..100 int, rawScore: number,
  components:    Record<ScoreComponent, 0..1>,
  contributions: Record<ScoreComponent, points>,   // 100 · weight · component
  weights:       Record<ScoreComponent, 0..1>,     // normalised weights actually used
  caps: { code, max, reason }[], ghostPenalty: 0..20, hardFails: { code, reason }[],
  semanticAvailable: boolean,
  details: { skills: { matchedRequired, missingRequired, matchedNice, missingNice: string[] },
             roleFamily: string|null },
  explain: { whyFit: string[], gaps: string[] } }
```

### API DTOs (`api.ts`)

- Pagination: `paginationQuerySchema` (`cursor?`, `limit` 1..100 default 20), `cursorSchema`,
  `cursorPageSchema(item)` → `{ items, nextCursor: string|null, total? }`, `CursorPage<T>`,
  `encodeCursor(position: Record<string, string|number|boolean|null>): string`,
  `decodeCursor(cursor: string): Record<…> | null` (null when malformed).
- Query helpers: `csvArray(itemSchema)` (accepts `a,b`, repeated params or arrays), `booleanishSchema`.
- Feed: `feedQuerySchema` / `FeedQuery` (`q, types, remote, locations, deadlineWithinDays,
postedWithinDays, minStipend, stipendCurrency, gradYear, company, sourceId, minFit,
includeExpired, includeHidden, sort: 'fit'|'deadline'|'posted'` + pagination), `FEED_SORTS`,
  `feedItemSchema` / `FeedItem` (`{ listing: ListingPublic, fit: FitResult, saved, hidden,
trackerItemId }`), `feedResponseSchema` / `FeedResponse`.
- Sources: `detectSourceRequestSchema` (`{ url }`, scheme optional), `detectSourceResponseSchema` /
  `DetectSourceResponse` (`{ url, kind, confidence, boardToken, company, name, previewCount,
sampleTitles, costsCredits, message }`).
- Resume: `resumeParseResultSchema` / `ResumeParseResult` (`{ profile: ProfileInput, method:
'deterministic'|'llm'|'hybrid', sections, skills: ExtractedSkill[], emails, warnings, textChars }`),
  `extractedSkillSchema`, `RESUME_PARSE_METHODS`.
- Errors: `apiErrorSchema` / `ApiError` (`{ error: { code, message, details? } }`), `API_ERROR_CODES`.

## 3. Taxonomies — `src/taxonomy/*` [ready]

```ts
// skills.ts  (≥ 400 tech + non-tech skills)
SKILL_CATEGORIES: readonly SkillCategory[]
type SkillCategory = 'language'|'frontend'|'backend'|'mobile'|'database'|'cloud'|'devops'|'data'|'ml'
  |'security'|'testing'|'tools'|'systems'|'blockchain'|'gamedev'|'hardware'|'design'|'product'
  |'business'|'finance'|'marketing'|'research'|'operations'|'soft'
interface SkillDefinition { name: string; category: SkillCategory; aliases: readonly string[] }
SKILLS: readonly SkillDefinition[]
interface ExtractedSkill { canonical: string; matchedAlias: string; count: number }
extractSkills(text: string): ExtractedSkill[]            // word-boundary, alias-normalised, sorted by count desc
canonicaliseSkill(input: string): string | null          // "JS" → "JavaScript", "k8s" → "Kubernetes"
canonicaliseSkills(inputs: readonly string[]): string[]  // canonical where known, else trimmed input; deduped
getSkill(nameOrAlias: string): SkillDefinition | undefined
skillKey(input: string): string                          // lookup key used for matching

// roles.ts  (~60 role families)
ROLE_GROUPS: readonly RoleGroup[]   // 'engineering'|'data'|'design'|'product'|'business'|'research'|'other'
interface RoleFamily { id: string; label: string; group: RoleGroup; related: readonly string[] }
ROLE_FAMILIES: readonly RoleFamily[]
interface RoleMatch { family: string; label: string; group: RoleGroup; confidence: number }
classifyRole(title: string): RoleMatch | null
getRoleFamily(id: string): RoleFamily | undefined
resolveRoleFamily(input: string): string | null          // id, label or free-text title → family id
areRolesRelated(a: string, b: string): boolean
```

## 4. Normalisers — `src/normalise/*` [ready]

```ts
normaliseUrl(input: string, options?: { forceHttps?: boolean }): string   // throws TypeError if invalid
tryNormaliseUrl(input: string, options?: { forceHttps?: boolean }): string | null
normaliseText(text: string): string          // NFKC, lowercase, whitespace-collapsed
contentHash(text: string): string            // sha256 hex of normaliseText(text)
normaliseCompany(name: string): string       // strips Inc/Ltd/Pvt/LLC/Technologies…, punctuation
normaliseTitle(title: string): string        // lowercase, emoji/punctuation stripped
canonicalKey(listing: { company: string; title: string; location?: readonly string[];
                        remote?: RemoteMode }): string   // company|title|primaryLocation
interface NormalisedLocation { raw: string; city: string|null; region: string|null;
                               country: string|null; remote: RemoteMode }
normaliseLocation(raw: string): NormalisedLocation
normaliseLocations(raws: readonly string[]): NormalisedLocation[]
inferRemote(text: string): RemoteMode
normaliseCountry(input: string): string | null   // "India" / "Indian" / "IND" → "IN"
KNOWN_CITIES: readonly { name: string; country: string; aliases: readonly string[] }[]
type StipendParse =
  | { kind: 'amount'; min: number|null; max: number|null; currency: string; period: PayPeriod;
      approximate: boolean }            // approximate = currency or period was inferred
  | { kind: 'unpaid' } | { kind: 'competitive' } | { kind: 'unknown' }
parseStipend(text: string, options?: { defaultCurrency?: string }): StipendParse
toMonthlyAmount(amount: number, period: PayPeriod): number | null   // 'total' → null
convertCurrency(amount: number, from: string, to: string): number | null   // static approx FX
APPROX_FX_PER_USD: Readonly<Record<string, number>>
formatStipend(s: { stipendMin?, stipendMax?, currency?, period? }): string | null
  // "₹25,000/month", "$80,000–$100,000/year", "Up to €3,000/month", "From ₹15,000/month", "Unpaid"
interface ParseStipendOptions { defaultCurrency?: string }   // default 'INR'
type NormaliseUrlOptions = { forceHttps?: boolean }          // default true
```

## 5. Deadline parser — `src/deadline.ts` [ready]

```ts
type DeadlineParse =
  | { kind: 'date'; at: Date; confidence: number; allDay: boolean }
  | { kind: 'rolling' }
  | { kind: 'unknown' }
interface ParseDeadlineOptions { now?: Date; timeZone?: string /* default 'Asia/Kolkata' */ }
parseDeadline(text: string | null | undefined, options?: ParseDeadlineOptions): DeadlineParse
```

Date-only inputs resolve to 23:59:59.999 in the time zone (`allDay: true`). Explicit zones
(IST, UTC/GMT, PST/PDT, EST/EDT, CET, SGT, JST, AEST, AoE, `+05:30` …) override the default.

## 6. Scoring — `src/scoring/*` [ready]

```ts
interface ScoringProfile {        // structural subset of Profile; every field optional
  skills?: readonly { name: string }[];
  education?: readonly { gradYear: number; degree?: string; degreeLevel?: DegreeLevel }[];
  experienceYears?: number; preferredRoles?: readonly string[]; preferredLocations?: readonly string[];
  remotePref?: RemotePref; openToRelocate?: boolean; stipendFloor?: StipendFloor | null;
  workAuth?: { citizenship?: readonly string[] };
}
interface ScoringListing {        // structural subset of Listing / ListingPublic / ListingDraft
  type: OpportunityType; title: string; company: string; location?: readonly string[];
  remote?: RemoteMode; country?: string|null; stipendMin?: number|null; stipendMax?: number|null;
  currency?: string|null; period?: PayPeriod|null; postedAt?: Date|null; deadlineAt?: Date|null;
  deadlineKind?: DeadlineKind; firstSeenAt?: Date|null; eligibility?: Partial<Eligibility>;
  skillsRequired?: readonly string[]; skillsNice?: readonly string[];
  ghostRisk?: { score: number } | null; roleFamily?: string | null;
}
interface ComputeFitInput { profile: ScoringProfile; listing: ScoringListing;
  weights?: Partial<Weights> | null; now?: Date; semantic?: number | null }
computeFit(input: ComputeFitInput): FitResult
cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number

interface ApplyUrlCheck { status: number | null; finalUrl?: string | null;
                          redirectedToHome?: boolean; error?: string | null }
interface GhostRiskContext { now?: Date; repostCount?: number; applyUrlCheck?: ApplyUrlCheck | null;
                             identicalOpenRoles?: number }
ghostRisk(listing: { postedAt?: Date|null; firstSeenAt?: Date|null; lastSeenAt?: Date|null;
                     title?: string; descriptionMd?: string },
          context?: GhostRiskContext): GhostRisk

interface DedupeCandidate { canonicalKey: string; applyUrl: string; seenCount?: number;
                            firstSeenAt?: Date; lastSeenAt?: Date }
dedupeListings<T extends DedupeCandidate>(candidates: readonly T[]): T[]   // richest record kept, seenCount summed
listingRichness(listing: Partial<Listing>): number
```

## 7. Fixtures — `@kestrel/shared/fixtures` [ready]

```ts
FIXTURE_NOW: Date                         // 2026-10-27T06:30:00Z, fixed clock for tests/demo
sampleProfiles: readonly Profile[]        // 3 profiles (full-stack, data/ML, design/product)
sampleListings: readonly Listing[]        // 12 listings across all 7 types (Indian + global)
```

All organisations and people are fictional. Listing ids: `lst_01_fullstack_intern`,
`lst_02_ml_intern`, `lst_03_design_intern` (rolling), `lst_04_backend_fulltime` (Berlin, EUR),
`lst_05_data_analyst` (very long company name), `lst_06_hackathon_deccan` (emoji title),
`lst_07_hackathon_climate` (AoE deadline), `lst_08_scholarship_saraswati` (deadline passed),
`lst_09_fellowship_commons`, `lst_10_research_nlp`, `lst_11_opensource_infra`,
`lst_12_ghost_talent_pool` (ghost risk 85, US-citizens only). Profiles: `usr_aarav`
(full-stack, prefer remote, Bengaluru), `usr_meera` (ML/NLP, Chennai), `usr_rohan` (design,
remote-only). Derived fields (`canonicalKey`, `contentHash`, `roleFamily`, `ghostRisk`) are
computed with the library itself, relative to `FIXTURE_NOW`.

## 8. Scoring behaviour reference

| Term        | Value (0..1)                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| semantic    | `clamp(cosine, 0, 1)`; when not supplied its weight is redistributed (`semanticAvailable: false`)                                                                   |
| skills      | weighted Jaccard: matched (required×2 + nice×1) / (required×2 + nice×1 + 0.5 × profile-only skills in the listing's categories); 0.5 if the listing names no skills |
| role        | exact family 1 · related 0.6 · same group 0.3 · none 0 · no preference / unclassified 0.5                                                                           |
| eligibility | mean over applicable checks (pass 1, unknown 0.5, soft 0.25, hard 0); hard fails: grad year, citizenship, min experience                                            |
| location    | see `docs/DECISIONS.md` (Phase 2, location matrix)                                                                                                                  |
| freshness   | `max(0, 1 − ageDays/30)` + 0.25 if the deadline is ≤ 7 days away (clamped); 0 when expired; 0.5 with no dates                                                       |
| stipend     | below floor 0; ≥ floor 0.7 + 0.3·min(1, ratio−1); paid without floor 1; unknown 0.5; unpaid 0 (with floor) / 0.3                                                    |

`score = round(clamp(min(rawScore − ghostPenalty, ...caps.max), 0, 100))`, where
`ghostPenalty = ghostRisk.score / 5` and the caps are eligibility hard-fail 35, remote-only vs on-site 50, and deadline passed 20.
