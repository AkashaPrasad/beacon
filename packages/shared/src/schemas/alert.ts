import { z } from 'zod';

import { ALERT_CADENCES, ALERT_CHANNELS } from '../constants';
import {
  dateSchema,
  idSchema,
  nonEmptyTrimmed,
  opportunityTypeSchema,
  quietHoursSchema,
  timeOfDaySchema,
  timeZoneSchema,
} from './common';

export const alertChannelSchema = z.enum(ALERT_CHANNELS);
export const alertCadenceSchema = z.enum(ALERT_CADENCES);

export const ALERT_REMOTE_FILTERS = ['any', 'remote', 'hybrid', 'onsite'] as const;

const conditionFields = {
  /** Minimum fit score 0..100. */
  minFit: z.number().int().min(0).max(100),
  /** Empty means any type. */
  types: z.array(opportunityTypeSchema).max(7),
  /** Only listings whose deadline is within N days (null = any / no deadline). */
  maxDeadlineDays: z.number().int().min(1).max(365).nullable(),
  /** Free-text places; empty means anywhere. */
  locations: z.array(nonEmptyTrimmed(120)).max(20),
  remote: z.enum(ALERT_REMOTE_FILTERS),
  /** Case-insensitive keywords matched against title/company/skills; all must match. */
  keywords: z.array(nonEmptyTrimmed(60)).max(20),
};

export const alertConditionsSchema = z.object({
  minFit: conditionFields.minFit.default(70),
  types: conditionFields.types.default([]),
  maxDeadlineDays: conditionFields.maxDeadlineDays.default(null),
  locations: conditionFields.locations.default([]),
  remote: conditionFields.remote.default('any'),
  keywords: conditionFields.keywords.default([]),
});
export type AlertConditions = z.infer<typeof alertConditionsSchema>;

const channelsSchema = z
  .array(alertChannelSchema)
  .min(1, 'Pick at least one channel')
  .max(ALERT_CHANNELS.length)
  .refine((c) => new Set(c).size === c.length, 'Duplicate channel');

const ruleFields = {
  name: nonEmptyTrimmed(80),
  enabled: z.boolean(),
  channels: channelsSchema,
  cadence: alertCadenceSchema,
  /** Local send time for daily/weekly digests. */
  digestTime: timeOfDaySchema,
  /** 0 = Sunday .. 6 = Saturday (weekly cadence). */
  digestDay: z.number().int().min(0).max(6),
  quietHours: quietHoursSchema.nullable(),
  timezone: timeZoneSchema,
};

export const alertRuleInputSchema = z.object({
  name: ruleFields.name,
  enabled: ruleFields.enabled.default(true),
  conditions: alertConditionsSchema.prefault({}),
  channels: ruleFields.channels.default(['inapp', 'push']),
  cadence: ruleFields.cadence.default('instant'),
  digestTime: ruleFields.digestTime.default('09:00'),
  digestDay: ruleFields.digestDay.default(1),
  quietHours: ruleFields.quietHours.default(null),
  timezone: ruleFields.timezone.default('Asia/Kolkata'),
});
export type AlertRuleInput = z.input<typeof alertRuleInputSchema>;

export const alertRuleSchema = alertRuleInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  lastTriggeredAt: dateSchema.nullable().default(null),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

/** PATCH /alerts/:id: omitted fields are left unchanged (no defaults applied). */
export const alertRulePatchSchema = z.object({
  name: ruleFields.name.optional(),
  enabled: ruleFields.enabled.optional(),
  conditions: z
    .object({
      minFit: conditionFields.minFit.optional(),
      types: conditionFields.types.optional(),
      maxDeadlineDays: conditionFields.maxDeadlineDays.optional(),
      locations: conditionFields.locations.optional(),
      remote: conditionFields.remote.optional(),
      keywords: conditionFields.keywords.optional(),
    })
    .optional(),
  channels: ruleFields.channels.optional(),
  cadence: ruleFields.cadence.optional(),
  digestTime: ruleFields.digestTime.optional(),
  digestDay: ruleFields.digestDay.optional(),
  quietHours: ruleFields.quietHours.optional(),
  timezone: ruleFields.timezone.optional(),
});
export type AlertRulePatch = z.infer<typeof alertRulePatchSchema>;
