import { z } from 'zod';

import {
  countryCodeSchema,
  currencyCodeSchema,
  dateSchema,
  httpUrlSchema,
  idSchema,
  nonEmptyTrimmed,
  opportunityTypeSchema,
  payPeriodSchema,
} from './common';

export const SKILL_PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillProficiency = (typeof SKILL_PROFICIENCIES)[number];

export const DEGREE_LEVELS = [
  'highschool',
  'diploma',
  'bachelor',
  'master',
  'phd',
  'other',
] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const LINK_KINDS = [
  'github',
  'linkedin',
  'portfolio',
  'leetcode',
  'kaggle',
  'devpost',
  'scholar',
  'other',
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LANGUAGE_PROFICIENCIES = [
  'basic',
  'conversational',
  'professional',
  'native',
] as const;

/**
 * Work-arrangement preference.
 * - `remote_only`: only remote roles (on-site listings are capped unless open to relocate)
 * - `prefer_remote`: remote preferred, others acceptable
 * - `hybrid` / `onsite`: preferred arrangement
 * - `any`: no preference
 */
export const REMOTE_PREFS = ['remote_only', 'prefer_remote', 'hybrid', 'onsite', 'any'] as const;
export type RemotePref = (typeof REMOTE_PREFS)[number];

export const profileSkillSchema = z.object({
  /** Canonical taxonomy name when known (see `canonicaliseSkill`), else the user's text. */
  name: nonEmptyTrimmed(80),
  proficiency: z.enum(SKILL_PROFICIENCIES).default('intermediate'),
  years: z.number().min(0).max(50).nullable().default(null),
});
export type ProfileSkill = z.infer<typeof profileSkillSchema>;

const yearSchema = z.number().int().min(1950).max(2100);

export const educationSchema = z.object({
  institution: nonEmptyTrimmed(200),
  /** As written, e.g. "B.Tech", "BSc Computer Science". */
  degree: nonEmptyTrimmed(120),
  degreeLevel: z.enum(DEGREE_LEVELS).default('bachelor'),
  field: z.string().trim().max(120).nullable().default(null),
  startYear: yearSchema.nullable().default(null),
  gradYear: yearSchema,
  current: z.boolean().default(false),
  gpa: z
    .object({ value: z.number().min(0).max(100), scale: z.number().positive().max(100) })
    .nullable()
    .default(null),
});
export type Education = z.infer<typeof educationSchema>;

export const experienceSchema = z.object({
  company: nonEmptyTrimmed(200),
  title: nonEmptyTrimmed(200),
  startDate: dateSchema.nullable().default(null),
  endDate: dateSchema.nullable().default(null),
  current: z.boolean().default(false),
  description: z.string().max(5_000).nullable().default(null),
});
export type Experience = z.infer<typeof experienceSchema>;

export const projectSchema = z.object({
  name: nonEmptyTrimmed(160),
  description: z.string().max(5_000).nullable().default(null),
  url: httpUrlSchema.nullable().default(null),
  skills: z.array(nonEmptyTrimmed(80)).max(50).default([]),
});
export type Project = z.infer<typeof projectSchema>;

export const profileLinkSchema = z.object({
  kind: z.enum(LINK_KINDS).default('other'),
  url: httpUrlSchema,
});
export type ProfileLink = z.infer<typeof profileLinkSchema>;

export const spokenLanguageSchema = z.object({
  name: nonEmptyTrimmed(60),
  proficiency: z.enum(LANGUAGE_PROFICIENCIES).default('professional'),
});
export type SpokenLanguage = z.infer<typeof spokenLanguageSchema>;

/** Minimum acceptable pay. Compared after period + currency normalisation. */
export const stipendFloorSchema = z.object({
  amount: z.number().min(0),
  currency: currencyCodeSchema.default('INR'),
  period: payPeriodSchema.default('month'),
});
export type StipendFloor = z.infer<typeof stipendFloorSchema>;

export const workAuthSchema = z.object({
  /** Citizenship(s), ISO alpha-2. Used for listings restricted by citizenship. */
  citizenship: z.array(countryCodeSchema).max(5).default([]),
  /** Countries the student may work in without sponsorship, ISO alpha-2. */
  authorisedCountries: z.array(countryCodeSchema).max(20).default([]),
  needsSponsorship: z.boolean().default(false),
});
export type WorkAuth = z.infer<typeof workAuthSchema>;

const profileFields = {
  headline: z.string().trim().max(160).nullable().default(null),
  summary: z.string().trim().max(2_000).nullable().default(null),
  skills: z.array(profileSkillSchema).max(200).default([]),
  education: z.array(educationSchema).max(10).default([]),
  experience: z.array(experienceSchema).max(30).default([]),
  /** Total relevant work experience in years (internships count pro rata). */
  experienceYears: z.number().min(0).max(60).default(0),
  projects: z.array(projectSchema).max(50).default([]),
  links: z.array(profileLinkSchema).max(20).default([]),
  /** Role family ids (see `ROLE_FAMILIES`) or free text resolved via `resolveRoleFamily`. */
  preferredRoles: z.array(nonEmptyTrimmed(80)).max(20).default([]),
  /** Free-text places, e.g. "Bengaluru", "Pune, India", "Remote". */
  preferredLocations: z.array(nonEmptyTrimmed(120)).max(20).default([]),
  remotePref: z.enum(REMOTE_PREFS).default('any'),
  openToRelocate: z.boolean().default(false),
  stipendFloor: stipendFloorSchema.nullable().default(null),
  workAuth: workAuthSchema.prefault({}),
  languages: z.array(spokenLanguageSchema).max(20).default([]),
  /** Opportunity types the student wants. Empty means "all types". */
  opportunityTypes: z.array(opportunityTypeSchema).max(7).default([]),
};

export const profileInputSchema = z.object(profileFields);
/** Editable profile body (PUT /profile, resume-parse output). Defaults fill omitted fields. */
export type ProfileInput = z.input<typeof profileInputSchema>;

export const profileSchema = z.object({
  userId: idSchema,
  ...profileFields,
  /** sha256 of the embedding-relevant profile text; embedding is recomputed when it changes. */
  embeddingHash: z.string().nullable().default(null),
  updatedAt: dateSchema.optional(),
});
export type Profile = z.infer<typeof profileSchema>;

/**
 * PATCH /profile body: every top-level field optional, no defaults applied
 * (an omitted field is left unchanged).
 */
export const profilePatchSchema = z.object({
  headline: profileFields.headline.unwrap().optional(),
  summary: profileFields.summary.unwrap().optional(),
  skills: z.array(profileSkillSchema).max(200).optional(),
  education: z.array(educationSchema).max(10).optional(),
  experience: z.array(experienceSchema).max(30).optional(),
  experienceYears: z.number().min(0).max(60).optional(),
  projects: z.array(projectSchema).max(50).optional(),
  links: z.array(profileLinkSchema).max(20).optional(),
  preferredRoles: z.array(nonEmptyTrimmed(80)).max(20).optional(),
  preferredLocations: z.array(nonEmptyTrimmed(120)).max(20).optional(),
  remotePref: z.enum(REMOTE_PREFS).optional(),
  openToRelocate: z.boolean().optional(),
  stipendFloor: stipendFloorSchema.nullable().optional(),
  workAuth: workAuthSchema.optional(),
  languages: z.array(spokenLanguageSchema).max(20).optional(),
  opportunityTypes: z.array(opportunityTypeSchema).max(7).optional(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
