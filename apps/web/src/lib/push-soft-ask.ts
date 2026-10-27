import { readJson, STORAGE_KEYS, writeJson } from './storage';

/** [Not now] on the push soft ask hides it for 14 days (USERFLOW §2). */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export function pushSoftAskDismissed(now = Date.now()): boolean {
  return readJson<number>(STORAGE_KEYS.pushSoftAsk, 0) > now;
}

export function snoozePushSoftAsk(now = Date.now()): void {
  writeJson(STORAGE_KEYS.pushSoftAsk, now + SNOOZE_MS);
}
