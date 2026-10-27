import {
  type AlertChannel,
  DAY_MS,
  DEADLINE_REMINDER_DAYS,
  DEFAULT_TIMEZONE,
  fitBand,
  type NotificationKind,
  type QuietHours,
  TERMINAL_TRACKER_STAGES,
} from '@kestrel/shared';
import { Types } from 'mongoose';

import { matchesConditions } from '../lib/alerts.js';
import { utcDay } from '../lib/dates.js';
import type { PushPayload } from '../lib/push.js';
import { inQuietHours, isLocalHour, localParts, quietHoursEnd } from '../lib/time.js';
import {
  AlertRuleModel,
  type AlertRuleDoc,
  type ListingDoc,
  ListingModel,
  MatchModel,
  type NotificationDoc,
  NotificationModel,
  PushSubscriptionModel,
  SettingsModel,
  type TrackerItemDoc,
  TrackerItemModel,
} from '../models/index.js';
import type { NotifyJob } from '../queues.js';

import type { PipelineDeps } from './deps.js';

const APP = 'Beacon';
const PER_LISTING_PUSH_TTL = 30 * 24 * 3600;
const INSTANT_PUSHES_PER_RULE_RUN = 3;

export interface UserPrefs {
  push: boolean;
  inapp: boolean;
  nudges: boolean;
  quietHours: QuietHours | null;
  timezone: string;
  deadlineReminders: number[];
  digestTime: string;
}

export async function prefsFor(userId: Types.ObjectId): Promise<UserPrefs> {
  const s = await SettingsModel.findOne({ userId }, { notifications: 1 }).lean();
  const n = s?.notifications ?? {};
  return {
    push: n.push ?? true,
    inapp: n.inapp ?? true,
    nudges: n.nudges ?? true,
    quietHours: n.quietHours ?? null,
    timezone: n.timezone ?? DEFAULT_TIMEZONE,
    deadlineReminders: n.deadlineReminders ?? [...DEADLINE_REMINDER_DAYS],
    digestTime: n.digestTime ?? '09:00',
  };
}

export interface DeliverInput {
  userId: Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  dedupeKey: string;
  channels: readonly AlertChannel[];
  listingId?: Types.ObjectId | null;
  trackerItemId?: Types.ObjectId | null;
  alertRuleId?: Types.ObjectId | null;
  quietHours?: QuietHours | null;
  timezone?: string;
  /** Skip quiet hours and caps (explicit test notification). */
  force?: boolean;
  /** Extra Redis NX key that limits pushes (e.g. one nudge push per day). */
  pushOnceKey?: string;
}

export type DeliverResult = 'duplicate' | 'inapp' | 'pushed' | 'queued' | 'capped' | 'push_failed';

/** Push to every subscription of the user; expired ones (404/410) are deleted. */
export async function sendPush(deps: PipelineDeps, userId: Types.ObjectId, payload: PushPayload): Promise<boolean> {
  if (!deps.push.enabled) return false;
  const subs = await PushSubscriptionModel.find({ userId }).lean();
  let delivered = false;
  for (const sub of subs) {
    if (!sub.keys?.p256dh || !sub.keys.auth) continue;
    const res = await deps.push.send({ endpoint: sub.endpoint, keys: sub.keys }, payload);
    if (res.ok) {
      delivered = true;
      await PushSubscriptionModel.updateOne({ _id: sub._id }, { $set: { lastUsedAt: deps.now() } });
    } else if (res.gone) {
      await PushSubscriptionModel.deleteOne({ _id: sub._id });
      deps.metrics.inc('beacon_worker_push_subscriptions_pruned_total', {}, 1, 'Expired push subscriptions deleted');
    } else {
      deps.logger.warn({ userId: String(userId), status: res.status, error: res.error }, 'push failed');
    }
  }
  deps.metrics.inc('beacon_worker_pushes_total', { delivered: String(delivered) }, 1, 'Push sends');
  return delivered;
}

async function pushAllowed(deps: PipelineDeps, userId: Types.ObjectId, listingId: Types.ObjectId | null | undefined, onceKey?: string): Promise<boolean> {
  if (listingId) {
    const fresh = await deps.redis.set(`notify:pushed:${String(userId)}:${String(listingId)}`, '1', 'PX', PER_LISTING_PUSH_TTL * 1000, 'NX');
    if (fresh !== 'OK') return false;
  }
  if (onceKey) {
    const fresh = await deps.redis.set(onceKey, '1', 'PX', 26 * 3600 * 1000, 'NX');
    if (fresh !== 'OK') return false;
  }
  const capKey = `notify:push:${String(userId)}:${utcDay(deps.now())}`;
  const count = await deps.redis.incrby(capKey, 1);
  if (count === 1) await deps.redis.expire(capKey, 2 * 24 * 3600);
  return count <= deps.env.PUSH_DAILY_CAP;
}

