/**
 * MSW handlers for docs/API.md §10 (settings & account), plus the requested `GET /v1/settings/ai/usage`
 * and `POST /v1/push/test` (docs/SHARED-REQUESTS.md, web → api). They read and write the shared mock
 * `state` (../state.ts), so `/v1/me`'s settings summary always agrees with `/v1/settings`.
 *
 * Scenario: localStorage['beacon:mock:settings'] = 'default' (Beacon AI on, consent given)
 *                                                | 'byok' (own OpenAI key stored, ••••3f9a) | 'ai-off'
 *
 * AI key test (`POST /v1/settings/ai/test`, ~400 ms): a key containing "bad" → rejected key; model
 * "missing" → unknown model; base URL containing "slow" → timeout copy; otherwise ✓ 214 ms.
 */
import { delay, http, HttpResponse, type HttpResponseResolver } from 'msw';

import { settingsPatchSchema, type Settings } from '@kestrel/shared';

import { state } from '../state';

type Scenario = 'default' | 'byok' | 'ai-off';

function scenario(): Scenario {
  try {
    const v = localStorage.getItem('beacon:mock:settings');
    return v === 'byok' || v === 'ai-off' ? v : 'default';
  } catch {
    return 'default';
  }
}

const isBrowser = typeof window !== 'undefined' && !('__vitest_worker__' in globalThis);
const wait = (ms: number) => (isBrowser ? delay(ms) : Promise.resolve());

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

/** Session + CSRF, like the real API (§1.1, §1.2). */
function guarded(resolver: HttpResponseResolver): HttpResponseResolver {
  return (info) => {
    const method = info.request.method.toUpperCase();
    if (method !== 'GET' && info.request.headers.get('X-Requested-With') !== 'beacon') {
      return error(403, 'CSRF', 'Missing X-Requested-With header');
    }
    if (!state.signedIn) return error(401, 'UNAUTHENTICATED', 'Sign in to continue');
    return resolver(info);
  };
}

let seeded = false;

/** Applies the scenario to the shared settings once, then returns them. */
function store(): Settings {
  if (!seeded) {
    seeded = true;
    const s = scenario();
    const days = (n: number) => new Date(Date.now() - n * 86_400_000);
    if (s === 'byok') {
      state.settings.ai = {
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        hasKey: true,
        keyLast4: '3f9a',
        enabled: true,
        consentGivenAt: days(3),
      };
      state.settings.privacy = { sendResumeToAi: true };
    } else if (s === 'ai-off') {
      state.settings.ai = { ...state.settings.ai, provider: 'default', enabled: false, consentGivenAt: null };
      state.settings.privacy = { sendResumeToAi: false };
    }
    state.settings.notifications = {
      ...state.settings.notifications,
      quietHours: state.settings.notifications.quietHours ?? { start: '22:00', end: '07:00' },
    };
  }
  return state.settings;
}

/** Test helper: re-apply the scenario on next access. */
export function resetSettingsMock(): void {
  seeded = false;
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
function merge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v;
  }
  return out as T;
}

function replace(next: Settings): Settings {
  // Mutate in place: other foundation handlers hold the same object.
  Object.assign(state.settings, next, { updatedAt: new Date() });
  return state.settings;
}

