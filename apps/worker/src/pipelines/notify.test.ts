import { Types } from 'mongoose';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { contentHash } from '@kestrel/shared';

import { runCleanup } from './cleanup.js';
import { applyCheckStatus, checkApplyUrl, ghostcheckListing, redirectedToHome } from './ghostcheck.js';
import { runNotify } from './notify.js';
import { inQuietHours, quietHoursEnd } from '../lib/time.js';
import {
  AlertRuleModel,
  InteractionModel,
  ListingModel,
  MatchModel,
  NotificationModel,
  PushSubscriptionModel,
  SettingsModel,
  SourceRunModel,
  TrackerItemModel,
} from '../models/index.js';
import { normaliseNotifyJob } from '../processors.js';
import { testDeps } from '../test/deps.js';
import { useMongo } from '../test/mongo.js';
import { TEST_NOW } from '../test/samples.js';


useMongo();
beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

const DAY = 86_400_000;
let seq = 0;

async function listing(partial: Record<string, unknown> = {}) {
  seq++;
  const doc = await ListingModel.create({
    type: 'internship',
    title: `SDE Intern ${seq}`,
    company: 'Acme',
    location: ['Bengaluru'],
    applyUrl: `https://jobs.acme.test/postings/${seq}`,
    sourceId: new Types.ObjectId(),
    canonicalKey: `acme|sde intern ${seq}|bengaluru`,
    contentHash: contentHash(String(seq)),
    firstSeenAt: TEST_NOW,
    lastSeenAt: TEST_NOW,
    ...partial,
  });
  return doc;
}

async function pushUser(quietHours: { start: string; end: string } | null = null) {
  const userId = new Types.ObjectId();
  await SettingsModel.create({ userId, notifications: { push: true, inapp: true, quietHours, timezone: 'Asia/Kolkata' } });
  await PushSubscriptionModel.create({ userId, endpoint: `https://push.test/${String(userId)}`, keys: { p256dh: 'p', auth: 'a' } });
  return userId;
}

async function instantRule(userId: Types.ObjectId, quietHours: { start: string; end: string } | null = null) {
  return AlertRuleModel.create({
    userId,
    name: 'Strong fits',
    enabled: true,
    conditions: { minFit: 70, types: [], maxDeadlineDays: null, locations: [], remote: 'any', keywords: [] },
    channels: ['inapp', 'push'],
    cadence: 'instant',
    digestTime: '09:00',
    digestDay: 1,
    quietHours,
    timezone: 'Asia/Kolkata',
  });
}

