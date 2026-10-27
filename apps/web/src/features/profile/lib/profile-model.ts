/**
 * Editable profile model shared by the onboarding parsed preview and the Profile screen.
 * Pure functions only: every edit returns a new object, so optimistic updates and undo are trivial.
 */
import type { z } from 'zod';

import {
  canonicaliseSkill,
  getSkill,
  profileInputSchema,
  skillKey,
  SKILL_CATEGORIES,
  type DegreeLevel,
  type LinkKind,
  type ProfilePatch,
  type SkillCategory,
  type SkillProficiency,
} from '@kestrel/shared';

/** A complete profile body (defaults applied). Same shape as `Profile` minus server fields. */
export type ProfileDraft = z.output<typeof profileInputSchema>;
export type DraftSkill = ProfileDraft['skills'][number];
export type DraftEducation = ProfileDraft['education'][number];
export type DraftProject = ProfileDraft['projects'][number];
export type DraftLink = ProfileDraft['links'][number];
export type DraftExperience = ProfileDraft['experience'][number];

export const EMPTY_DRAFT: ProfileDraft = profileInputSchema.parse({});

/**
 * Normalises anything profile-shaped (API `ProfileInput`, `Profile`, partial JSON) into a complete
 * draft. Invalid array items are dropped individually so one bad parse never loses the rest.
 */
export function toDraft(input: unknown): ProfileDraft {
  const whole = profileInputSchema.safeParse(input ?? {});
  if (whole.success) return whole.data;
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const shape = profileInputSchema.shape;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const field = shape[key];
    const value = raw[key];
    if (Array.isArray(value)) {
      const element = (field as unknown as { unwrap(): { element: z.ZodType } }).unwrap().element;
      out[key] = value.flatMap((item) => {
        const r = element.safeParse(item);
        return r.success ? [r.data] : [];
      });
      continue;
    }
    const r = field.safeParse(value);
    out[key] = r.success ? r.data : field.parse(undefined);
  }
  return profileInputSchema.parse(out);
}

// ── Education ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The shared `educationSchema` requires an institution and a degree, but onboarding only requires a
 * graduation year (USERFLOW §1.4). Until the schema relaxes (docs/SHARED-REQUESTS.md), blanks are
 * stored as these placeholders and rendered as empty fields.
 */
export const PLACEHOLDER_INSTITUTION = 'Institution not added';
export const PLACEHOLDER_DEGREE = 'Degree not added';

export function isPlaceholder(value: string | null | undefined): boolean {
  return !value || value === PLACEHOLDER_INSTITUTION || value === PLACEHOLDER_DEGREE;
}

/** Shows a stored value, hiding placeholders. */
export function shown(value: string | null | undefined): string {
  return isPlaceholder(value) ? '' : (value ?? '');
}

export const DEGREE_LEVEL_LABELS: Record<DegreeLevel, string> = {
  highschool: 'High school',
  diploma: 'Diploma',
  bachelor: 'Undergraduate',
  master: 'Postgraduate',
  phd: 'PhD',
  other: 'Other',
};

/** Onboarding's four-way choice (USERFLOW §1.5 #4: UG / PG / PhD / Other). */
export const DEGREE_LEVEL_CHOICES: readonly { value: DegreeLevel; label: string }[] = [
  { value: 'bachelor', label: 'UG' },
  { value: 'master', label: 'PG' },
  { value: 'phd', label: 'PhD' },
  { value: 'other', label: 'Other' },
];

export function primaryEducation(draft: Pick<ProfileDraft, 'education'>): DraftEducation | null {
  if (draft.education.length === 0) return null;
  // The latest graduation year is the one eligibility rules care about.
  return [...draft.education].sort((a, b) => b.gradYear - a.gradYear)[0] ?? null;
}

export function primaryGradYear(draft: Pick<ProfileDraft, 'education'>): number | null {
  return primaryEducation(draft)?.gradYear ?? null;
}

export interface EducationEdit {
  institution?: string;
  degree?: string;
  degreeLevel?: DegreeLevel;
  field?: string | null;
  gradYear?: number;
}

/** Applies an edit to education[index], creating the first entry when there is none. */
export function editEducation<T extends Pick<ProfileDraft, 'education'>>(
  draft: T,
  edit: EducationEdit,
  index = 0,
): T {
  const current = draft.education[index];
  if (!current && edit.gradYear == null) return draft;
  const base: DraftEducation = current ?? {
    institution: PLACEHOLDER_INSTITUTION,
    degree: PLACEHOLDER_DEGREE,
    degreeLevel: 'bachelor',
    field: null,
    startYear: null,
    gradYear: edit.gradYear ?? new Date().getFullYear(),
    current: false,
    gpa: null,
  };
  const next: DraftEducation = {
    ...base,
    ...(edit.institution !== undefined && {
      institution: edit.institution.trim() || PLACEHOLDER_INSTITUTION,
    }),
    ...(edit.degree !== undefined && { degree: edit.degree.trim() || PLACEHOLDER_DEGREE }),
    ...(edit.degreeLevel !== undefined && { degreeLevel: edit.degreeLevel }),
    ...(edit.field !== undefined && { field: edit.field?.trim() ? edit.field.trim() : null }),
    ...(edit.gradYear !== undefined && { gradYear: edit.gradYear }),
  };
  const education = [...draft.education];
  education[current ? index : education.length] = next;
  return { ...draft, education };
}

