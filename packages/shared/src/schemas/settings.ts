import { z } from 'zod';

import { DEADLINE_REMINDER_DAYS, DEFAULT_TIMEZONE, DEFAULT_WEIGHTS } from '../constants';
import {
  dateSchema,
  httpUrlSchema,
  idSchema,
  quietHoursSchema,
  timeOfDaySchema,
  timeZoneSchema,
} from './common';
import { weightsInputSchema, weightsPatchSchema } from './weights';

export const THEMES = ['light', 'dark', 'system'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const FONT_SIZES = ['sm', 'md', 'lg'] as const;
export const REDUCED_MOTION_PREFS = ['system', 'reduce', 'no-preference'] as const;
export const AI_PROVIDERS = [
  'default',
  'openai',
  'gemini',
  'openrouter',
  'ollama',
  'custom',
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Accent token key; the palette itself lives in packages/ui tokens. */
const accentSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'Invalid accent key');

const appearance = {
  theme: z.enum(THEMES),
  accent: accentSchema,
  density: z.enum(DENSITIES),
  fontSize: z.enum(FONT_SIZES),
  reducedMotion: z.enum(REDUCED_MOTION_PREFS),
};

export const appearanceSettingsSchema = z.object({
  theme: appearance.theme.default('system'),
  accent: appearance.accent.default('default'),
  density: appearance.density.default('comfortable'),
  fontSize: appearance.fontSize.default('md'),
  reducedMotion: appearance.reducedMotion.default('system'),
});
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;

/** AI settings as stored/returned. The key itself is never returned (only hasKey + last 4). */
export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS).default('default'),
  baseUrl: httpUrlSchema.nullable().default(null),
  model: z.string().trim().max(120).nullable().default(null),
  hasKey: z.boolean().default(false),
  keyLast4: z.string().length(4).nullable().default(null),
  /** false = "AI off": embeddings + rules only. */
  enabled: z.boolean().default(true),
  /** One-time consent to send resume/listing text to the configured provider. */
  consentGivenAt: dateSchema.nullable().default(null),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

const reminderDays = z.array(z.number().int().min(1).max(30)).max(5);

export const notificationSettingsSchema = z.object({
  push: z.boolean().default(true),
  inapp: z.boolean().default(true),
  deadlineReminders: reminderDays.default([...DEADLINE_REMINDER_DAYS]),
  nudges: z.boolean().default(true),
  digestTime: timeOfDaySchema.default('09:00'),
  quietHours: quietHoursSchema.nullable().default(null),
  timezone: timeZoneSchema.default(DEFAULT_TIMEZONE),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const privacySettingsSchema = z.object({
  /** Consent toggle: send resume text to the AI provider (default off). */
  sendResumeToAi: z.boolean().default(false),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const settingsSchema = z.object({
  userId: idSchema,
  appearance: appearanceSettingsSchema.prefault({}),
  ai: aiSettingsSchema.prefault({}),
  notifications: notificationSettingsSchema.prefault({}),
  privacy: privacySettingsSchema.prefault({}),
  /** Raw slider values; normalise with `normaliseWeights` before scoring. */
  weights: weightsInputSchema.default({ ...DEFAULT_WEIGHTS }),
  updatedAt: dateSchema.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** PATCH /settings: every leaf optional, nothing defaulted. */
export const settingsPatchSchema = z.object({
  appearance: z
    .object({
      theme: appearance.theme.optional(),
      accent: appearance.accent.optional(),
      density: appearance.density.optional(),
      fontSize: appearance.fontSize.optional(),
      reducedMotion: appearance.reducedMotion.optional(),
    })
    .optional(),
  ai: z
    .object({
      provider: z.enum(AI_PROVIDERS).optional(),
      baseUrl: httpUrlSchema.nullable().optional(),
      model: z.string().trim().max(120).nullable().optional(),
      enabled: z.boolean().optional(),
      /** true records consent now; false withdraws it. */
      consent: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      push: z.boolean().optional(),
      inapp: z.boolean().optional(),
      deadlineReminders: reminderDays.optional(),
      nudges: z.boolean().optional(),
      digestTime: timeOfDaySchema.optional(),
      quietHours: quietHoursSchema.nullable().optional(),
      timezone: timeZoneSchema.optional(),
    })
    .optional(),
  privacy: z.object({ sendResumeToAi: z.boolean().optional() }).optional(),
  weights: weightsPatchSchema.optional(),
});
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** PUT /settings/ai/key: write-only; the server encrypts (AES-256-GCM) and keeps last 4. */
export const aiKeyInputSchema = z.object({
  provider: z.enum(AI_PROVIDERS).exclude(['default']),
  apiKey: z.string().trim().min(8).max(512),
  baseUrl: httpUrlSchema.optional(),
  model: z.string().trim().min(1).max(120).optional(),
});
export type AiKeyInput = z.infer<typeof aiKeyInputSchema>;