describe('notify: instant', () => {
  it('creates one in-app notification + push per (user, listing, rule) — re-runs are deduped', async () => {
    const deps = testDeps();
    const userId = await pushUser();
    const rule = await instantRule(userId);
    const l = await listing({ deadlineAt: new Date(TEST_NOW.getTime() + 5 * DAY) });
    await MatchModel.create({ userId, listingId: l._id, score: 86, matchHash: 'h', profileHash: 'h', listingType: 'internship', computedAt: TEST_NOW });
    const job = { kind: 'instant' as const, userId: String(userId), ruleId: String(rule._id), listingIds: [String(l._id)] };
    expect(await runNotify(deps, job)).toBe(1);
    expect(await runNotify(deps, job)).toBe(0);
    const notes = await NotificationModel.find({ userId }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: 'match', pushStatus: 'sent', channels: ['inapp', 'push'], url: `/radar?listing=${String(l._id)}` });
    expect(notes[0]!.title).toBe(`Strong fit · 86: ${l.title}`);
    expect(notes[0]!.body).toContain('closes in 5 days');
    expect(deps.push.sent).toHaveLength(1);
    expect(deps.push.sent[0]!.payload).toMatchObject({ url: `/radar?listing=${String(l._id)}`, kind: 'match' });
    expect((await AlertRuleModel.findById(rule._id).lean())!.lastTriggeredAt).toBeInstanceOf(Date);
  });

  it('respects quiet hours: push queued until the window ends, then flushed by the hourly tick', async () => {
    const deps = testDeps();
    // TEST_NOW = 12:00 IST.
    const userId = await pushUser({ start: '11:00', end: '13:00' });
    const rule = await instantRule(userId);
    const l = await listing();
    await MatchModel.create({ userId, listingId: l._id, score: 90, matchHash: 'h', profileHash: 'h', listingType: 'internship', computedAt: TEST_NOW });
    await runNotify(deps, { kind: 'instant', userId: String(userId), ruleId: String(rule._id), listingIds: [String(l._id)] });
    const queued = (await NotificationModel.findOne({ userId }).lean())!;
    expect(queued.pushStatus).toBe('pending');
    expect(queued.pushAfter?.toISOString()).toBe('2026-10-27T07:30:00.000Z');
    expect(deps.push.sent).toHaveLength(0);
    deps.clock.now = new Date('2026-10-27T07:31:00Z');
    await runNotify(deps, { kind: 'digest' });
    expect((await NotificationModel.findById(queued._id).lean())!.pushStatus).toBe('sent');
    expect(deps.push.sent).toHaveLength(1);
  });

  it('deletes expired (410) subscriptions', async () => {
    const deps = testDeps();
    const userId = await pushUser();
    deps.push.gone.add(`https://push.test/${String(userId)}`);
    await runNotify(deps, { kind: 'instant', test: true, userId: String(userId) });
    expect(await PushSubscriptionModel.countDocuments({ userId })).toBe(0);
    expect((await NotificationModel.findOne({ userId }).lean())!.pushStatus).toBe('failed');
  });

  it('caps pushes per day; the rest stay in-app', async () => {
    const deps = testDeps();
    deps.env.PUSH_DAILY_CAP = 1;
    const userId = await pushUser();
    const rule = await instantRule(userId);
    const a = await listing();
    const b = await listing();
    for (const l of [a, b]) await MatchModel.create({ userId, listingId: l._id, score: 90, matchHash: 'h', profileHash: 'h', listingType: 'internship', computedAt: TEST_NOW });
    await runNotify(deps, { kind: 'instant', userId: String(userId), ruleId: String(rule._id), listingIds: [String(a._id), String(b._id)] });
    expect(deps.push.sent).toHaveLength(1);
    expect(await NotificationModel.countDocuments({ userId })).toBe(2);
  });
});