/**
 * Creates the in-app notification (idempotent on (user, dedupeKey)) and pushes it when
 * the channel is on — or queues the push until quiet hours end.
 */
export async function deliver(deps: PipelineDeps, input: DeliverInput): Promise<DeliverResult> {
  const now = deps.now();
  const prefs = await prefsFor(input.userId);
  const wantsPush = input.channels.includes('push') && (input.force || prefs.push) && deps.push.enabled;
  const res = await NotificationModel.updateOne(
    { userId: input.userId, dedupeKey: input.dedupeKey },
    {
      $setOnInsert: {
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 2_000),
        url: input.url,
        listingId: input.listingId ?? null,
        trackerItemId: input.trackerItemId ?? null,
        alertRuleId: input.alertRuleId ?? null,
        channels: ['inapp'],
        readAt: null,
        createdAt: now,
        dedupeKey: input.dedupeKey,
        pushStatus: 'none',
        pushAfter: null,
      },
    },
    { upsert: true },
  );
  if (!res.upsertedId) return 'duplicate';
  const id = res.upsertedId as Types.ObjectId;
  deps.metrics.inc('beacon_worker_notifications_total', { kind: input.kind }, 1, 'In-app notifications created');
  if (!wantsPush) return 'inapp';

  const quiet = input.quietHours ?? prefs.quietHours;
  const tz = input.timezone ?? prefs.timezone;
  if (!input.force && inQuietHours(now, quiet, tz) && quiet) {
    await NotificationModel.updateOne({ _id: id }, { $set: { pushStatus: 'pending', pushAfter: quietHoursEnd(now, quiet, tz) } });
    return 'queued';
  }
  if (!input.force && !(await pushAllowed(deps, input.userId, input.listingId, input.pushOnceKey))) return 'capped';
  const ok = await sendPush(deps, input.userId, {
    title: input.title,
    body: input.body,
    url: input.url ?? '/',
    tag: input.dedupeKey,
    notificationId: String(id),
    kind: input.kind,
  });
  await NotificationModel.updateOne({ _id: id }, { $set: { pushStatus: ok ? 'sent' : 'failed', ...(ok ? { channels: ['inapp', 'push'] } : {}) } });
  return ok ? 'pushed' : 'push_failed';
}

/** Pushes that waited for quiet hours to end. */
export async function flushPendingPushes(deps: PipelineDeps, limit = 500): Promise<number> {
  const now = deps.now();
  const pending = await NotificationModel.find({ pushStatus: 'pending', pushAfter: { $lte: now } }).sort({ pushAfter: 1 }).limit(limit).lean<NotificationDoc[]>();
  let sent = 0;
  for (const n of pending) {
    if (!(await pushAllowed(deps, n.userId, n.listingId))) {
      await NotificationModel.updateOne({ _id: n._id }, { $set: { pushStatus: 'none' } });
      continue;
    }
    const ok = await sendPush(deps, n.userId, { title: n.title, body: n.body, url: n.url ?? '/', tag: n.dedupeKey, notificationId: String(n._id), kind: n.kind });
    await NotificationModel.updateOne({ _id: n._id }, { $set: { pushStatus: ok ? 'sent' : 'failed', ...(ok ? { channels: ['inapp', 'push'] } : {}) } });
    if (ok) sent++;
  }
  return sent;
}

function daysUntil(at: Date, now: Date): number {
  return Math.ceil((at.getTime() - now.getTime()) / DAY_MS);
}

function closesText(deadline: Date | null, now: Date): string {
  if (!deadline) return '';
  const d = daysUntil(deadline, now);
  return d <= 0 ? ' · closes today' : d === 1 ? ' · closes tomorrow' : ` · closes in ${d} days`;
}

// ── instant ─────────────────────────────────────────────────────────────────────────

