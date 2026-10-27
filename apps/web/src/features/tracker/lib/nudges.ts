/**
 * Tracker nudge clock (USERFLOW §4.1). Pure: give it an item and "now", get the nudge (if any).
 *
 * | Stage     | Clock starts                    | Nudge                      | Escalation          |
 * | Applied   | max(appliedAt, lastActivityAt)  | +10 d → follow-up          | +30 d → ghosted     |
 * | Interview | lastActivityAt                  | +7 d  → "Any news?"        | +21 d → ghosted     |
 * | OA / Test | deadlineAt (OA deadline)        | −1 d  → reminder           | —                   |
 * | Offer     | deadlineAt (offer deadline)     | −3 d / −1 d → reminder     | —                   |
 *
 * Snoozes come from the item's server-side `nudges[]` (a future `dueAt` or a `dismissedAt`) and,
 * until the API accepts nudge writes, from a per-device snooze map (see `snoozes.ts`).
 */
import { DAY_MS, NUDGE_FOLLOW_UP_DAYS, NUDGE_GHOSTED_DAYS, type TrackerStage } from '@kestrel/shared';

export const INTERVIEW_CHECK_DAYS = 7;
export const INTERVIEW_GHOSTED_DAYS = 21;
export const FOLLOWED_UP_RECHECK_DAYS = 7;
export const SNOOZE_DAYS = 3;
export const KEEP_WAITING_DAYS = 14;

export type NudgeKind =
  | 'follow_up' // Applied +10 d
  | 'move_to_ghosted' // Applied +30 d, Interview +21 d
  | 'interview_check' // Interview +7 d
  | 'oa_due' // OA deadline tomorrow
  | 'offer_due'; // Offer deadline in ≤ 3 d

export interface NudgeInput {
  stage: TrackerStage;
  appliedAt: Date | string | null;
  lastActivityAt: Date | string;
  deadlineAt?: Date | string | null;
  nudges?: readonly {
    kind: string;
    dueAt: Date | string;
    sentAt?: Date | string | null;
    dismissedAt?: Date | string | null;
  }[];
}

export interface Nudge {
  kind: NudgeKind;
  /** Whole days since the clock started (or until the deadline for *_due kinds). */
  days: number;
  /** "warning" shows `BellDot` on the card; "danger" is reserved for the ghosted suggestion. */
  tone: 'warning' | 'danger';
}

