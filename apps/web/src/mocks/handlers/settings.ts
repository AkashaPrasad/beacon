/**
 * MSW handlers for docs/API.md §10 (settings & account), plus the requested `GET /v1/settings/ai/usage`.
 *
 * Scenario: localStorage['beacon:mock:settings'] = 'default' (Beacon AI on, consent given)
 *                                                | 'byok' (own OpenAI key stored, ••••3f9a) | 'ai-off'
 *
 * AI key test (`POST /v1/settings/ai/test`, ~400 ms): a key containing "bad" → 401-style failure;
 * model "missing" → unknown model; base URL containing "slow" → timeout copy; otherwise ✓ 214 ms.
 */
import { settingsPatchSchema, settingsSchema, type Settings } from '@kestrel/shared';
import { delay, http, HttpResponse } from 'msw';

type Scenario = 'default' | 'byok' | 'ai-off';

function scenario(): Scenario {
  try {
    const v = localStorage.getItem('beacon:mock:settings');
    return v === 'byok' || v === 'ai-off' ? v : 'default';
  } catch {
    return 'default';
  }
}

let db: Settings | null = null;

function seed(): Settings {
  const s = scenario();
  return settingsSchema.parse({
    userId: 'usr_aarav',
    appearance: { theme: 'system', accent: 'default', density: 'comfortable', fontSize: 'md', reducedMotion: 'system' },
    ai:
      s === 'byok'
        ? {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            hasKey: true,
            keyLast4: '3f9a',
            enabled: true,
            consentGivenAt: new Date(Date.now() - 3 * 86_400_000),
          }
        : s === 'ai-off'
          ? { provider: 'default', enabled: false, consentGivenAt: null }
          : { provider: 'default', enabled: true, consentGivenAt: new Date(Date.now() - 6 * 86_400_000) },
    notifications: {
      push: false,
      inapp: true,
      deadlineReminders: [7, 3, 1],
      nudges: false,
      digestTime: '09:00',
      quietHours: { start: '22:00', end: '07:00' },
      timezone: 'Asia/Kolkata',
    },
    privacy: { sendResumeToAi: s === 'default' },
  });
}

function store(): Settings {
  db ??= seed();
  return db;
}

/** Test helper: forget all mock state. */
export function resetSettingsMock(): void {
  db = null;
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
function merge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v;
  }
  return out as T;
}

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

export const settingsHandlers = [
  http.get('*/v1/settings', async () => {
    await delay(120);
    return HttpResponse.json(store());
  }),

  http.patch('*/v1/settings', async ({ request }) => {
    await delay(140);
    const parsed = settingsPatchSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, 'VALIDATION', 'Invalid request');
    const { ai, ...rest } = parsed.data;
    const current = store();
    const aiFields = ai ? Object.fromEntries(Object.entries(ai).filter(([k]) => k !== 'consent')) : {};
    const next = merge(current, { ...rest, ai: aiFields });
    if (ai?.consent === true) next.ai.consentGivenAt = new Date();
    if (ai?.consent === false) next.ai.consentGivenAt = null;
    db = { ...next, updatedAt: new Date() };
    return HttpResponse.json(db);
  }),

  http.put('*/v1/settings/ai', async ({ request }) => {
    await delay(220);
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
    db = { ...current, ai };
    return HttpResponse.json({ ai });
  }),

  http.delete('*/v1/settings/ai/key', async () => {
    await delay(160);
    const current = store();
    const ai: Settings['ai'] = { ...current.ai, hasKey: false, keyLast4: null, provider: 'default' };
    db = { ...current, ai };
    return HttpResponse.json({ ai });
  }),

  http.post('*/v1/settings/ai/test', async ({ request }) => {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      provider?: string;
      baseUrl?: string | null;
      model?: string | null;
      apiKey?: string;
    };
    const current = store();
    if (!body.apiKey && !current.ai.hasKey && current.ai.provider !== 'default') {
      return error(422, 'AI_NOT_CONFIGURED', 'Add a key to test it.');
    }
    if (body.baseUrl?.includes('slow')) {
      await delay(900);
      return HttpResponse.json({ ok: false, error: 'No response within 15 s. Check the base URL.', latencyMs: 15_000 });
    }
    await delay(400);
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
      provider: body.provider ?? current.ai.provider,
    });
  }),

  http.get('*/v1/settings/ai/usage', async () => {
    await delay(100);
    return HttpResponse.json({
      date: new Date().toISOString().slice(0, 10),
      calls: 12,
      cap: 50,
      tokens: { prompt: 18_400, completion: 6_210, total: 24_610 },
    });
  }),

  http.get('*/v1/settings/export', async () => {
    await delay(500);
    const date = new Date().toISOString().slice(0, 10);
    const payload = { exportedAt: new Date().toISOString(), user: { id: 'usr_aarav' }, settings: store() };
    return new HttpResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="beacon-export-${date}.json"`,
      },
    });
  }),

  http.delete('*/v1/account', async () => {
    await delay(400);
    db = null;
    return new HttpResponse(null, { status: 204 });
  }),
];
