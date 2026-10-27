/**
 * Foundation smoke: the public pages are prerendered, hydrate without errors, pass axe (WCAG 2.2 AA,
 * no serious/critical), and the redirect sign-in flow reaches the consent screen.
 *
 * Self-contained on purpose: a tiny fake of the auth endpoints (docs/API.md §3) via `page.route`,
 * with `window.__BEACON_E2E__` keeping MSW off. The QA suites (edge-cases, a11y, keyboard, offline)
 * use the full fake API in e2e/utils.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const HEADLINE = /Every opportunity that fits you\./;

interface FakeApi {
  signedIn: boolean;
  consent: null | {
    version: string;
    aiMode: 'beacon' | 'byok' | 'off';
    resumeToAi: boolean;
    at: string;
  };
  calls: string[];
}

function meBody(api: FakeApi) {
  const now = new Date().toISOString();
  return {
    user: {
      id: '65f0c0ffee0000000000e2e1',
      email: 'nisha.rao@beacon.test',
      name: 'Nisha Rao',
      avatarUrl: null,
      role: 'user',
      onboardingCompletedAt: null,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
      lastSeenFeedAt: null,
    },
    onboarding: {
      step: api.consent ? 'resume' : 'consent',
      completedAt: null,
      consent: api.consent,
      hasProfile: false,
      hasResume: false,
      personalSources: 0,
      enabledPacks: [],
    },
    settings: {
      theme: 'system',
      density: 'comfortable',
      accent: 'default',
      fontSize: 'md',
      reducedMotion: 'system',
      aiEnabled: false,
      aiProvider: 'default',
      hasKey: false,
      consentGivenAt: null,
      pushEnabled: false,
      timezone: 'Asia/Kolkata',
    },
    unreadNotifications: 0,
  };
}

async function installFakeApi(page: Page, api: FakeApi) {
  await page.addInitScript(() => {
    (window as unknown as { __BEACON_E2E__: unknown }).__BEACON_E2E__ = { transport: 'playwright' };
  });
  await page.route(
    (url) => /^\/(v1\/|healthz$)/.test(url.pathname),
    async (route) => {
      const req = route.request();
      const { pathname } = new URL(req.url());
      const method = req.method();
      api.calls.push(`${method} ${pathname}`);
      const origin = (await req.headerValue('origin')) ?? '*';
      const cors = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      };
      const json = (status: number, body?: unknown) =>
        route.fulfill({
          status,
          headers: { ...cors, 'Content-Type': 'application/json' },
          body: body === undefined ? '' : JSON.stringify(body),
        });
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (method !== 'GET' && (await req.headerValue('x-requested-with')) !== 'beacon') {
        return json(403, { error: { code: 'CSRF', message: 'Missing X-Requested-With header' } });
      }
      if (pathname === '/healthz') return json(200, { ok: true });
      if (pathname === '/v1/auth/google' && method === 'POST') {
        const body = req.postDataJSON() as { code?: string; redirectUri?: string };
        if (body.code !== 'e2e-auth-code' || !body.redirectUri?.endsWith('/auth/callback')) {
          return json(401, { error: { code: 'INVALID_GOOGLE_TOKEN', message: 'Bad code' } });
        }
        api.signedIn = true;
        return json(200, { user: meBody(api).user, isNew: true });
      }
      if (!api.signedIn)
        return json(401, {
          error: { code: 'UNAUTHENTICATED', message: 'Sign in', details: { reason: 'missing' } },
        });
      if (pathname === '/v1/me' && method === 'GET') return json(200, meBody(api));
      if (pathname === '/v1/me' && method === 'PATCH') {
        const body = req.postDataJSON() as {
          consent?: Omit<NonNullable<FakeApi['consent']>, 'at'>;
        };
        if (body.consent) api.consent = { ...body.consent, at: new Date().toISOString() };
        return json(200, meBody(api));
      }
      if (pathname === '/v1/settings' && method === 'PATCH') return json(200, {});
      return json(404, {
        error: { code: 'NOT_FOUND', message: `No fake for ${method} ${pathname}` },
      });
    },
  );
}

/** Google's authorization endpoint answers with a redirect back to the app (no real Google). */
async function fakeGoogle(page: Page, outcome: 'ok' | 'cancel' = 'ok') {
  await page.route(/^https:\/\/accounts\.google\.com\//, (route) => {
    const url = new URL(route.request().url());
    const back = new URL(
      url.searchParams.get('redirect_uri') ?? '/auth/callback',
      page.url() || 'http://localhost:4173',
    );
    if (outcome === 'cancel') back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', 'e2e-auth-code');
    const state = url.searchParams.get('state');
    if (state) back.searchParams.set('state', state);
    return route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
}

/** Console errors and uncaught exceptions (hydration mismatches surface here). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = blocking.map(
    (v) =>
      `${v.id}: ${v.help} → ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(', ')}`,
  );
  expect(summary, `axe ${label}`).toEqual([]);
}

let api: FakeApi;
test.beforeEach(async ({ page }) => {
  api = { signedIn: false, consent: null, calls: [] };
  await installFakeApi(page, api);
});

test.describe('public pages', () => {
  test('landing is prerendered, hydrates cleanly, has one primary call to action and passes axe', async ({
    page,
    request,
  }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('data-prerendered="/"');
    expect(html).toMatch(HEADLINE);

    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Every opportunity that fits you\.\s*Nothing that doesn.t\./,
    );
    await expect(page.getByTestId('google-sign-in').first()).toBeVisible();
    // Anonymous visitors never trigger /v1/me (no 401 noise on the public page).
    expect(api.calls.filter((c) => c.endsWith('/v1/me'))).toEqual([]);
    await expectAccessible(page, '/');
    expect(errors).toEqual([]);
  });

  test('landing keeps its information with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('google-sign-in').first()).toBeVisible();
    await expectAccessible(page, '/ (reduced motion)');
  });

  test('sign-in page is prerendered and passes axe', async ({ page, request }) => {
    const html = await (await request.get('/login')).text();
    expect(html).toContain('data-prerendered="/login"');

    const errors = watchErrors(page);
    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expect(page).toHaveTitle('Sign in · Beacon');
    await expect(page.getByTestId('google-sign-in')).toHaveText('Continue with Google');
    await expectAccessible(page, '/login');
    expect(errors).toEqual([]);
  });

  test('a cancelled Google sign-in explains itself and offers Try again', async ({ page }) => {
    await fakeGoogle(page, 'cancel');
    await page.goto('/login');
    await page.getByTestId('google-sign-in').click();
    await page.waitForURL(/\/login\?error=cancelled/);
    await expect(page.getByTestId('auth-error')).toContainText('Sign-in was cancelled.');
    await expect(
      page.getByTestId('auth-error').getByRole('button', { name: 'Try again' }),
    ).toBeVisible();
    expect(api.calls).not.toContain('POST /v1/auth/google');
  });

  test('unknown paths render the 404 page, never the landing', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
  });
});

test.describe('sign-in flow', () => {
  test('Continue with Google → callback → consent; Continue enables only after a choice', async ({
    page,
  }) => {
    await fakeGoogle(page);
    await page.goto('/login?next=%2Ftracker');
    await page.getByTestId('google-sign-in').click();
    await page.waitForURL('**/welcome');
    expect(api.calls).toContain('POST /v1/auth/google');
    await expect(page.getByTestId('consent-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Before we start' })).toBeVisible();
    await expectAccessible(page, '/welcome');

    const cont = page.getByTestId('consent-continue');
    await expect(cont).toBeDisabled();
    await page.getByRole('radio', { name: /Use Beacon's AI/ }).check();
    await expect(cont).toBeDisabled();
    await page.getByRole('checkbox', { name: /resume text is sent to Meta/ }).check();
    await expect(cont).toBeEnabled();
    await page.getByRole('radio', { name: /Don't use AI/ }).check();
    await expect(cont).toBeEnabled();
    await cont.click();
    await page.waitForURL('**/onboarding/resume');
    expect(api.consent).toMatchObject({ aiMode: 'off', resumeToAi: false });
  });

  test('a stale or forged callback is refused and sends the visitor back to sign in', async ({
    page,
  }) => {
    await page.goto('/auth/callback?code=e2e-auth-code&state=not-the-one-we-sent');
    await page.waitForURL(/\/login\?error=expired/);
    await expect(page.getByTestId('auth-error')).toBeVisible();
    expect(api.calls).not.toContain('POST /v1/auth/google');
  });
});