describe('notify: deadlines, nudges, digests', () => {
  it('sends 7/3/1-day reminders once each for tracked items', async () => {
    const deps = testDeps();
    const userId = await pushUser();
    const item = await TrackerItemModel.create({ userId, title: 'SDE Intern', company: 'Acme', stage: 'saved', deadlineAt: new Date(TEST_NOW.getTime() + 2.5 * DAY), lastActivityAt: TEST_NOW });
    expect(await runNotify(deps, { kind: 'deadline' })).toBe(1);
    expect(await runNotify(deps, { kind: 'deadline' })).toBe(0);
    const n = (await NotificationModel.findOne({ userId }).lean())!;
    expect(n).toMatchObject({ kind: 'deadline', title: '3 days left: SDE Intern', url: `/tracker?item=${String(item._id)}` });
    deps.clock.now = new Date(TEST_NOW.getTime() + 2 * DAY);
    expect(await runNotify(deps, { kind: 'deadline' })).toBe(1);
    expect((await NotificationModel.find({ userId }).sort({ createdAt: 1 }).lean()).map((x) => x.title)).toEqual(['3 days left: SDE Intern', 'Last day: SDE Intern']);
  });

  it('reminds about saved (untracked) listings too, once per threshold', async () => {
    const deps = testDeps();
    const userId = await pushUser();
    const saved = await listing({ title: 'Design Intern', deadlineAt: new Date(TEST_NOW.getTime() + 6.5 * DAY) });
    const both = await listing({ title: 'Tracked too', deadlineAt: new Date(TEST_NOW.getTime() + 6.5 * DAY) });
    await InteractionModel.create({ userId, listingId: saved._id, saved: true });
    await InteractionModel.create({ userId, listingId: both._id, saved: true });
    // Tracked as well: the tracker item carries the reminder, not the saved flag.
    await TrackerItemModel.create({ userId, listingId: both._id, title: 'Tracked too', company: 'Acme', stage: 'saved', lastActivityAt: TEST_NOW });
    expect(await runNotify(deps, { kind: 'deadline' })).toBe(2);
    expect(await runNotify(deps, { kind: 'deadline' })).toBe(0);
    const titles = (await NotificationModel.find({ userId }).lean()).map((n) => n.title).sort();
    expect(titles).toEqual(['7 days left: Design Intern', '7 days left: Tracked too']);
    const n = (await NotificationModel.findOne({ userId, title: /Design/ }).lean())!;
    expect(n.url).toBe(`/radar?listing=${String(saved._id)}`);
  });

  it('the API test job { userId, alertRuleId, test } sends through the rule channels, bypassing quiet hours', async () => {
    const deps = testDeps();
    const userId = await pushUser({ start: '00:00', end: '23:59' });
    const rule = await instantRule(userId);
    const job = normaliseNotifyJob({ userId: String(userId), alertRuleId: String(rule._id), test: true });
    expect(await runNotify(deps, job)).toBe(1);
    expect(deps.push.sent).toHaveLength(1);
    const n = (await NotificationModel.findOne({ userId }).lean())!;
    expect(n).toMatchObject({ kind: 'system', title: 'Test: “Strong fits”', pushStatus: 'sent', channels: ['inapp', 'push'] });
    expect(String(n.alertRuleId)).toBe(String(rule._id));
    // A second test is a new notification (tests are never deduped).
    deps.clock.now = new Date(TEST_NOW.getTime() + 1_000);
    expect(await runNotify(deps, job)).toBe(1);
  });

  it('follow-up at 10 d and ghosted at 30 d after applying, honouring snoozes', async () => {
    const deps = testDeps();
    const userId = await pushUser();
    const applied = new Date(TEST_NOW.getTime() - 11 * DAY);
    const item = await TrackerItemModel.create({ userId, title: 'SDE Intern', company: 'Northwind', stage: 'applied', appliedAt: applied, lastActivityAt: applied, nudges: [] });
    expect(await runNotify(deps, { kind: 'nudge' })).toBe(1);
    expect(await runNotify(deps, { kind: 'nudge' })).toBe(0);
    const stored = (await TrackerItemModel.findById(item._id).lean())!;
    expect(stored.nudges).toHaveLength(1);
    expect(stored.nudges[0]).toMatchObject({ kind: 'follow_up' });
    expect((await NotificationModel.findOne({ userId }).lean())!.title).toBe('No reply from Northwind in 11 days');

    // Snoozed ghosted nudge (unsent, due later) is not sent yet.
    deps.clock.now = new Date(applied.getTime() + 31 * DAY);
    await TrackerItemModel.updateOne({ _id: item._id }, { $push: { nudges: { kind: 'move_to_ghosted', dueAt: new Date(deps.clock.now.getTime() + 3 * DAY), sentAt: null, dismissedAt: null } } });
    expect(await runNotify(deps, { kind: 'nudge' })).toBe(0);
    deps.clock.now = new Date(applied.getTime() + 35 * DAY);
    expect(await runNotify(deps, { kind: 'nudge' })).toBe(1);
  });

  it('daily rule digest at the chosen local hour', async () => {
    const deps = testDeps();
    const userId = await pushUser();
    await AlertRuleModel.create({
      userId,
      name: 'Daily interns',
      enabled: true,
      conditions: { minFit: 60, types: ['internship'], maxDeadlineDays: null, locations: [], remote: 'any', keywords: [] },
      channels: ['inapp'],
      cadence: 'daily',
      digestTime: '12:00',
      digestDay: 1,
      quietHours: null,
      timezone: 'Asia/Kolkata',
    });
    const l = await listing();
    await MatchModel.create({ userId, listingId: l._id, score: 75, matchHash: 'h', profileHash: 'h', listingType: 'internship', computedAt: TEST_NOW });
    expect(await runNotify(deps, { kind: 'digest' })).toBe(1);
    expect(await runNotify(deps, { kind: 'digest' })).toBe(0);
    const n = (await NotificationModel.findOne({ userId, kind: 'digest' }).lean())!;
    expect(n.title).toBe('Today: 1 new match for “Daily interns”');
  });
});

