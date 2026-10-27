/**
 * Sign-in helpers for both e2e transports.
 *
 * **MSW mode** (`VITE_MOCK_API=1`, the app's own mock API in a service worker; `smoke-all`,
 * `a11y`): `seedMock()` picks the mock scenario before any app code runs, and
 * `loginAs(page, { as, via })` signs in the way a student does:
 *   - `via: 'form'` (default): the email + password form on `/login` (MSW `POST /v1/auth/login`;
 *     an `admin@…` email signs in as admin). Deterministic: no redirect, no third-party script.
 *   - `via: 'register'`: "Create an account" on the same form (new accounts start at consent).
 *   - `via: 'google'`: [Continue with Google]; in mock mode the button goes straight to
 *     `/auth/callback?code=mock-google-code` (a full page load), then `POST /v1/auth/google`.
 *   - `via: 'session'`: no UI; the tab starts signed in (`beacon:mock:user`), for specs that only
 *     need a signed-in page.
 *   Returns the pathname the app landed on (`/radar`, `/welcome`, …).
 *
 * **Fake-API mode** (`page.route`, `e2e/utils/mock-api.ts`; the older QA specs):
 * `mockGoogle()` intercepts accounts.google.com (GIS stub + OAuth redirect), and
 * `loginAs(target, api, user)` sets the session in the fake API directly.
 *
 * Nothing here talks to Google; no real credentials exist in the e2e environment.
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';

import { MockApi } from './mock-api';
import { fixtureUsers, type FixtureUser, type FixtureUserName } from './mock-data';
import { byTestId } from './routes';

export interface GoogleMockOptions {
  /** 'ok' (default) returns a code; 'cancel' returns error=access_denied. */
  outcome?: 'ok' | 'cancel';
}

