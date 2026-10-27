/**
 * Delivery helpers for the Alerts screen (pure): rule ↔ request mapping beyond the sentence, the quiet
 * hours and reminder summaries, the web-push status line and test-toast copy. DESIGN §8 copy voice.
 */
import type { AlertRule, AlertRuleInput, AlertRulePatch } from '@kestrel/shared';

import type { PushPermission } from './push-ask';

/** Deadline reminder steps offered in the Delivery panel (USERFLOW §3.3). */
export const REMINDER_STEPS = [7, 3, 1] as const;

/** `[7, 1]` → "7 and 1 days before"; `[]` → "Off". */
export function remindersSummary(days: readonly number[]): string {
  const sorted = [...new Set(days)].filter((d) => d > 0).sort((a, b) => b - a);
  if (sorted.length === 0) return 'Off';
  const list =
    sorted.length === 1
      ? String(sorted[0])
      : `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1] ?? ''}`;
  return `${list} ${sorted.length === 1 && sorted[0] === 1 ? 'day' : 'days'} before`;
}

/** ToggleGroup values ("7", "3") → sorted unique day numbers, largest first. */
export function parseReminderValues(values: readonly string[]): number[] {
  return [...new Set(values.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 30))].sort(
    (a, b) => b - a,
  );
}

const ZONES: Record<string, string> = { 'Asia/Kolkata': 'IST', 'Asia/Calcutta': 'IST', UTC: 'UTC' };

export function zoneLabel(timeZone: string): string {
  if (ZONES[timeZone]) return ZONES[timeZone];
  try {
    return (
      new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
    );
  } catch {
    return timeZone;
  }
}

/** "22:00–07:00 IST" or null when quiet hours are off. */
export function quietHoursSummary(
  quiet: { start: string; end: string } | null | undefined,
  timeZone = 'Asia/Kolkata',
): string | null {
  if (!quiet || quiet.start === quiet.end) return null;
  return `${quiet.start}–${quiet.end} ${zoneLabel(timeZone)}`;
}

/** True when `at` (local "HH:mm") falls inside quiet hours that may wrap past midnight. */
export function isInQuietHours(quiet: { start: string; end: string } | null | undefined, at: string): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  const { start, end } = quiet;
  return start < end ? at >= start && at < end : at >= start || at < end;
}

export type PushStatusKind = 'on' | 'not-set-up' | 'off' | 'blocked' | 'ios-install' | 'unsupported';

export interface PushStatus {
  kind: PushStatusKind;
  label: string;
  detail: string;
  /** A [Turn on] button makes sense (always from a click: USERFLOW §2). */
  canTurnOn: boolean;
}

export function pushStatus(env: { permission: PushPermission; iosNeedsInstall: boolean }, subscribed: boolean): PushStatus {
  if (env.iosNeedsInstall) {
    return {
      kind: 'ios-install',
      label: 'Needs the Home Screen app',
      detail: 'To get notifications on iPhone, add Beacon to your Home Screen (Share → Add to Home Screen).',
      canTurnOn: false,
    };
  }
  switch (env.permission) {
    case 'unsupported':
      return {
        kind: 'unsupported',
        label: 'Not available here',
        detail: "This browser can't show push notifications. In-app alerts still work.",
        canTurnOn: false,
      };
    case 'denied':
      return {
        kind: 'blocked',
        label: 'Blocked in this browser',
        detail: 'Allow notifications for this site in the browser settings, then reload.',
        canTurnOn: false,
      };
    case 'granted':
      return subscribed
        ? { kind: 'on', label: 'On in this browser', detail: 'Rules with Push reach this device.', canTurnOn: false }
        : {
            kind: 'not-set-up',
            label: 'Allowed, not set up here',
            detail: 'Turn it on to get pushes on this device.',
            canTurnOn: true,
          };
    case 'default':
      return { kind: 'off', label: 'Off in this browser', detail: 'Beacon asks only when you turn it on.', canTurnOn: true };
  }
}

/** Per-browser "how to unblock" help (USERFLOW §2, permission previously denied). */
export function unblockHelp(userAgent: string): string {
  if (/Firefox\//.test(userAgent)) return 'Firefox: click the lock in the address bar → Permissions → Notifications → Allow.';
  if (/Edg\//.test(userAgent)) return 'Edge: click the lock in the address bar → Permissions for this site → Notifications → Allow.';
  if (/Chrome\//.test(userAgent)) return 'Chrome: click the site icon in the address bar → Site settings → Notifications → Allow.';
  if (/Safari\//.test(userAgent)) return 'Safari: Settings → Websites → Notifications → set Beacon to Allow.';
  return 'Open this site’s permissions in your browser settings and allow notifications.';
}

/** Toast after [Send test] (≤ 12 words). */
export function testToastCopy(channels: readonly string[], pushReady: boolean): string {
  return channels.includes('push') && pushReady
    ? 'Test sent to push and in-app.'
    : 'Test sent. It shows up in your notifications.';
}

/** "Strong fit internships (copy)", kept within the 80-character name limit. */
export function duplicateName(name: string): string {
  const suffix = ' (copy)';
  const base = name.replace(/ \(copy\)$/, '').trim();
  return `${base.slice(0, 80 - suffix.length)}${suffix}`;
}

type RuleShape = Pick<
  AlertRule,
  'name' | 'enabled' | 'conditions' | 'channels' | 'cadence' | 'digestTime' | 'digestDay' | 'quietHours' | 'timezone'
>;

/** A rule as a create body (Duplicate). */
export function ruleToInput(rule: RuleShape, patch: Partial<AlertRuleInput> = {}): AlertRuleInput {
  return {
    name: rule.name,
    enabled: rule.enabled,
    conditions: { ...rule.conditions },
    channels: [...rule.channels],
    cadence: rule.cadence,
    digestTime: rule.digestTime,
    digestDay: rule.digestDay,
    quietHours: rule.quietHours ?? null,
    timezone: rule.timezone,
    ...patch,
  };
}

/**
 * The PATCH for an edited rule: what the editor owns (sentence, name, channels, cadence, the rule's
 * quiet hours). The time zone and the enabled switch are left as they are.
 */
export function inputToPatch(input: AlertRuleInput): AlertRulePatch {
  const c = input.conditions ?? {};
  return {
    name: input.name,
    conditions: {
      minFit: c.minFit ?? 70,
      types: c.types ?? [],
      maxDeadlineDays: c.maxDeadlineDays ?? null,
      locations: c.locations ?? [],
      remote: c.remote ?? 'any',
      keywords: c.keywords ?? [],
    },
    channels: input.channels ?? ['inapp'],
    cadence: input.cadence ?? 'instant',
    digestTime: input.digestTime ?? '09:00',
    digestDay: input.digestDay ?? 1,
    quietHours: input.quietHours ?? null,
  };
}
