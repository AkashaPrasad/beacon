/**
 * Foundation MSW handlers (docs/API.md §1–§3, §8 push): the session/CSRF guard that every other
 * handler sits behind, platform routes, Google sign-in (redirect code flow), `/v1/me`, logout and
 * push subscriptions. Feature resources live in the sibling `<feature>.ts` modules.
 */
import { delay, getResponse, http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';

import type { MeResponse, MePatch, Settings } from '@/api/types';

import { newId, state } from '../state';

const json = (body: JsonBodyType, status = 200) => HttpResponse.json(body, { status });
const error = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });

const inBrowser = typeof window !== 'undefined' && !('__vitest_worker__' in globalThis);
/** Realistic latency in the browser; none in unit tests. */
const latency = () => (inBrowser ? delay(90 + Math.round(Math.random() * 120)) : Promise.resolve());

/** Routes that need no session (API.md "public"). */
const PUBLIC = [
  /\/v1\/meta$/,
  /\/v1\/auth\/google(\/url)?$/,
  /\/v1\/auth\/(login|register)$/,
  /\/v1\/auth\/logout$/,
  /\/v1\/push\/vapid-public-key$/,
];

async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.clone().json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Lets `/v1/me` reuse the feature mocks' state (settings summary, unread count) instead of
 * duplicating it. Set by ./index.ts once every handler list is known.
 */
let resourceHandlers: HttpHandler[] = [];
export function setResourceHandlers(handlers: HttpHandler[]): void {
  resourceHandlers = handlers;
}