async function notifyInstant(deps: PipelineDeps, job: NotifyJob): Promise<number> {
  if (!job.userId || !job.ruleId || !job.listingIds?.length) return 0;
  const userId = new Types.ObjectId(job.userId);
  const rule = await AlertRuleModel.findOne({ _id: new Types.ObjectId(job.ruleId), userId, enabled: true }).lean<AlertRuleDoc>();
  if (!rule) return 0;
  const now = deps.now();
  const ids = job.listingIds.map((id) => new Types.ObjectId(id));
  const [listings, matches] = await Promise.all([
    ListingModel.find({ _id: { $in: ids } }, { title: 1, company: 1, location: 1, deadlineAt: 1, type: 1 }).lean<ListingDoc[]>(),
    MatchModel.find({ userId, listingId: { $in: ids } }, { listingId: 1, score: 1 }).lean(),
  ]);
  const scores = new Map(matches.map((m) => [String(m.listingId), m.score]));
  const ordered = job.listingIds.map((id) => listings.find((l) => String(l._id) === id)).filter((l): l is ListingDoc => Boolean(l));
  let created = 0;
  for (const [i, l] of ordered.entries()) {
    const score = scores.get(String(l._id)) ?? 0;
    const result = await deliver(deps, {
      userId,
      kind: 'match',
      title: `${fitBand(score)} · ${score}: ${l.title}`,
      body: `${l.company}${l.location[0] ? ` · ${l.location[0]}` : ''}${closesText(l.deadlineAt, now)}`,
      url: `/radar?listing=${String(l._id)}`,
      dedupeKey: `match:${String(rule._id)}:${String(l._id)}`,
      channels: i < INSTANT_PUSHES_PER_RULE_RUN ? rule.channels : rule.channels.filter((c) => c !== 'push'),
      listingId: l._id,
      alertRuleId: rule._id,
      quietHours: rule.quietHours,
      timezone: rule.timezone,
    });
    if (result !== 'duplicate') created++;
  }
  if (created) await AlertRuleModel.updateOne({ _id: rule._id }, { $set: { lastTriggeredAt: now } });
  return created;
}

// ── digests (hourly tick) ───────────────────────────────────────────────────────────

async function ruleDigest(deps: PipelineDeps, rule: AlertRuleDoc): Promise<boolean> {
  const now = deps.now();
  if (!isLocalHour(now, rule.digestTime, rule.timezone)) return false;
  const local = localParts(now, rule.timezone);
  const weekly = rule.cadence === 'weekly';
  if (weekly && local.weekday !== rule.digestDay) return false;
  const minGap = weekly ? 6 * DAY_MS : 20 * 3600_000;
  if (rule.lastDigestAt && now.getTime() - new Date(rule.lastDigestAt).getTime() < minGap) return false;
  const since = rule.lastDigestAt ? new Date(rule.lastDigestAt) : new Date(now.getTime() - (weekly ? 7 : 1) * DAY_MS);

  const matches = await MatchModel.find({ userId: rule.userId, score: { $gte: rule.conditions.minFit } }, { listingId: 1, score: 1 })
    .sort({ score: -1 })
    .limit(1_000)
    .lean();
  const scores = new Map(matches.map((m) => [String(m.listingId), m.score]));
  const fresh = await ListingModel.find(
    { _id: { $in: matches.map((m) => m.listingId) }, firstSeenAt: { $gte: since }, archived: false },
    { title: 1, company: 1, type: 1, location: 1, remote: 1, country: 1, deadlineAt: 1, skillsRequired: 1, skillsNice: 1 },
  ).lean<ListingDoc[]>();
  const hits = fresh
    .filter((l) => matchesConditions(rule.conditions, l, scores.get(String(l._id)) ?? 0, now))
    .sort((a, b) => (scores.get(String(b._id)) ?? 0) - (scores.get(String(a._id)) ?? 0));
  await AlertRuleModel.updateOne({ _id: rule._id }, { $set: { lastDigestAt: now } });
  if (hits.length === 0) return false;
  const top = hits.slice(0, 3).map((l) => `${l.title} (${l.company})`).join(' · ');
  await deliver(deps, {
    userId: rule.userId,
    kind: 'digest',
    title: `${weekly ? 'This week' : 'Today'}: ${hits.length} new ${hits.length === 1 ? 'match' : 'matches'} for “${rule.name}”`,
    body: top,
    url: '/radar?sort=fit',
    dedupeKey: `digest:${String(rule._id)}:${local.date}`,
    channels: rule.channels,
    alertRuleId: rule._id,
    quietHours: rule.quietHours,
    timezone: rule.timezone,
  });
  return true;
}

