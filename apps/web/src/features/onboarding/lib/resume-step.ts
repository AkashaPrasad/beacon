import { primaryGradYear, type ProfileDraft } from '@/features/profile/lib/profile-model';

export interface StepErrors {
  gradYear?: string | null;
  skills?: string | null;
}

/** Validation for [Continue]: graduation year plus at least one skill (USERFLOW §1.4). */
export function validateResumeStep(draft: ProfileDraft): StepErrors {
  const errors: StepErrors = {};
  if (primaryGradYear(draft) === null) errors.gradYear = 'Add your graduation year to continue.';
  if (draft.skills.length === 0) errors.skills = 'Add at least one skill to continue.';
  return errors;
}