async function peek<T>(origin: string, path: string): Promise<T | null> {
  try {
    const res = await getResponse(resourceHandlers, new Request(`${origin}${path}`));
    return res?.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function meResponse(origin: string): Promise<MeResponse> {
  const [settings, notifications] = await Promise.all([
    peek<Settings>(origin, '/v1/settings'),
    peek<{ unreadCount: number }>(origin, '/v1/notifications?limit=1'),
  ]);
  const s = settings;
  return {
    user: state.user,
    onboarding: {
      ...state.onboarding,
      hasProfile: state.onboarding.step !== 'consent',
      hasResume: state.onboarding.step === 'done',
      personalSources: 0,
      enabledPacks: ['top-indian-product', 'hackathons-india'],
    },
    settings: {
      theme: s?.appearance.theme ?? 'system',
      density: s?.appearance.density ?? 'comfortable',
      accent: s?.appearance.accent ?? 'default',
      fontSize: s?.appearance.fontSize ?? 'md',
      reducedMotion: s?.appearance.reducedMotion ?? 'system',
      aiEnabled: s?.ai.enabled ?? true,
      aiProvider: s?.ai.provider ?? 'default',
      hasKey: s?.ai.hasKey ?? false,
      consentGivenAt: s?.ai.consentGivenAt ?? null,
      pushEnabled: state.push.length > 0,
      timezone: s?.notifications.timezone ?? 'Asia/Kolkata',
    },
    unreadNotifications: notifications?.unreadCount ?? 0,
  };
}

const MIN = 60_000;

/** A believable ops snapshot (API §10.1 shape): one failing source, a backlog, cloud crawling. */
function adminOverview() {
  const now = Date.now();
  type Run = [string, string, string, 'ok' | 'not_modified' | 'error' | 'deferred' | 'skipped', number, number, number | null, string | null, number, number];
  const runs: Run[] = [
    ['src_gh_stripe', 'Stripe', 'greenhouse', 'ok', 142, 6, 812, null, 3, 0],
    ['src_lever_northwind', 'Northwind careers', 'lever', 'ok', 18, 2, 640, null, 7, 0],
    ['src_crawl_acme', 'Acme careers', 'firecrawl', 'error', 0, 0, 10_120, '403 Forbidden: the site blocks crawlers.', 12, 1],
    ['src_api_devfolio', 'Devfolio hackathons', 'publicapi', 'ok', 25, 3, 1_430, null, 18, 0],
    ['src_rss_scholar', 'Scholarships India', 'rss', 'not_modified', 0, 0, 220, null, 26, 0],
    ['src_crawl_kaveri', 'Kaveri Robotics careers', 'firecrawl', 'deferred', 0, 0, null, 'Daily credit cap reached', 33, 0],
    ['src_ashby_meridian', 'Meridian AI Lab', 'ashby', 'ok', 9, 1, 512, null, 41, 0],
  ];
  return {
    generatedAt: new Date(now),
    users: { total: 1_284, admins: 1, withPassword: 212, withGoogle: 1_101, newLast7d: 96 },
    listings: {
      total: 18_406,
      active: 4_812,
      archived: 13_594,
      byType: { internship: 2_140, fulltime: 1_310, hackathon: 402, scholarship: 380, fellowship: 160, research: 250, opensource: 170 },
    },
    sources: {
      total: 338,
      byScope: { personal: 41, community: 297 },
      byHealth: { healthy: 309, degraded: 14, failing: 6, pending: 9 },
      byKind: { greenhouse: 96, lever: 64, ashby: 38, firecrawl: 70, rss: 24, publicapi: 46 },
    },
    queues: [
      { name: 'ingest', waiting: 42, active: 4, delayed: 0, failed: 3, completed: 12_844 },
      { name: 'extract', waiting: 8, active: 2, delayed: 0, failed: 0, completed: 9_310 },
      { name: 'embed', waiting: 0, active: 1, delayed: 0, failed: 0, completed: 21_902 },
      { name: 'match', waiting: 3, active: 1, delayed: 0, failed: 1, completed: 5_118 },
      { name: 'ghostcheck', waiting: 120, active: 2, delayed: 15, failed: 0, completed: 3_472 },
      { name: 'notify', waiting: 0, active: 0, delayed: 6, failed: 0, completed: 1_905 },
      { name: 'cleanup', waiting: 0, active: 0, delayed: 1, failed: 0, completed: 88 },
      { name: 'dead', waiting: 4, active: 0, delayed: 0, failed: 0, completed: 0 },
    ],
    queuesError: null,
    crawler: {
      date: new Date(now).toISOString().slice(0, 10),
      backend: 'cloud',
      cloudUsedToday: 312,
      selfHostedUsedToday: 0,
      cap: 500,
      backendReason: null,
      cloudRemaining: 1_688,
    },
    recentRuns: runs.map(([sourceId, sourceName, sourceKind, status, found, fresh, durationMs, err, minsAgo, credits], i) => {
      const finishedAt = new Date(now - minsAgo * MIN);
      return {
        id: `run_${i + 1}`,
        sourceId,
        sourceName,
        sourceKind,
        reason: i % 3 === 0 ? 'schedule' : i % 3 === 1 ? 'pack' : 'manual',
        status,
        startedAt: new Date(finishedAt.getTime() - (durationMs ?? 0)),
        finishedAt,
        durationMs,
        found,
        new: fresh,
        updated: status === 'ok' ? Math.min(found, 4) : 0,
        unchanged: status === 'ok' ? Math.max(0, found - fresh - 4) : 0,
        errors: err ? [{ kind: status === 'deferred' ? 'credits' : 'http', message: err }] : [],
        backend: sourceKind === 'firecrawl' ? 'cloud' : null,
        creditsUsed: credits,
      };
    }),
  };
}

export const foundationHandlers: HttpHandler[] = [
  // ── Guard: CSRF on mutations, session on user routes (falls through when satisfied) ─────────
  http.all('*/v1/*', async ({ request }) => {
    await latency();
    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = request.headers.get('X-Requested-With');
      if (csrf !== 'beacon' && csrf !== 'kestrel')
        return error(403, 'CSRF', 'Missing X-Requested-With header');
    }
    if (PUBLIC.some((re) => re.test(pathname))) return undefined;
    if (!state.signedIn)
      return error(401, 'UNAUTHENTICATED', 'Sign in to continue', { reason: 'missing' });
    if (method === 'DELETE' && pathname.endsWith('/v1/account')) state.signedIn = false;
    return undefined;
  }),

  // ── Platform ────────────────────────────────────────────────────────────────────────────
  http.get('*/healthz', () => json({ ok: true })),
  http.get('*/readyz', () => json({ ok: true, mongo: 'up', redis: 'up' })),
  http.get('*/v1/meta', () => json({ name: 'beacon', version: 'mock' })),

  // ── Auth & me (§3) ─────────────────────────────────────────────────────────────────────────
  http.get('*/v1/auth/google/url', ({ request }) => {
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirectUri') ?? `${url.origin}/auth/callback`;
    const target = new URL(redirectUri);
    target.searchParams.set('code', 'mock-google-code');
    const st = url.searchParams.get('state');
    if (st) target.searchParams.set('state', st);
    return json({ url: target.toString(), redirectUri });
  }),
  http.post('*/v1/auth/google', async ({ request }) => {
    const b = await readBody<{ credential?: string; code?: string; redirectUri?: string }>(request);
    if (!b.credential && !b.code) return error(400, 'VALIDATION', 'credential or code is required');
    if (b.credential === 'invalid' || b.code === 'invalid') {
      return error(401, 'INVALID_GOOGLE_TOKEN', "Google didn't accept that sign-in.");
    }
    state.signedIn = true;
    return json({ user: state.user, isNew: state.onboarding.step === 'consent' });
  }),
  // Email + password (BRIEF addendum). Mock rules: a password containing "wrong" fails; an email
  // containing "taken" is already registered; an email starting with "admin@" signs in as admin.
  http.post('*/v1/auth/login', async ({ request }) => {
    const b = await readBody<{ email?: string; password?: string }>(request);
    if (!b.email || !b.password) return error(400, 'VALIDATION', 'email and password are required');
    if (b.password.includes('wrong') || b.password.length < 8) {
      return error(401, 'INVALID_CREDENTIALS', "That email and password don't match an account.");
    }
    state.user.email = b.email;
    state.user.role = b.email.startsWith('admin@') ? 'admin' : state.user.role;
    state.signedIn = true;
    return json({ user: state.user, isNew: false });
  }),
  http.post('*/v1/auth/register', async ({ request }) => {
    const b = await readBody<{ name?: string; email?: string; password?: string }>(request);
    if (!b.name || !b.email || !b.password || b.password.length < 8) {
      return error(400, 'VALIDATION', 'Invalid request', {
        location: 'body',
      });
    }
    if (b.email.includes('taken')) {
      return error(409, 'CONFLICT', 'An account with that email already exists');
    }
    state.user.name = b.name;
    state.user.email = b.email;
    state.user.createdAt = new Date();
    state.user.onboardingCompletedAt = null;
    state.onboarding.step = 'consent';
    state.onboarding.consent = null;
    state.onboarding.completedAt = null;
    state.signedIn = true;
    return json({ user: state.user, isNew: true }, 201);
  }),
  http.post('*/v1/auth/logout', () => {
    state.signedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('*/v1/me', async ({ request }) =>
    json((await meResponse(new URL(request.url).origin)) as unknown as JsonBodyType),
  ),
  http.patch('*/v1/me', async ({ request }) => {
    const b = await readBody<MePatch>(request);
    if (b.name) state.user.name = b.name;
    if (b.consent) state.onboarding.consent = { ...b.consent, at: new Date() };
    if (b.onboardingStep) state.onboarding.step = b.onboardingStep;
    if (b.onboardingCompleted) {
      state.onboarding.step = 'done';
      state.onboarding.completedAt = new Date();
      state.user.onboardingCompletedAt = new Date();
    }
    return json(await meResponse(new URL(request.url).origin));
  }),

  // ── Admin (role admin) ─────────────────────────────────────────────────────────────────
  http.get('*/v1/admin/overview', () => {
    if (state.user.role !== 'admin') return error(403, 'FORBIDDEN', 'Admins only');
    return json(adminOverview());
  }),

  // ── Push (§8) ────────────────────────────────────────────────────────────────────────────
  http.get('*/v1/push/vapid-public-key', () =>
    // A syntactically valid P-256 public key (65 bytes, uncompressed) for local subscriptions only.
    json({
      publicKey:
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    }),
  ),
  http.get('*/v1/push/subscriptions', () => json({ items: state.push })),
  http.post('*/v1/push/subscriptions', async ({ request }) => {
    const b = await readBody<{ endpoint?: string; userAgent?: string }>(request);
    if (!b.endpoint) return error(400, 'VALIDATION', 'endpoint is required');
    const subscription = {
      id: newId(),
      endpoint: b.endpoint,
      userAgent: b.userAgent ?? null,
      createdAt: new Date(),
    };
    state.push = [...state.push.filter((p) => p.endpoint !== b.endpoint), subscription];
    return json({ subscription }, 201);
  }),
  http.delete('*/v1/push/subscriptions/:id', ({ params }) => {
    const before = state.push.length;
    state.push = state.push.filter((p) => p.id !== params.id);
    return before === state.push.length
      ? error(404, 'NOT_FOUND', 'Subscription not found')
      : new HttpResponse(null, { status: 204 });
  }),
  http.delete('*/v1/push/subscriptions', async ({ request }) => {
    const b = await readBody<{ endpoint?: string }>(request);
    state.push = state.push.filter((p) => p.endpoint !== b.endpoint);
    return new HttpResponse(null, { status: 204 });
  }),
];
