/**
 * MSW handlers for docs/API.md §4.1 (onboarding save and resume):
 *   PATCH /v1/profile/onboarding { step?, answers? }  → MeResponse (answers merged key by key; null removes)
 *   POST  /v1/profile/onboarding/complete { answers? } → MeResponse (step 'done', completedAt set once)
 * Progress lives on the shared `state.onboarding` (../state.ts), so `/v1/me` returns it as
 * `onboarding.answers` / `onboarding.updatedAt` without the foundation handler knowing about it.
 */
import { getResponse, http, HttpResponse } from 'msw';

import { state } from '../state';
import { foundationHandlers } from './foundation';

type Answers = Record<string, unknown>;
type Progress = { answers?: Answers; updatedAt?: Date | null; completed?: boolean };

const STEP_RE = /^[a-z][a-z0-9-]{0,39}$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_BYTES = 32 * 1024;

const progress = () => state.onboarding as typeof state.onboarding & Progress;

const error = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const b: unknown = await request.clone().json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Merge per key (`null` removes), with the API's limits. Returns an error response or null. */
function merge(answers: unknown): Response | null {
  if (answers === undefined) return null;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    return error(400, 'VALIDATION', 'answers must be an object');
  const current: Answers = { ...(progress().answers ?? {}) };
  for (const [key, value] of Object.entries(answers as Answers)) {
    if (!KEY_RE.test(key)) return error(400, 'VALIDATION', `Invalid answer id: ${key}`);
    if (value === null) delete current[key];
    else current[key] = value;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(current)).length;
  if (Object.keys(current).length > 100 || bytes > MAX_BYTES) {
    return error(413, 'PAYLOAD_TOO_LARGE', 'Onboarding answers are too large', {
      bytes,
      maxBytes: MAX_BYTES,
    });
  }
  progress().answers = current;
  return null;
}

async function me(request: Request): Promise<Response> {
  const url = new URL('/v1/me', request.url);
  const res = await getResponse(foundationHandlers, new Request(url));
  return res ?? error(500, 'INTERNAL', 'mock /v1/me unavailable');
}

export function resetOnboardingMock(): void {
  const p = progress();
  delete p.answers;
  delete p.updatedAt;
}

export const onboardingHandlers = [
  http.patch('*/v1/profile/onboarding', async ({ request }) => {
    const b = await body(request);
    if (b.step === undefined && b.answers === undefined)
      return error(400, 'VALIDATION', 'Send step or answers');
    if (b.step !== undefined && (typeof b.step !== 'string' || !STEP_RE.test(b.step))) {
      return error(400, 'VALIDATION', 'Invalid step id');
    }
    const failed = merge(b.answers);
    if (failed) return failed;
    const p = progress();
    if (typeof b.step === 'string' && !p.completedAt) p.step = b.step as typeof p.step;
    p.answers ??= {};
    p.updatedAt = new Date();
    return me(request);
  }),

  http.post('*/v1/profile/onboarding/complete', async ({ request }) => {
    const b = await body(request);
    const failed = merge(b.answers);
    if (failed) return failed;
    const p = progress();
    p.answers ??= {};
    p.step = 'done';
    p.completedAt ??= new Date();
    p.updatedAt = new Date();
    state.user.onboardingCompletedAt ??= p.completedAt;
    return me(request);
  }),
];
