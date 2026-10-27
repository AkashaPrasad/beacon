/**
 * Push permission soft-ask rules (USERFLOW §2). The browser prompt only ever opens from a click on
 * our own button, after a soft ask; never on load. Pure helpers + a tiny per-device memory.
 */

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushEnvironment {
  permission: PushPermission;
  /** iOS/iPadOS Safari running in a normal tab (push requires an installed Home Screen app). */
  iosNeedsInstall: boolean;
}

export type SoftAskMode =
  | 'none' // permission already granted, or the push channel isn't selected
  | 'ask' // show the soft ask card with [Allow notifications] [Not now]
  | 'ios-install' // show "Add to Home Screen" guidance instead
  | 'blocked' // denied: never ask again, point to Settings
  | 'unsupported'; // this browser can't do web push

export function softAskMode(env: PushEnvironment, pushSelected: boolean): SoftAskMode {
  if (!pushSelected) return 'none';
  if (env.iosNeedsInstall) return 'ios-install';
  switch (env.permission) {
    case 'granted':
      return 'none';
    case 'denied':
      return 'blocked';
    case 'unsupported':
      return 'unsupported';
    case 'default':
      // In the rule builder the ask is scoped to the rule being built, so an earlier "Not now"
      // elsewhere doesn't hide it (USERFLOW §2 "First alert rule with Push").
      return 'ask';
  }
}

/** "Don't ask again for 14 days" (USERFLOW §2 first-save trigger). */
export const SOFT_ASK_QUIET_MS = 14 * 86_400_000;

export function detectIosNeedsInstall(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined, standalone: boolean): boolean {
  if (!nav) return false;
  const ua = nav.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  return iOS && !standalone;
}

export function readPermission(): PushPermission {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

const KEY = 'beacon:alerts:push-soft-ask';

export function readSoftAskDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeSoftAskDismissedAt(at: number): void {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    /* private mode: the card simply shows again next time */
  }
}

/** `usePushSubscription().support` / `getPushSupport()` → the environment `softAskMode` reads. */
export function envFromSupport(
  support: 'unsupported' | 'ios-needs-install' | 'default' | 'granted' | 'denied',
): PushEnvironment {
  if (support === 'ios-needs-install') return { permission: 'default', iosNeedsInstall: true };
  return { permission: support, iosNeedsInstall: false };
}
