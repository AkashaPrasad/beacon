/**
 * API-local request schemas (docs/API.md marks them "(api)"). Each one extends or composes a
 * shared schema; candidates for @kestrel/shared are listed in docs/SHARED-REQUESTS.md.
 */
import { z } from 'zod';

import {
  AI_PROVIDERS,
  booleanishSchema,
  csvArray,
  cursorSchema,
  dateSchema,
  feedQuerySchema,
  httpUrlSchema,
  idSchema,
  LIMITS,
  nonEmptyTrimmed,
  opportunityTypeSchema,
  refreshIntervalSchema,
  sourceCreateSchema,
  sourceKindSchema,
  trackerCreateSchema,
  trackerStageSchema,
  trackerMoveSchema,
  trackerUpdateSchema,
} from '@kestrel/shared';

import { passwordSchema } from '../lib/password.js';
import { AI_MODES, ONBOARDING_STEP_ID, ONBOARDING_STEPS } from '../models/user.js';

const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, 'Expected a 24-character id');

// ── Auth & me ────────────────────────────────────────────────────────────────

export const googleAuthSchema = z.union([
  z.object({ credential: z.string().min(10).max(8_192) }).strict(),
  z.object({ code: z.string().min(4).max(2_048), redirectUri: httpUrlSchema }).strict(),
]);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const registerSchema = z
  .object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).max(120) })
  .strict();

export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(1_024) })
  .strict();

/** Set or change the password of the signed-in account. */
export const passwordSetSchema = z
  .object({ password: passwordSchema, currentPassword: z.string().min(1).max(1_024).optional() })
  .strict();

export const mePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    onboardingStep: z.enum(ONBOARDING_STEPS).optional(),
    onboardingCompleted: z.boolean().optional(),
    consent: z
      .object({
        version: z.string().trim().min(1).max(32),
        aiMode: z.enum(AI_MODES),
        resumeToAi: z.boolean(),
      })
      .optional(),
  })
  .strict();

// ── Onboarding (save and resume) ─────────────────────────────────────────────

/** Serialised size cap for all stored answers together (bytes of JSON). */
export const ONBOARDING_ANSWERS_MAX_BYTES = 32 * 1024;
export const ONBOARDING_ANSWERS_MAX_KEYS = 100;

/** Mongo-safe at every depth: no key starting with `$` or containing `.`. */
function mongoSafeKeys(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (Array.isArray(value)) return value.every((v) => mongoSafeKeys(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).every(
      ([k, v]) => !k.startsWith('$') && !k.includes('.') && mongoSafeKeys(v, depth + 1),
    );
  }
  return true;
}

const onboardingAnswersSchema = z
  .record(
    z
      .string()
      .regex(
        /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
        'Answer ids are 1..64 letters, digits, _ or -, starting with a letter',
      ),
    z.json(),
  )
  .refine(
    (a) => Object.keys(a).length <= ONBOARDING_ANSWERS_MAX_KEYS,
    `At most ${ONBOARDING_ANSWERS_MAX_KEYS} answers`,
  )
  .refine(
    (a) => mongoSafeKeys(a),
    'Nested keys may not start with "$" or contain "."; nesting is limited to 8 levels',
  );

/** PATCH /v1/profile/onboarding: the step the user is on plus answers to merge (`null` removes one). */
export const onboardingProgressSchema = z
  .object({
    step: z
      .string()
      .regex(ONBOARDING_STEP_ID, 'Step ids are lower-case slugs (a-z, 0-9, -), 1..40 chars')
      .optional(),
    answers: onboardingAnswersSchema.optional(),
  })
  .strict()
  .refine((b) => b.step !== undefined || b.answers !== undefined, 'Send a step, answers, or both');

/** POST /v1/profile/onboarding/complete: optional last answers to merge first. */
export const onboardingCompleteSchema = z
  .object({ answers: onboardingAnswersSchema.optional() })
  .strict()
  .default({});

// ── Hints (tour, tips, rail UI state) ────────────────────────────────────────

export const HINT_TIPS_MAX = 200;
const tipIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9:_-]{0,63}$/,
    'Tip ids are lower-case slugs (a-z, 0-9, :, _, -), 1..64 chars',
  );

