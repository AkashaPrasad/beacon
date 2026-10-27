/**
 * Mocked Google sign-in and session helpers.
 *
 * - `mockGoogle()` intercepts accounts.google.com: the GIS client script is replaced by a stub
 *   (ID-token, code and token clients), and the OAuth redirect endpoint answers with a 302 back
 *   to the app's `redirect_uri` carrying `code` and the echoed `state` (or `error`). The app
 *   then calls `POST /v1/auth/google`, which the fake API answers from `state.googleLogin`.
 * - `loginAs()` skips the Google round trip and sets the session in the fake API directly, the
 *   way a returning user arrives with a valid `beacon_session` cookie.
 *
 * Nothing here talks to Google; no real credentials exist in the e2e environment.
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';

import type { MockApi } from './mock-api';
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
export async function loginAs(
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
  await byTestId(page, 'auth-google-button').first().click();
  await expect
    .poll(() => api.calls('POST', '/v1/auth/google').length, {
      message: 'POST /v1/auth/google was never called',
    })
    .toBeGreaterThan(0);
  await page.waitForURL((url) => !['/', '/login', '/auth/callback'].includes(url.pathname), {
    timeout: 15_000,
  });
}
