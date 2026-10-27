/**
 * Google sign-in, redirect auth-code flow (USERFLOW §1.1): our button → accounts.google.com →
 * `/auth/callback?code&state` → `POST /v1/auth/google { code, redirectUri }` (docs/API.md §3).
 * `state` is a random value kept in sessionStorage (CSRF protection) together with the `next` path.
 *
 * When `@react-oauth/google` has loaded (the button preloads it on hover/focus) its code client performs
 * the redirect; otherwise `beginGoogleRedirect` builds the identical authorisation URL itself, so a
 * click never waits for a third-party script.
 */
import { env } from './env';

const STATE_KEY = 'beacon:oauth-state';
const MAX_AGE_MS = 10 * 60 * 1000;

interface StoredState {
  state: string;
  next: string | null;
  at: number;
}

export const GOOGLE_SCOPES = 'openid email profile';

export function oauthRedirectUri(): string {
  return `${window.location.origin}/auth/callback`;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Create and remember a fresh `state` for this sign-in attempt. */
export function createOAuthState(next: string | null): string {
  const state = randomState();
  try {
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({ state, next, at: Date.now() } satisfies StoredState),
    );
  } catch {
    /* private mode: the callback will treat the state as unknown and ask to retry */
  }
  return state;
}

/** Validate and consume the stored state. Returns the `next` path (or null) when it matches. */
export function consumeOAuthState(state: string | null): { ok: boolean; next: string | null } {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (!raw || !state) return { ok: false, next: null };
    const stored = JSON.parse(raw) as StoredState;
    const ok = stored.state === state && Date.now() - stored.at < MAX_AGE_MS;
    return { ok, next: ok ? stored.next : null };
  } catch {
    return { ok: false, next: null };
  }
}

export function googleAuthUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.googleClientId);
  url.searchParams.set('redirect_uri', oauthRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

declare global {
  interface Window {
    /** Set by src/mocks/browser.ts when the MSW worker is running. */
    __BEACON_MOCK__?: boolean;
  }
}

/** Fallback redirect without the GIS library. With the MSW mock running, Google is simulated. */
export function beginGoogleRedirect(state: string): void {
  if (env.mockApi && window.__BEACON_MOCK__) {
    window.location.assign(
      `/auth/callback?code=mock-google-code&state=${encodeURIComponent(state)}`,
    );
    return;
  }
  window.location.assign(googleAuthUrl(state));
}