export function removeEducation<T extends Pick<ProfileDraft, 'education'>>(draft: T, index: number): T {
  return { ...draft, education: draft.education.filter((_, i) => i !== index) };
}

/** Plausible graduation years for pickers: five back, six ahead. */
export function gradYearOptions(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 12 }, (_, i) => y - 5 + i);
}

// ── Skills ────────────────────────────────────────────────────────────────────────────────────────

export type ProficiencyStep = 'learning' | 'working' | 'strong';

/** DESIGN §6.1 Profile: a 3-step proficiency (Learning / Working / Strong) over the 4-level schema. */
export const PROFICIENCY_STEPS: readonly { id: ProficiencyStep; label: string; value: SkillProficiency }[] = [
  { id: 'learning', label: 'Learning', value: 'beginner' },
  { id: 'working', label: 'Working', value: 'intermediate' },
  { id: 'strong', label: 'Strong', value: 'advanced' },
];

export function proficiencyStep(p: SkillProficiency): ProficiencyStep {
  if (p === 'beginner') return 'learning';
  if (p === 'intermediate') return 'working';
  return 'strong';
}

export function nextProficiency(p: SkillProficiency): SkillProficiency {
  const step = proficiencyStep(p);
  if (step === 'learning') return 'intermediate';
  if (step === 'working') return 'advanced';
  return 'beginner';
}

/** Canonical display name for user input ("js" → "JavaScript"); trimmed input when unknown. */
export function canonicalSkillName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return canonicaliseSkill(trimmed) ?? trimmed;
}

export function hasSkill(skills: readonly DraftSkill[], name: string): boolean {
  const key = skillKey(canonicalSkillName(name));
  return skills.some((s) => skillKey(s.name) === key);
}

/** Adds a skill (canonicalised, deduped). Returns the same array when nothing changed. */
export function addSkill(
  skills: readonly DraftSkill[],
  raw: string,
  proficiency: SkillProficiency = 'intermediate',
): DraftSkill[] {
  const name = canonicalSkillName(raw);
  if (!name || name.length > 80 || hasSkill(skills, name)) return skills as DraftSkill[];
  return [...skills, { name, proficiency, years: null }];
}

export function removeSkill(skills: readonly DraftSkill[], name: string): DraftSkill[] {
  const key = skillKey(name);
  return skills.filter((s) => skillKey(s.name) !== key);
}

export function setProficiency(
  skills: readonly DraftSkill[],
  name: string,
  proficiency: SkillProficiency,
): DraftSkill[] {
  const key = skillKey(name);
  return skills.map((s) => (skillKey(s.name) === key ? { ...s, proficiency } : s));
}

export type SkillGroupKey = SkillCategory | 'other';

export const SKILL_CATEGORY_LABELS: Record<SkillGroupKey, string> = {
  language: 'Languages',
  frontend: 'Frontend',
  backend: 'Backend',
  mobile: 'Mobile',
  database: 'Databases',
  cloud: 'Cloud',
  devops: 'DevOps',
  data: 'Data',
  ml: 'ML / AI',
  security: 'Security',
  testing: 'Testing',
  tools: 'Tools',
  systems: 'Systems',
  blockchain: 'Blockchain',
  gamedev: 'Game development',
  hardware: 'Hardware',
  design: 'Design',
  product: 'Product',
  business: 'Business',
  finance: 'Finance',
  marketing: 'Marketing',
  research: 'Research',
  operations: 'Operations',
  soft: 'Working style',
  other: 'Other',
};

export function skillCategory(name: string): SkillGroupKey {
  return getSkill(name)?.category ?? 'other';
}

export interface SkillGroup {
  key: SkillGroupKey;
  label: string;
  skills: DraftSkill[];
}

/** Groups skills by taxonomy category, in taxonomy order, "Other" last. Stable within a group. */
export function groupSkills(skills: readonly DraftSkill[]): SkillGroup[] {
  const map = new Map<SkillGroupKey, DraftSkill[]>();
  for (const skill of skills) {
    const key = skillCategory(skill.name);
    const list = map.get(key) ?? [];
    list.push(skill);
    map.set(key, list);
  }
  const order: SkillGroupKey[] = [...SKILL_CATEGORIES, 'other'];
  return order
    .filter((key) => map.has(key))
    .map((key) => ({ key, label: SKILL_CATEGORY_LABELS[key], skills: map.get(key) ?? [] }));
}

// ── Roles inferred from skills ────────────────────────────────────────────────────────────────────