export const settingsHandlers = [
  http.get(
    '*/v1/settings',
    guarded(async () => {
      await wait(120);
      return HttpResponse.json(store());
    }),
  ),

  http.patch(
    '*/v1/settings',
    guarded(async ({ request }) => {
      await wait(140);
      const parsed = settingsPatchSchema.safeParse(await request.json());
      if (!parsed.success) return error(400, 'VALIDATION', 'Invalid request');
      const { ai, ...rest } = parsed.data;
      const aiFields = ai ? Object.fromEntries(Object.entries(ai).filter(([k]) => k !== 'consent')) : {};
      const next = merge(store(), { ...rest, ai: aiFields });
      if (ai?.consent === true) next.ai.consentGivenAt = new Date();
      if (ai?.consent === false) next.ai.consentGivenAt = null;
      return HttpResponse.json(replace(next));
    }),
  ),

  http.put(
    '*/v1/settings/ai',
    guarded(async ({ request }) => {
      await wait(220);
      const body = (await request.json()) as {
        provider: Settings['ai']['provider'];
        baseUrl?: string | null;
        model?: string | null;
        apiKey?: string;
        enabled: boolean;
      };
      if (body.apiKey !== undefined && (body.apiKey.length < 8 || body.apiKey.length > 512)) {
        return error(400, 'VALIDATION', 'The key must be 8 to 512 characters.');
      }
      const current = store();
      const ai: Settings['ai'] = {
        ...current.ai,
        provider: body.provider,
        baseUrl: body.baseUrl ?? null,
        model: body.model ?? null,
        enabled: body.enabled,
        ...(body.apiKey ? { hasKey: true, keyLast4: body.apiKey.trim().slice(-4) } : {}),
      };
      replace({ ...current, ai });
      return HttpResponse.json({ ai });
    }),
  ),

  http.delete(
    '*/v1/settings/ai/key',
    guarded(async () => {
      await wait(160);
      const current = store();
      // Falls back to the consent choice (USERFLOW §5.2): Beacon's AI only when that was chosen.
      const consent = state.onboarding.consent;
      const ai: Settings['ai'] = {
        ...current.ai,
        hasKey: false,
        keyLast4: null,
        provider: 'default',
        baseUrl: null,
        model: null,
        enabled: consent?.aiMode === 'beacon',
      };
      replace({ ...current, ai });
      return HttpResponse.json({ ai });
    }),
  ),

  http.post(
    '*/v1/settings/ai/test',
    guarded(async ({ request }) => {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as {
        provider?: string;
        baseUrl?: string | null;
        model?: string | null;
        apiKey?: string;
      };
      const current = store();
      const provider = body.provider ?? current.ai.provider;
      if (!body.apiKey && !current.ai.hasKey && provider !== 'default') {
        return error(422, 'AI_NOT_CONFIGURED', 'Add a key to test it.');
      }
      if (body.baseUrl?.includes('slow')) {
        await wait(900);
        return HttpResponse.json({ ok: false, error: 'No response within 15 s. Check the base URL.', latencyMs: 15_000 });
      }
      await wait(400);
      if (body.apiKey?.includes('bad')) {
        return HttpResponse.json({ ok: false, error: 'The provider rejected this key.', latencyMs: 182 });
      }
      if (body.model === 'missing') {
        return HttpResponse.json({ ok: false, error: 'This provider has no model called missing.', latencyMs: 201 });
      }
      return HttpResponse.json({
        ok: true,
        latencyMs: 214,
        model: body.model ?? current.ai.model ?? 'muse-spark-1.3-contributor',
        provider,
      });
    }),
  ),

  http.get(
    '*/v1/settings/ai/usage',
    guarded(async () => {
      await wait(100);
      return HttpResponse.json({
        date: new Date().toISOString().slice(0, 10),
        calls: store().ai.enabled ? 12 : 0,
        cap: 50,
        tokens: { prompt: 18_400, completion: 6_210, total: 24_610 },
      });
    }),
  ),

  http.post(
    '*/v1/push/test',
    guarded(async () => {
      await wait(200);
      return HttpResponse.json({ queued: true, jobId: 'mock-push-test' }, { status: 202 });
    }),
  ),

  http.get(
    '*/v1/settings/export',
    guarded(async () => {
      await wait(500);
      const date = new Date().toISOString().slice(0, 10);
      const payload = {
        exportedAt: new Date().toISOString(),
        user: state.user,
        profile: state.profile,
        settings: { ...store(), ai: { ...store().ai } },
        tracker: state.tracker,
        alerts: state.alerts,
        notifications: state.notifications,
      };
      return new HttpResponse(JSON.stringify(payload, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="beacon-export-${date}.json"`,
        },
      });
    }),
  ),

  http.delete(
    '*/v1/account',
    guarded(async () => {
      await wait(400);
      state.signedIn = false;
      seeded = false;
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