/** Per-kind snooze: no nudge of that kind before `until`. `kind: '*'` silences everything. */
export interface Snooze {
  kind: NudgeKind | '*';
  until: Date | string;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days elapsed from `from` to `now` (floor; never negative). */
export function daysBetween(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

/** Whole days until `at` (ceil, so "tomorrow 23:59" is 1 from today noon). */
export function daysUntil(at: Date, now: Date): number {
  return Math.ceil((at.getTime() - now.getTime()) / DAY_MS);
}

/** When the item's follow-up clock started (null when the stage has no clock). */
export function clockStart(item: NudgeInput): Date | null {
  const activity = toDate(item.lastActivityAt);
  if (item.stage === 'applied') {
    const applied = toDate(item.appliedAt);
    if (applied && activity) return applied > activity ? applied : activity;
    return applied ?? activity;
  }
  if (item.stage === 'interview') return activity;
  return null;
}

function isSnoozed(
  kind: NudgeKind,
  item: NudgeInput,
  now: Date,
  snoozes: readonly Snooze[] = [],
): boolean {
  for (const s of snoozes) {
    if (s.kind !== '*' && s.kind !== kind) continue;
    const until = toDate(s.until);
    if (until && until > now) return true;
  }
  // Server-side nudges: a dismissed nudge silences its kind until the clock restarts (the server
  // clears pending nudges on any stage change), and a future dueAt is a snooze.
  const serverKind = kind === 'follow_up' || kind === 'interview_check' ? 'follow_up' : kind;
  for (const n of item.nudges ?? []) {
    if (n.kind !== serverKind) continue;
    if (toDate(n.dismissedAt)) return true;
    const due = toDate(n.dueAt);
    if (due && due > now && !toDate(n.sentAt)) return true;
  }
  return false;
}

/** The single most relevant nudge for a card right now, or null. */
export function computeNudge(
  item: NudgeInput,
  now: Date,
  snoozes: readonly Snooze[] = [],
): Nudge | null {
  const candidates: Nudge[] = [];

  if (item.stage === 'applied' || item.stage === 'interview') {
    const start = clockStart(item);
    if (start) {
      const days = daysBetween(start, now);
      const ghostAt = item.stage === 'applied' ? NUDGE_GHOSTED_DAYS : INTERVIEW_GHOSTED_DAYS;
      const firstAt = item.stage === 'applied' ? NUDGE_FOLLOW_UP_DAYS : INTERVIEW_CHECK_DAYS;
      if (days >= ghostAt) candidates.push({ kind: 'move_to_ghosted', days, tone: 'danger' });
      if (days >= firstAt) {
        candidates.push({
          kind: item.stage === 'applied' ? 'follow_up' : 'interview_check',
          days,
          tone: 'warning',
        });
      }
    }
  }

  if (item.stage === 'oa' || item.stage === 'offer') {
    const deadline = toDate(item.deadlineAt);
    if (deadline && deadline > now) {
      const left = daysUntil(deadline, now);
      const window = item.stage === 'oa' ? 1 : 3;
      if (left <= window) {
        candidates.push({ kind: item.stage === 'oa' ? 'oa_due' : 'offer_due', days: left, tone: 'warning' });
      }
    }
  }

  // Escalation first; if the ghosted suggestion is snoozed ("Keep waiting"), fall back to the
  // follow-up nudge only when that one is not snoozed either.
  return candidates.find((n) => !isSnoozed(n.kind, item, now, snoozes)) ?? null;
}

/** Copy for a nudge (DESIGN §8 #14/#15, USERFLOW §4). */
export function nudgeCopy(nudge: Nudge, company: string): { title: string; body: string } {
  switch (nudge.kind) {
    case 'follow_up':
      return {
        title: `No reply from ${company} in ${nudge.days} days.`,
        body: 'A short follow-up often gets one.',
      };
    case 'move_to_ghosted':
      return {
        title: `${nudge.days} days without a reply.`,
        body: "Most roles that go quiet this long don't come back.",
      };
    case 'interview_check':
      return { title: `Any news from ${company}?`, body: `Your last interview was ${nudge.days} days ago.` };
    case 'oa_due':
      return {
        title: nudge.days <= 1 ? 'Your test is due within a day.' : `Your test is due in ${nudge.days} days.`,
        body: `The ${company} assessment closes soon.`,
      };
    case 'offer_due':
      return {
        title: `Offer deadline in ${nudge.days} ${nudge.days === 1 ? 'day' : 'days'}.`,
        body: `Decide on ${company} before it lapses.`,
      };
  }
}

/** Short label for the card footer indicator. */
export function nudgeLabel(nudge: Nudge): string {
  switch (nudge.kind) {
    case 'follow_up':
      return 'Follow up';
    case 'move_to_ghosted':
      return 'Move to Ghosted?';
    case 'interview_check':
      return 'Any news?';
    case 'oa_due':
      return 'Test due';
    case 'offer_due':
      return 'Offer due';
  }
}

/** Snooze to add for each nudge action (USERFLOW §4.2/§4.3). */
export function snoozeFor(
  action: 'snooze' | 'followed_up' | 'keep_waiting',
  kind: NudgeKind,
  now: Date,
): Snooze {
  const days =
    action === 'snooze' ? SNOOZE_DAYS : action === 'followed_up' ? FOLLOWED_UP_RECHECK_DAYS : KEEP_WAITING_DAYS;
  // "I followed up" restarts the follow-up clock, so it silences both follow-up style nudges.
  return { kind: action === 'followed_up' ? '*' : kind, until: new Date(now.getTime() + days * DAY_MS) };
}