/** Settings-level daily card: "Today: 6 new Strong fits · 2 deadlines tomorrow". */
async function settingsDigest(deps: PipelineDeps, userId: Types.ObjectId, prefs: UserPrefs): Promise<boolean> {
  const now = deps.now();
  if (!isLocalHour(now, prefs.digestTime, prefs.timezone)) return false;
  const local = localParts(now, prefs.timezone);
  const strong = await MatchModel.find({ userId, score: { $gte: 80 } }, { listingId: 1 }).limit(1_000).lean();
  const newStrong = await ListingModel.countDocuments({
    _id: { $in: strong.map((m) => m.listingId) },
    firstSeenAt: { $gte: new Date(now.getTime() - DAY_MS) },
    archived: false,
  });
  const tomorrow = await TrackerItemModel.countDocuments({
    userId,
    stage: { $nin: [...TERMINAL_TRACKER_STAGES] },
    deadlineAt: { $gte: new Date(now.getTime() + 12 * 3600_000), $lt: new Date(now.getTime() + 36 * 3600_000) },
  });
  if (newStrong + tomorrow === 0) return false;
  const parts = [
    newStrong ? `${newStrong} new Strong ${newStrong === 1 ? 'fit' : 'fits'}` : '',
    tomorrow ? `${tomorrow} ${tomorrow === 1 ? 'deadline' : 'deadlines'} tomorrow` : '',
  ].filter(Boolean);
  const result = await deliver(deps, {
    userId,
    kind: 'digest',
    title: `Today: ${parts.join(' · ')}`,
    body: `Your ${APP} radar for ${local.date}.`,
    url: '/radar',
    dedupeKey: `digest:daily:${local.date}`,
    channels: ['inapp', 'push'],
  });
  return result !== 'duplicate';
}

async function notifyDigest(deps: PipelineDeps, job: NotifyJob): Promise<number> {
  await flushPendingPushes(deps);
  let sent = 0;
  const ruleFilter: Record<string, unknown> = { enabled: true, cadence: { $in: ['daily', 'weekly'] } };
  if (job.userId) ruleFilter.userId = new Types.ObjectId(job.userId);
  if (job.ruleId) ruleFilter._id = new Types.ObjectId(job.ruleId);
  for (const rule of await AlertRuleModel.find(ruleFilter).lean<AlertRuleDoc[]>()) if (await ruleDigest(deps, rule)) sent++;
  if (!job.ruleId) {
    const settingsFilter = job.userId ? { userId: new Types.ObjectId(job.userId) } : {};
    for (const s of await SettingsModel.find(settingsFilter, { userId: 1 }).limit(5_000).lean()) {
      if (await settingsDigest(deps, s.userId, await prefsFor(s.userId))) sent++;
    }
  }
  return sent;
}

// ── deadline reminders (daily 08:00 IST) ─────────────────────────────────────────────

async function notifyDeadlines(deps: PipelineDeps, job: NotifyJob): Promise<number> {
  const now = deps.now();
  const horizon = new Date(now.getTime() + 31 * DAY_MS);
  const filter: Record<string, unknown> = { stage: { $nin: [...TERMINAL_TRACKER_STAGES] } };
  if (job.userId) filter.userId = new Types.ObjectId(job.userId);
  const items = await TrackerItemModel.find(filter).lean<TrackerItemDoc[]>();
  const listingDeadlines = new Map(
    (
      await ListingModel.find(
        { _id: { $in: items.filter((i) => !i.deadlineAt && i.listingId).map((i) => i.listingId) }, deadlineAt: { $gt: now, $lt: horizon } },
        { deadlineAt: 1 },
      ).lean()
    ).map((l) => [String(l._id), l.deadlineAt]),
  );
  let sent = 0;
  const prefsCache = new Map<string, UserPrefs>();
  for (const item of items) {
    const deadline = item.deadlineAt ? new Date(item.deadlineAt) : item.listingId ? (listingDeadlines.get(String(item.listingId)) ?? null) : null;
    if (!deadline || deadline <= now || deadline > horizon) continue;
    const key = String(item.userId);
    const prefs = prefsCache.get(key) ?? (await prefsFor(item.userId));
    prefsCache.set(key, prefs);
    const left = daysUntil(deadline, now);
    const target = [...prefs.deadlineReminders].sort((a, b) => a - b).find((d) => left <= d);
    if (target === undefined) continue;
    const result = await deliver(deps, {
      userId: item.userId,
      kind: 'deadline',
      title: `${left <= 1 ? 'Last day' : `${left} days left`}: ${item.title}`,
      body: `${item.company} · closes ${localParts(deadline, prefs.timezone).date}`,
      url: `/tracker?item=${String(item._id)}`,
      dedupeKey: `deadline:${String(item._id)}:${target}:${deadline.toISOString().slice(0, 10)}`,
      channels: ['inapp', 'push'],
      trackerItemId: item._id,
      listingId: null,
    });
    if (result !== 'duplicate') sent++;
  }
  return sent;
}