const CATEGORY_TO_ROLE: Partial<Record<SkillCategory, string>> = {
  frontend: 'frontend',
  backend: 'backend',
  mobile: 'mobile',
  ml: 'ml_engineer',
  data: 'data_analyst',
  devops: 'devops',
  cloud: 'cloud',
  security: 'security',
  design: 'product_designer',
  product: 'product_manager',
  blockchain: 'blockchain',
  gamedev: 'game_dev',
  hardware: 'embedded',
  systems: 'systems',
  testing: 'qa',
  research: 'research_assistant',
  marketing: 'marketing',
  finance: 'finance',
};

/** Suggested role family ids from skill categories (USERFLOW §1.5 #2: up to 5). */
export function suggestRoles(skills: readonly DraftSkill[], max = 3): string[] {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    const role = CATEGORY_TO_ROLE[skillCategory(skill.name) as SkillCategory];
    if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const roles = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([role]) => role);
  // Frontend + backend together read as full-stack.
  if (roles.includes('frontend') && roles.includes('backend')) {
    return ['fullstack', ...roles.filter((r) => r !== 'fullstack')].slice(0, max);
  }
  return roles.slice(0, max);
}

// ── Links ─────────────────────────────────────────────────────────────────────────────────────────

export const LINK_LABELS: Record<LinkKind, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  portfolio: 'Portfolio',
  leetcode: 'LeetCode',
  kaggle: 'Kaggle',
  devpost: 'Devpost',
  scholar: 'Google Scholar',
  other: 'Link',
};

const LINK_HOSTS: readonly [RegExp, LinkKind][] = [
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)leetcode\.com$/, 'leetcode'],
  [/(^|\.)kaggle\.com$/, 'kaggle'],
  [/(^|\.)devpost\.com$/, 'devpost'],
  [/^scholar\.google\./, 'scholar'],
];

/** Adds https:// when missing; returns null for anything that is not an http(s) URL. */
export function normaliseLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function linkKindFromUrl(url: string, fallback: LinkKind = 'portfolio'): LinkKind {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return LINK_HOSTS.find(([re]) => re.test(host))?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

/** "github.com/aarav" — the display form of a link. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

/** Sets (or clears, with an empty string) the link of one kind. */
export function setLink(links: readonly DraftLink[], kind: LinkKind, raw: string): DraftLink[] {
  const url = normaliseLinkUrl(raw);
  const rest = links.filter((l) => l.kind !== kind);
  return url ? [...rest, { kind, url }] : rest;
}

export function linkOf(links: readonly DraftLink[], kind: LinkKind): string {
  return links.find((l) => l.kind === kind)?.url ?? '';
}

// ── Patches ───────────────────────────────────────────────────────────────────────────────────────

/** The resume-derived part of a draft, as a PATCH body (step 1 → Continue). */
export function resumePatch(draft: ProfileDraft): ProfilePatch {
  return {
    ...(draft.headline ? { headline: draft.headline } : {}),
    ...(draft.summary ? { summary: draft.summary } : {}),
    skills: draft.skills,
    education: draft.education,
    experience: draft.experience,
    experienceYears: draft.experienceYears,
    projects: draft.projects,
    links: draft.links,
    languages: draft.languages,
    ...(draft.preferredRoles.length > 0 ? { preferredRoles: draft.preferredRoles } : {}),
  };
}

/** Minimal patch with the keys whose values differ between two drafts. */
export function diffPatch(before: ProfileDraft, after: ProfileDraft): ProfilePatch {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof ProfileDraft)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key];
  }
  return patch;
}

// ── Completeness ──────────────────────────────────────────────────────────────────────────────────

export interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

/** Profile completeness (0–100) and what to add next, ordered by how much each item helps ranking. */
export function completeness(
  draft: ProfileDraft,
  extras: { hasResume?: boolean } = {},
): { percent: number; items: CompletenessItem[]; next: CompletenessItem | null } {
  const items: CompletenessItem[] = [
    { key: 'education', label: 'Add your graduation year', done: draft.education.length > 0, weight: 20 },
    { key: 'skills', label: 'Add at least 5 skills', done: draft.skills.length >= 5, weight: 20 },
    { key: 'types', label: 'Choose opportunity types', done: draft.opportunityTypes.length > 0, weight: 10 },
    { key: 'projects', label: 'Add a project', done: draft.projects.length > 0, weight: 15 },
    { key: 'roles', label: 'Pick preferred roles', done: draft.preferredRoles.length > 0, weight: 10 },
    { key: 'links', label: 'Add GitHub or a portfolio link', done: draft.links.length > 0, weight: 10 },
    { key: 'headline', label: 'Write a one-line headline', done: Boolean(draft.headline?.trim()), weight: 5 },
    { key: 'resume', label: 'Upload your resume', done: Boolean(extras.hasResume), weight: 10 },
  ];
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const done = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  return {
    percent: Math.round((done / total) * 100),
    items,
    next: items.find((i) => !i.done) ?? null,
  };
}
