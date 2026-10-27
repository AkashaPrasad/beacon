/**
 * API-local request schemas (docs/API.md marks them "(api)"). Each one extends or composes a
 * shared schema; candidates for @kestrel/shared are listed in docs/SHARED-REQUESTS.md.
 */
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
  trackerUpdateSchema,
} from '@kestrel/shared';
import { z } from 'zod';

import { AI_MODES, ONBOARDING_STEPS } from '../models/user.js';

const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, 'Expected a 24-character id');

// ── Auth & me ────────────────────────────────────────────────────────────────

export const googleAuthSchema = z.union([
  z.object({ credential: z.string().min(10).max(8_192) }).strict(),
  z.object({ code: z.string().min(4).max(2_048), redirectUri: httpUrlSchema }).strict(),
]);

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
