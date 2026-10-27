/**
 * The conversational onboarding sequence (docs/ONBOARDING.md §2, UX-RESTRUCTURE §3). Pure data and
 * pure functions only, so the order, auto-skips, conditional steps and resume rules are unit-testable.
 */
import type { OnboardingAnswers } from '@/api/profile';
import type { MeResponse } from '@/api/types';
import {
  isPlaceholder,
  primaryEducation,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import { KNOWN_CITIES } from '@kestrel/shared';

export const STEP_ORDER = [
  'email',
  'name',
  'resume',
  'found',
  'education',
  'stack',
  'types',
  'roles',
  'location',
  'stipend',
  'work-auth',
  'companies',
  'packs',
  'review',
  'customising',
] as const;
export type StepId = (typeof STEP_ORDER)[number];

/** Steps skipped automatically when the answer is already known (account, profile or resume). */
export const AUTO_SKIPPABLE: readonly StepId[] = ['email', 'name', 'education', 'stack'];

/** Questions "Here's what we found" can answer. */
export const RESUME_ANSWERABLE: readonly StepId[] = ['education', 'stack'];

/** Short labels for the review page, the header and the announcer. */
export const STEP_LABELS: Record<StepId, string> = {
  email: 'Email',
  name: 'Name',
  resume: 'Resume',
  found: 'Your profile',
  education: 'Education',
  stack: 'Stack',
  types: 'Opportunity types',
  roles: 'Roles',
  location: 'Location',
  stipend: 'Stipend floor',
  'work-auth': 'Work authorisation',
  companies: 'Dream companies',
  packs: 'Sources',
  review: 'Review',
  customising: 'Building your radar',
};

/** Desktop chapter labels ("You · What you want · Where to look"). */
export const CHAPTERS = [
  { id: 'you', label: 'You', steps: ['email', 'name', 'resume', 'found', 'education', 'stack'] },
  {
    id: 'want',
    label: 'What you want',
    steps: ['types', 'roles', 'location', 'stipend', 'work-auth', 'companies'],
  },
  { id: 'look', label: 'Where to look', steps: ['packs', 'review', 'customising'] },
] as const satisfies readonly { id: string; label: string; steps: readonly StepId[] }[];

export function chapterOf(step: StepId): (typeof CHAPTERS)[number] {
  return CHAPTERS.find((c) => (c.steps as readonly StepId[]).includes(step)) ?? CHAPTERS[0];
}

export function isStepId(value: unknown): value is StepId {
  return typeof value === 'string' && (STEP_ORDER as readonly string[]).includes(value);
}

export function stepPath(step: StepId, search = ''): string {
  return `/onboarding/${step}${search}`;
}

/** The legacy coarse step for `PATCH /v1/me { onboardingStep }` (older APIs only accept these). */
export function legacyStepFor(step: StepId): 'resume' | 'preferences' | 'sources' {
  const i = STEP_ORDER.indexOf(step);
  if (i <= STEP_ORDER.indexOf('stack')) return 'resume';
  if (i < STEP_ORDER.indexOf('packs')) return 'preferences';
  return 'sources';
}

/** A name worth greeting: set, and not just the email's local part ("aarav.mehta"). */
export function nameIsKnown(user: Pick<MeResponse['user'], 'name' | 'email'>): boolean {
  const name = user.name?.trim() ?? '';
  if (!name) return false;
  const local = user.email?.split('@')[0]?.toLowerCase() ?? '';
  return name.toLowerCase() !== local;
}

export interface FlowFacts {
  me: MeResponse;
  draft: ProfileDraft;
  answers: OnboardingAnswers;
}

/** Whether a step's answer is already known (so it can be auto-skipped). */
export function isKnown(step: StepId, { me, draft }: FlowFacts): boolean {
  switch (step) {
    case 'email':
      return Boolean(me.user.email);
    case 'name':
      return nameIsKnown(me.user);
    case 'education': {
      const edu = primaryEducation(draft);
      return Boolean(edu && !isPlaceholder(edu.degree) && edu.gradYear);
    }
    case 'stack':
      return draft.skills.length >= 3;
    case 'companies':
    case 'customising':
    case 'found':
    case 'location':
    case 'packs':
    case 'resume':
    case 'review':
    case 'roles':
    case 'stipend':
    case 'types':
    case 'work-auth':
      return false;
  }
}

/** Auto-skips for a fresh start: every skippable step whose answer is already known. */
export function initialAuto(facts: FlowFacts): StepId[] {
  return AUTO_SKIPPABLE.filter((s) => isKnown(s, facts));
}

/**
 * Auto-skips added once the resume has been confirmed: the questions it now answers, unless the student
 * already answered (or skipped) them.
 */
export function autoAfterResume(facts: FlowFacts): StepId[] {
  const { answers } = facts;
  const touched = new Set([...(answers.answered ?? []), ...(answers.skipped ?? [])]);
  const current = new Set(answers.auto ?? []);
  const added = RESUME_ANSWERABLE.filter(
    (s) => !touched.has(s) && !current.has(s) && isKnown(s, facts),
  );
  return [...current, ...added] as StepId[];
}

const INDIAN_CITIES = new Set(
  KNOWN_CITIES.filter((c) => c.country === 'IN').map((c) => c.name.toLowerCase()),
);
const INDIA_WORDS = new Set(['remote', 'anywhere in india', 'india']);

/** Any place outside India (or "Outside India") among the chosen locations. */
export function looksGlobal(locations: readonly string[]): boolean {
  return locations.some((l) => {
    const v = l.trim().toLowerCase();
    if (v === 'outside india') return true;
    if (INDIA_WORDS.has(v) || INDIAN_CITIES.has(v)) return false;
    const city = v.split(',')[0]?.trim() ?? v;
    return !INDIAN_CITIES.has(city);
  });
}

/** Conditional questions (ONBOARDING §2): stipend only for internships/jobs, work-auth only abroad. */
export function isApplicable(
  step: StepId,
  draft: Pick<ProfileDraft, 'opportunityTypes' | 'preferredLocations'>,
): boolean {
  if (step === 'stipend') {
    const t = draft.opportunityTypes;
    return t.length === 0 || t.includes('internship') || t.includes('fulltime');
  }
  if (step === 'work-auth') return looksGlobal(draft.preferredLocations);
  return true;
}

/** The steps this student sees, in order. */
export function buildSequence(
  answers: OnboardingAnswers,
  draft: Pick<ProfileDraft, 'opportunityTypes' | 'preferredLocations'>,
): StepId[] {
  const auto = new Set(answers.auto ?? []);
  return STEP_ORDER.filter((s) => {
    if (s === 'found') return Boolean(answers.resumeParsed);
    if (auto.has(s)) return false;
    return isApplicable(s, draft);
  });
}

/** "4 of 9": position among the counted steps (the customising screen isn't a question). */
export function positionOf(
  step: StepId,
  sequence: readonly StepId[],
): { index: number; total: number } {
  const counted: StepId[] = sequence.filter((s) => s !== 'customising');
  const i = counted.indexOf(step);
  return { index: i === -1 ? counted.length : i + 1, total: counted.length };
}

export function nextStep(step: StepId, sequence: readonly StepId[]): StepId | null {
  const i = sequence.indexOf(step);
  if (i === -1) {
    // The step left the sequence (auto-skipped meanwhile): continue from its place in the full order.
    const order = STEP_ORDER.indexOf(step);
    return sequence.find((s) => STEP_ORDER.indexOf(s) > order) ?? null;
  }
  return sequence[i + 1] ?? null;
}

export function previousStep(step: StepId, sequence: readonly StepId[]): StepId | null {
  const i = sequence.indexOf(step);
  const order = STEP_ORDER.indexOf(step);
  const before: StepId[] =
    i === -1 ? sequence.filter((s) => STEP_ORDER.indexOf(s) < order) : sequence.slice(0, i);
  // Never step back into the transient screens.
  return [...before].reverse().find((s) => s !== 'customising') ?? null;
}

/** The first step not yet answered or skipped (where a fresh visit starts). */
export function firstOpenStep(sequence: readonly StepId[], answers: OnboardingAnswers): StepId {
  const done = new Set([...(answers.answered ?? []), ...(answers.skipped ?? [])]);
  return sequence.find((s) => !done.has(s) && s !== 'customising') ?? 'review';
}

/** True once this flow has recorded an answer (a saved step from the legacy wizard doesn't count). */
export function hasStarted(answers: OnboardingAnswers): boolean {
  return (answers.answered?.length ?? 0) + (answers.skipped?.length ?? 0) > 0;
}

/**
 * Where `/onboarding/:param` should render. A new slug is honoured when the student navigated or reloaded
 * there; a legacy slug (or `resume` reached through a redirect, i.e. the generic entry) resumes the saved
 * step, else the first open one.
 */
export function resolveEntry(
  param: string | undefined,
  navigationType: 'POP' | 'PUSH' | 'REPLACE',
  sequence: readonly StepId[],
  answers: OnboardingAnswers,
  savedStep: string | null,
): StepId {
  const resumeSaved = (): StepId =>
    hasStarted(answers) &&
    isStepId(savedStep) &&
    sequence.includes(savedStep) &&
    savedStep !== 'customising'
      ? savedStep
      : firstOpenStep(sequence, answers);
  if (!param || !isStepId(param)) return resumeSaved();
  if (param === 'resume' && navigationType === 'REPLACE') return resumeSaved();
  if (param === 'found' && !answers.resumeParsed)
    return sequence.includes('resume') ? 'resume' : resumeSaved();
  if (param === 'customising' && navigationType === 'POP') return 'review';
  return param;
}

/** Adds `step` to an answer list (deduped), removing it from the other. */
export function markStep(
  answers: OnboardingAnswers,
  step: StepId,
  how: 'answered' | 'skipped',
): OnboardingAnswers {
  const other = how === 'answered' ? 'skipped' : 'answered';
  const list = new Set(answers[how] ?? []);
  list.add(step);
  return {
    ...answers,
    [how]: [...list],
    [other]: (answers[other] ?? []).filter((s) => s !== step),
  };
}

/** The small personal line above the prompt ("Nice to meet you, Aarav", "Almost there"). */
export function eyebrowFor(
  step: StepId,
  ctx: { firstName: string | null; index: number; resumed: boolean; mode: 'setup' | 'edit' },
): string | null {
  if (ctx.mode === 'edit') return 'Update your answer';
  const name = ctx.firstName ? `, ${ctx.firstName}` : '';
  if (ctx.resumed) return `Welcome back${name}`;
  if (step === 'packs' || step === 'review') return 'Almost there';
  if (ctx.index <= 1) return `Nice to meet you${name}`;
  return chapterOf(step).label;
}
