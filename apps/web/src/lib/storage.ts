/** localStorage helpers that never throw (private mode, quota, SSR). All keys use the `beacon:` prefix. */
export const STORAGE_KEYS = {
  appearance: 'beacon:appearance',
  session: 'beacon:session',
  shortcuts: 'beacon:shortcuts',
  rail: 'beacon:rail-collapsed',
  recentListings: 'beacon:recent-listings',
  pushSoftAsk: 'beacon:push-soft-ask',
  queryCache: 'beacon:query-cache',
} as const;

export function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: preferences simply don't persist */
  }
}

export function removeKey(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Session hint: the session cookie is httpOnly, so JS can't see it. We remember "probably signed in"
 * after a successful login or /me, so public pages only call /v1/me when it's likely to succeed
 * (anonymous visitors never trigger a 401 in the console).
 */
export const sessionHint = {
  get: (): boolean => readJson<boolean>(STORAGE_KEYS.session, false),
  set: (value: boolean) => (value ? writeJson(STORAGE_KEYS.session, true) : removeKey(STORAGE_KEYS.session)),
};
