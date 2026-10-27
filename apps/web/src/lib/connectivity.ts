import { useSyncExternalStore } from 'react';

import { env } from './env';

/**
 * Online state = `navigator.onLine` AND the API answering `/healthz`. A failed request (network error)
 * triggers a probe; while the probe fails we re-probe every 15 s. Probes never run on load, so public
 * pages make no extra requests.
 */
type State = { browserOnline: boolean; apiReachable: boolean };

let state: State = {
  browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  apiReachable: true,
};
const listeners = new Set<() => void>();
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probing = false;

function set(next: Partial<State>) {
  const merged = { ...state, ...next };
  if (merged.browserOnline === state.browserOnline && merged.apiReachable === state.apiReachable)
    return;
  state = merged;
  listeners.forEach((l) => l());
}

export async function probeApi(): Promise<boolean> {
  if (probing) return state.apiReachable;
  probing = true;
  try {
    const res = await fetch(`${env.apiUrl}/healthz`, { cache: 'no-store', credentials: 'omit' });
    set({ apiReachable: res.ok });
  } catch {
    set({ apiReachable: false });
  } finally {
    probing = false;
  }
  if (!state.apiReachable && !probeTimer) {
    probeTimer = setTimeout(() => {
      probeTimer = null;
      void probeApi();
    }, 15_000);
  }
  return state.apiReachable;
}

/** Called by the API client when a request fails at the network layer. */
export function reportNetworkFailure(): void {
  void probeApi();
}

/** Called by the API client after any response arrives (the API is reachable). */
export function reportNetworkSuccess(): void {
  if (!state.apiReachable) set({ apiReachable: true });
}

let installed = false;
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('online', () => {
    set({ browserOnline: true });
    void probeApi();
  });
  window.addEventListener('offline', () => set({ browserOnline: false }));
}

function subscribe(listener: () => void) {
  install();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectivity(): State {
  return state;
}

/** `true` when the browser is offline or the API stopped answering. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !state.browserOnline || !state.apiReachable,
    () => false,
  );
}