/** PATCH /v1/settings/hints: every field optional (at least one). */
export const hintsPatchSchema = z
  .object({
    /** true marks the tour completed now; false clears completed + dismissed (replay "Show me around"). */
    tourDone: z.boolean().optional(),
    tourStep: z
      .union([z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), z.number().int().min(0).max(50)])
      .nullable()
      .optional(),
    /** Stamps `tour.offeredAt` the first time (later calls keep the first time). */
    tourOffered: z.literal(true).optional(),
    /** true stamps `tour.dismissedAt` now; false clears it. */
    tourDismissed: z.boolean().optional(),
    /** Per tip / coach mark: true (dismissed now) or an ISO time (dismissed then); null shows it again. */
    tips: z
      .record(
        tipIdSchema,
        z.union([
          z.null(),
          z.literal(true),
          z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
        ]),
      )
      .refine(
        (t) => Object.keys(t).length <= HINT_TIPS_MAX,
        `At most ${HINT_TIPS_MAX} tips per request`,
      )
      .optional(),
    ui: z
      .object({
        railCollapsed: z.boolean().optional(),
        radarView: z.enum(['grid', 'list']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Send at least one field');

// ── Sources ──────────────────────────────────────────────────────────────────

export const sourceCreateBodySchema = sourceCreateSchema.extend({
  kind: sourceKindSchema.optional(),
  boardToken: z.string().trim().min(1).max(200).optional(),
  feedUrl: z.string().trim().max(2_048).optional(),
  refreshInterval: refreshIntervalSchema.optional(),
});

export const communitySourcesQuerySchema = z.object({
  pack: z.string().trim().min(1).max(64).optional(),
  kind: sourceKindSchema.optional(),
  q: z.string().trim().max(120).optional(),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// ── Feed ─────────────────────────────────────────────────────────────────────

export const feedQueryApiSchema = feedQuerySchema.extend({
  companies: csvArray(z.string().trim().min(1).max(200)).optional(),
  sourceIds: csvArray(objectIdString).optional(),
  sourceId: objectIdString.optional(),
  savedOnly: booleanishSchema.default(false),
  hideHidden: booleanishSchema.optional(),
});
export type FeedQueryApi = z.output<typeof feedQueryApiSchema>;

// ── Tracker ──────────────────────────────────────────────────────────────────

const manualTrackerSchema = z.object({
  manual: z.object({
    title: nonEmptyTrimmed(300),
    company: nonEmptyTrimmed(300),
    url: httpUrlSchema.optional(),
    type: opportunityTypeSchema.optional(),
    deadlineAt: dateSchema.optional(),
  }),
  stage: trackerStageSchema.optional(),
  notes: z.string().max(LIMITS.notesMax).optional(),
});

export const trackerCreateBodySchema = z.union([manualTrackerSchema, trackerCreateSchema]);

export const trackerPatchSchema = trackerUpdateSchema.extend({
  stage: trackerStageSchema.optional(),
  title: nonEmptyTrimmed(300).optional(),
  company: nonEmptyTrimmed(300).optional(),
  applyUrl: httpUrlSchema.nullable().optional(),
});

export const trackerListQuerySchema = z.object({ stage: trackerStageSchema.optional() });

/**
 * Kanban drop. The optional preconditions make a move from a stale board (another tab moved the
 * card) a `409 CONFLICT` instead of silently overwriting it.
 */
export const trackerMoveBodySchema = trackerMoveSchema.extend({
  /** The stage the client believes the card is in. */
  fromStage: trackerStageSchema.optional(),
  /** The card's `updatedAt` as the client last saw it. */
  ifUnmodifiedSince: dateSchema.optional(),
});

// ── Push & notifications ─────────────────────────────────────────────────────

export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2_048),
  keys: z.object({ p256dh: z.string().min(16).max(512), auth: z.string().min(8).max(256) }),
  expirationTime: z.number().nullable().optional(),
  userAgent: z.string().max(512).optional(),
});

export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(2_048) });

export const notificationsQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: booleanishSchema.default(false),
});

export const notificationsReadSchema = z.union([
  z.object({ ids: z.array(objectIdString).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

// ── Settings ─────────────────────────────────────────────────────────────────

export const aiSettingsPutSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: httpUrlSchema.nullable().optional(),
  model: z.string().trim().min(1).max(120).nullable().optional(),
  apiKey: z.string().trim().min(8).max(512).optional(),
  enabled: z.boolean(),
});

export const aiTestSchema = z
  .object({
    provider: z.enum(AI_PROVIDERS).optional(),
    baseUrl: httpUrlSchema.optional(),
    model: z.string().trim().min(1).max(120).optional(),
    apiKey: z.string().trim().min(8).max(512).optional(),
  })
  .default({});

export const idParamSchema = z.object({ id: idSchema });