// ── follow-up nudges (daily) ────────────────────────────────────────────────────────

const NUDGE_RULES = {
  applied: { followUp: 10, ghosted: 30 },
  interview: { followUp: 7, ghosted: 21 },
} as const;

async function notifyNudges(deps: PipelineDeps, job: NotifyJob): Promise<number> {
  const now = deps.now();
  const filter: Record<string, unknown> = { stage: { $in: Object.keys(NUDGE_RULES) } };
  if (job.userId) filter.userId = new Types.ObjectId(job.userId);
  const items = await TrackerItemModel.find(filter).lean<TrackerItemDoc[]>();
  let sent = 0;
  for (const item of items) {
    const rules = NUDGE_RULES[item.stage as keyof typeof NUDGE_RULES];
    const clock = item.stage === 'applied' ? (item.appliedAt ?? item.lastActivityAt) : item.lastActivityAt;
    if (!clock) continue;
    const start = new Date(clock);
    const days = Math.floor((now.getTime() - start.getTime()) / DAY_MS);
    const kind = days >= rules.ghosted ? 'move_to_ghosted' : days >= rules.followUp ? 'follow_up' : null;
    if (!kind) continue;
    const nudges = item.nudges ?? [];
    // Snoozed ([Snooze 3 days] / [Keep waiting]) = an unsent entry due later.
    if (nudges.some((n) => n.kind === kind && !n.sentAt && new Date(n.dueAt) > now)) continue;
    if (nudges.some((n) => n.kind === kind && n.sentAt && new Date(n.sentAt) >= start)) continue;
    const prefs = await prefsFor(item.userId);
    const followUp = kind === 'follow_up';
    const result = await deliver(deps, {
      userId: item.userId,
      kind: 'nudge',
      title: followUp
        ? item.stage === 'interview'
          ? `Any news from ${item.company}?`
          : `No reply from ${item.company} in ${days} days`
        : `${days} days without a reply from ${item.company}`,
      body: followUp
        ? `${item.title}: a short follow-up often gets one.`
        : `${item.title}: most roles that go quiet this long don't come back. Move it to Ghosted?`,
      url: `/tracker?item=${String(item._id)}`,
      dedupeKey: `nudge:${String(item._id)}:${kind}:${start.toISOString().slice(0, 10)}`,
      channels: prefs.nudges ? ['inapp', 'push'] : ['inapp'],
      trackerItemId: item._id,
      pushOnceKey: `notify:nudgepush:${String(item.userId)}:${utcDay(now)}`,
    });
    if (result === 'duplicate') continue;
    await TrackerItemModel.updateOne({ _id: item._id }, { $push: { nudges: { kind, dueAt: now, sentAt: now, dismissedAt: null } } });
    sent++;
  }
  return sent;
}

async function notifyTest(deps: PipelineDeps, job: NotifyJob): Promise<number> {
  if (!job.userId) return 0;
  const result = await deliver(deps, {
    userId: new Types.ObjectId(job.userId),
    kind: 'system',
    title: `${APP} test notification`,
    body: 'Push and in-app notifications are working.',
    url: '/settings/notifications',
    dedupeKey: `test:${deps.now().getTime()}`,
    channels: ['inapp', 'push'],
    force: true,
  });
  return result === 'pushed' || result === 'inapp' ? 1 : 0;
}

export async function runNotify(deps: PipelineDeps, job: NotifyJob): Promise<number> {
  if (job.test) return notifyTest(deps, job);
  switch (job.kind) {
    case 'instant':
      return notifyInstant(deps, job);
    case 'digest':
      return notifyDigest(deps, job);
    case 'deadline':
      return notifyDeadlines(deps, job);
    case 'nudge':
      return notifyNudges(deps, job);
  }
}