/** A syntactically valid, unsigned, obviously fake ID token (header.payload.signature). */
export function fakeIdToken(user: FixtureUser): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: 'e2e', aud: 'e2e', sub: user.id, email: user.email, email_verified: true, name: user.name })}.e2e`;
}

const GIS_STUB = (credential: string, outcome: 'ok' | 'cancel') => `
(() => {
  const outcome = ${JSON.stringify(outcome)};
  const redirect = (cfg) => {
    const u = new URL(cfg.redirect_uri || (location.origin + '/auth/callback'));
    if (outcome === 'cancel') u.searchParams.set('error', 'access_denied');
    else { u.searchParams.set('code', 'e2e-auth-code'); u.searchParams.set('scope', cfg.scope || 'openid email profile'); }
    if (cfg.state) u.searchParams.set('state', cfg.state);
    location.assign(u.toString());
  };
  window.google = window.google || {};
  window.google.accounts = {
    id: {
      initialize(cfg) { this._cfg = cfg; },
      prompt() { if (outcome === 'ok') this._cfg?.callback?.({ credential: ${JSON.stringify(credential)}, select_by: 'btn' }); },
      renderButton(el) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = 'Sign in with Google';
        b.onclick = () => this.prompt();
        el.appendChild(b);
      },
      disableAutoSelect() {}, cancel() {}, revoke(_h, cb) { cb?.({ successful: true }); },
    },
    oauth2: {
      initCodeClient(cfg) {
        return { requestCode() {
          if (cfg.ux_mode === 'redirect') return redirect(cfg);
          if (outcome === 'cancel') return cfg.error_callback?.({ type: 'popup_closed' });
          cfg.callback?.({ code: 'e2e-auth-code', scope: cfg.scope, state: cfg.state });
        } };
      },
      initTokenClient(cfg) {
        return { requestAccessToken() {
          if (outcome === 'cancel') return cfg.error_callback?.({ type: 'popup_closed' });
          cfg.callback?.({ access_token: 'e2e-access-token', expires_in: 3599, scope: cfg.scope, token_type: 'Bearer' });
        } };
      },
      hasGrantedAllScopes() { return true; }, revoke(_t, cb) { cb?.(); },
    },
  };
  // @react-oauth/google waits for the script's onload; nothing else to do.
})();
`;

/** Intercept Google sign-in for every page in the context. */
export async function mockGoogle(
  target: Page | BrowserContext,
  user: FixtureUser = fixtureUsers.aarav,
  opts: GoogleMockOptions = {},
): Promise<void> {
  const outcome = opts.outcome ?? 'ok';
  await target.route('https://accounts.google.com/gsi/client*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: GIS_STUB(fakeIdToken(user), outcome),
    }),
  );
  await target.route('https://accounts.google.com/gsi/style*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  // Redirect flow: /o/oauth2/v2/auth?client_id=…&redirect_uri=…&state=…
  await target.route(/^https:\/\/accounts\.google\.com\/o\/oauth2\//, (route) => {
    const u = new URL(route.request().url());
    const back = new URL(
      u.searchParams.get('redirect_uri') ?? 'http://localhost:4173/auth/callback',
    );
    if (outcome === 'cancel') back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', 'e2e-auth-code');
    const state = u.searchParams.get('state');
    if (state) back.searchParams.set('state', state);
    return route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
}

/**
 * Returning user: the fake API treats the browser as signed in as `user`, and the web app's
 * session hint (`localStorage['beacon:session']`, see apps/web/src/lib/storage.ts) is set once
 * per tab, so public pages call `GET /v1/me` the way they do after a real sign-in.
 */
async function loginAsFake(
  target: Page | BrowserContext,
  api: MockApi,
  user: FixtureUser | FixtureUserName = 'aarav',
): Promise<FixtureUser> {
  const u = typeof user === 'string' ? fixtureUsers[user] : user;
  api.signIn(u);
  api.state.googleLogin = { user: u, isNew: u.onboardingStep === 'consent' };
  await target.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('e2e:session-hint')) {
        localStorage.setItem('beacon:session', 'true');
        sessionStorage.setItem('e2e:session-hint', '1');
      }
    } catch {
      /* storage blocked: the app falls back to calling /v1/me */
    }
  });
  return u;
}

export function signOut(api: MockApi): void {
  api.state.session = null;
}

/**
 * Full mocked Google sign-in from the current page: clicks [Continue with Google], follows the
 * redirect round trip and waits until the app leaves the public pages.
 */
export async function signInWithGoogle(
  page: Page,
  api: MockApi,
  user: FixtureUser = fixtureUsers.aarav,
): Promise<void> {
  api.state.session = null;
  api.state.googleLogin = { user, isNew: user.onboardingStep === 'consent' };
  await mockGoogle(page, user);
  await byTestId(page, 'google-sign-in').first().click();
  await expect
    .poll(() => api.calls('POST', '/v1/auth/google').length, {
      message: 'POST /v1/auth/google was never called',
    })
    .toBeGreaterThan(0);
  await page.waitForURL((url) => !['/', '/login', '/auth/callback'].includes(url.pathname), {
    timeout: 15_000,
  });
}

// ── MSW mode (VITE_MOCK_API=1) ──────────────────────────────────────────────────────────────────

/** `localStorage['beacon:mock:user']` values (apps/web/src/mocks/state.ts). */
export type MockScenario = 'returning' | 'admin' | 'new' | 'consent' | 'signed-out';

export interface MockAppearance {
  theme?: 'light' | 'dark' | 'system';
  density?: 'comfortable' | 'compact';
  accent?: string;
  fontSize?: 'sm' | 'md' | 'lg';
  reducedMotion?: 'system' | 'reduce' | 'no-preference';
}

export interface MockSeed {
  scenario: MockScenario;
  /** Extra mock switches (docs/WEB.md §6), e.g. `{ 'beacon:mock:radar': 'large' }`. */
  storage?: Record<string, string>;
  /** Written to `beacon:appearance` (read by index.html's inline script before first paint). */
  appearance?: MockAppearance;
}

/** The fixture account MSW signs in (src/mocks/state.ts). */
export const MOCK_USER = {
  id: '65f0c0ffee0000000000a001',
  name: 'Aarav Mehta',
  email: 'aarav.mehta@example.com',
  adminEmail: 'admin@beacon.test',
  /** MSW accepts any password of ≥ 8 characters that does not contain "wrong". */
  password: 'correct-horse-battery',
} as const;

/**
 * Pick the MSW scenario for this tab before any app code runs. Applied once per tab
 * (sessionStorage guard), so reloads keep whatever the app wrote since (sign-in/out, theme).
 */
export async function seedMock(target: Page | BrowserContext, seed: MockSeed): Promise<void> {
  await target.addInitScript((s: MockSeed) => {
    try {
      if (sessionStorage.getItem('qa:mock-seeded')) return;
      sessionStorage.setItem('qa:mock-seeded', '1');
      localStorage.setItem('beacon:mock:user', s.scenario);
      localStorage.removeItem('beacon:mock:session');
      const signedIn =
        s.scenario === 'returning' || s.scenario === 'admin' || s.scenario === 'consent';
      if (signedIn) localStorage.setItem('beacon:session', 'true');
      else localStorage.removeItem('beacon:session');
      for (const [k, v] of Object.entries(s.storage ?? {})) localStorage.setItem(k, v);
      if (s.appearance) {
        const current = JSON.parse(localStorage.getItem('beacon:appearance') ?? '{}') as object;
        localStorage.setItem('beacon:appearance', JSON.stringify({ ...current, ...s.appearance }));
      }
    } catch {
      /* storage blocked: the mock defaults apply (returning, signed in) */
    }
  }, seed);
}

/**
 * Wait until the app has booted: MSW answering (mock mode) and React attached to `selector`
 * (prerendered pages show their markup before hydration; a click before that does nothing).
 */
export async function waitForApp(page: Page, selector = '#root > *'): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const w = window as Window & { __BEACON_MOCK__?: boolean };
      const el = document.querySelector(sel);
      const reactReady = Boolean(el && Object.keys(el).some((k) => k.startsWith('__react')));
      return reactReady && w.__BEACON_MOCK__ === true;
    },
    selector,
    { timeout: 20_000 },
  );
}

export interface MockLoginOptions {
  /** Which account: onboarded student (default), admin, or a brand-new student (lands on consent). */
  as?: 'returning' | 'admin' | 'new';
  via?: 'form' | 'register' | 'google' | 'session';
  storage?: MockSeed['storage'];
  appearance?: MockAppearance;
  /** Sign in from `/login?next=…` (safe in-app path to continue to). */
  next?: string;
}

async function loginWithMsw(page: Page, opts: MockLoginOptions = {}): Promise<string> {
  const as = opts.as ?? 'returning';
  const via = opts.via ?? 'form';
  if (via === 'session') {
    await seedMock(page, {
      scenario: as === 'new' ? 'consent' : as,
      storage: opts.storage,
      appearance: opts.appearance,
    });
    return '';
  }
  await seedMock(page, {
    scenario: as === 'new' ? 'new' : 'signed-out',
    storage: opts.storage,
    appearance: opts.appearance,
  });
  await page.goto(opts.next ? `/login?next=${encodeURIComponent(opts.next)}` : '/login');
  await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 20_000 });

  if (via === 'google') {
    await waitForApp(page, '[data-testid="google-sign-in"]');
    await page.getByTestId('google-sign-in').first().click();
  } else {
    await waitForApp(page, '[data-testid="email-auth-form"]');
    const form = page.getByTestId('email-auth-form');
    if (via === 'register') {
      await form.getByTestId('email-auth-toggle').click();
      await expect(form).toHaveAttribute('data-mode', 'register');
      await form.getByTestId('email-auth-name').fill(MOCK_USER.name);
    }
    await form
      .getByTestId('email-auth-email')
      .fill(as === 'admin' ? MOCK_USER.adminEmail : MOCK_USER.email);
    await form.getByTestId('email-auth-password').fill(MOCK_USER.password);
    await form.getByTestId('email-auth-submit').click();
  }
  await page.waitForURL((url) => !['/login', '/auth/callback'].includes(url.pathname), {
    timeout: 20_000,
  });
  return new URL(page.url()).pathname;
}

/**
 * Sign in.
 *   loginAs(page)                                   MSW: onboarded student via the email form → /radar
 *   loginAs(page, { as: 'new', via: 'google' })     MSW: new student via mock Google → /welcome
 *   loginAs(page, { via: 'session' })               MSW: no UI, the tab starts signed in
 *   loginAs(context, api, fixtureUsers.newbie)      fake API (page.route): session set directly
 */
export function loginAs(page: Page, opts?: MockLoginOptions): Promise<string>;
export function loginAs(
  target: Page | BrowserContext,
  api: MockApi,
  user?: FixtureUser | FixtureUserName,
): Promise<FixtureUser>;
export function loginAs(
  target: Page | BrowserContext,
  apiOrOpts?: MockApi | MockLoginOptions,
  user?: FixtureUser | FixtureUserName,
): Promise<string | FixtureUser> {
  if (apiOrOpts instanceof MockApi) return loginAsFake(target, apiOrOpts, user);
  if (!('goto' in target)) throw new Error('loginAs (MSW mode) needs a Page, not a BrowserContext');
  return loginWithMsw(target, apiOrOpts);
}