describe('ghostcheck', () => {
  it('flags a dead apply link (404) and re-matches when the score moves', async () => {
    const deps = testDeps();
    const l = await listing({ postedAt: new Date(TEST_NOW.getTime() - 50 * DAY) });
    nock('https://jobs.acme.test').head(`/postings/${seq}`).reply(404);
    const out = await ghostcheckListing(deps, String(l._id));
    const stored = (await ListingModel.findById(l._id).lean())!;
    expect(stored.ghostRisk.reasons.map((r) => r.code).sort()).toEqual(['age', 'apply_link_dead']);
    expect(stored.applyCheck).toMatchObject({ status: 'dead', httpStatus: 404, checkedAt: TEST_NOW });
    expect(out.score).toBeGreaterThan(0);
    expect(deps.enqueue.matches).toEqual([{ listingIds: [String(l._id)] }]);
  });

  it('maps raw checks to the API applyCheck status', () => {
    expect(applyCheckStatus({ status: 200, redirectedToHome: false })).toBe('ok');
    expect(applyCheckStatus({ status: 410 })).toBe('dead');
    expect(applyCheckStatus({ status: 200, redirectedToHome: true })).toBe('redirect_home');
    expect(applyCheckStatus({ status: 503 })).toBe('error');
    expect(applyCheckStatus({ status: 403 })).toBe('error');
    expect(applyCheckStatus({ status: null, error: 'ECONNRESET' })).toBe('error');
  });

  it('falls back to GET when HEAD is refused and detects redirect-to-home', async () => {
    nock('https://jobs.acme.test').head('/postings/9').reply(405);
    nock('https://jobs.acme.test').get('/postings/9').reply(302, '', { location: 'https://jobs.acme.test/' });
    nock('https://jobs.acme.test').get('/').reply(200, 'home');
    const check = await checkApplyUrl('https://jobs.acme.test/postings/9');
    expect(check).toMatchObject({ status: 200, redirectedToHome: true });
    expect(redirectedToHome('https://job-boards.greenhouse.io/acme/jobs/1', 'https://job-boards.greenhouse.io/acme?error=true')).toBe(true);
    expect(redirectedToHome('https://acme.test/careers/jobs/123', 'https://acme.test/careers')).toBe(true);
    expect(redirectedToHome('https://acme.test/jobs/123', 'https://acme.test/jobs/123-sde-intern')).toBe(false);
  });
});

describe('cleanup', () => {
  it('archives listings unseen for 60 days, prunes their matches and old source runs', async () => {
    const deps = testDeps();
    const old = await listing({ lastSeenAt: new Date(TEST_NOW.getTime() - 61 * DAY) });
    const fresh = await listing();
    await MatchModel.create({ userId: new Types.ObjectId(), listingId: old._id, score: 50, matchHash: 'h', profileHash: 'h', listingType: 'internship', computedAt: TEST_NOW });
    await SourceRunModel.collection.insertOne({ sourceId: new Types.ObjectId(), startedAt: new Date(TEST_NOW.getTime() - 40 * DAY) });
    const out = await runCleanup(deps, null);
    expect(out).toMatchObject({ archived: 1, matchesPruned: 1, sourceRunsPruned: 1 });
    expect((await ListingModel.findById(old._id).lean())!.archived).toBe(true);
    expect((await ListingModel.findById(fresh._id).lean())!.archived).toBe(false);
  });
});

describe('quiet hours', () => {
  it('handles windows that wrap midnight', () => {
    const q = { start: '22:00', end: '07:00' };
    expect(inQuietHours(new Date('2026-10-27T18:00:00Z'), q, 'Asia/Kolkata')).toBe(true); // 23:30 IST
    expect(inQuietHours(new Date('2026-10-27T06:30:00Z'), q, 'Asia/Kolkata')).toBe(false); // 12:00 IST
    expect(quietHoursEnd(new Date('2026-10-27T18:00:00Z'), q, 'Asia/Kolkata').toISOString()).toBe('2026-10-28T01:30:00.000Z');
  });
});
