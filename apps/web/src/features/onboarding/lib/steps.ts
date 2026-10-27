/** The three onboarding steps (USERFLOW §1.3), in order. */
export const STEPS = ['resume', 'preferences', 'sources'] as const;
export type StepId = (typeof STEPS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  resume: 'Resume',
  preferences: 'Preferences',
  sources: 'Sources',
};

export function isStepId(value: unknown): value is StepId {
  return typeof value === 'string' && (STEPS as readonly string[]).includes(value);
}

export function stepIndex(step: StepId): number {
  return STEPS.indexOf(step);
}

export function nextStep(step: StepId): StepId | null {
  return STEPS[stepIndex(step) + 1] ?? null;
}

export function previousStep(step: StepId): StepId | null {
  return STEPS[stepIndex(step) - 1] ?? null;
}

export function stepPath(step: StepId): string {
  return `/onboarding/${step}`;
}

/** +1 when moving forward, -1 when going back (drives the directional transition). */
export function directionBetween(from: StepId | null, to: StepId): 1 | -1 {
  if (!from) return 1;
  return stepIndex(to) >= stepIndex(from) ? 1 : -1;
}
