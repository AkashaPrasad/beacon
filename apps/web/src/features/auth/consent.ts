import type { AiMode } from '@/api/types';

/** Bump when the consent copy changes: users see the screen again (USERFLOW §1.2). */
export const CONSENT_VERSION = '2026-10-27';

/** Settings that go with each choice (the API also syncs ai.enabled from PATCH /v1/me). */
export function settingsForAiMode(mode: AiMode, resumeToAi: boolean) {
  switch (mode) {
    case 'beacon':
      return { ai: { provider: 'default' as const, enabled: true, consent: resumeToAi }, privacy: { sendResumeToAi: resumeToAi } };
    case 'byok':
      // Runs without AI until the user adds a key in Settings > AI & keys.
      return { ai: { enabled: false, consent: false }, privacy: { sendResumeToAi: false } };
    case 'off':
      return { ai: { enabled: false, consent: false }, privacy: { sendResumeToAi: false } };
  }
}
