import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';

import { contentHash } from '@kestrel/shared';

import { loadEnv } from '../env.js';
import { embedListing, embedUser } from './embed.js';
import { matchListings, matchUser, passesFloor } from './match.js';
import {
  AlertRuleModel,
  InteractionModel,
  ListingModel,
  MatchModel,
  ProfileModel,
  SettingsModel,
  SourceModel,
  SubscriptionModel,
  TrackerItemModel,
} from '../models/index.js';
import { testDeps } from '../test/deps.js';
import { useMongo } from '../test/mongo.js';
import { TEST_NOW } from '../test/samples.js';

useMongo();

async function source(partial: Record<string, unknown> = {}) {
  const doc = await SourceModel.create({
    url: `https://src.test/${new Types.ObjectId().toHexString()}`,
    name: 'Src',
    kind: 'greenhouse',
    scope: 'community',
    ...partial,
  });
  return doc._id;
}

let seq = 0;
let defaultSource: Types.ObjectId | null = null;
async function listing(partial: Record<string, unknown> = {}) {
  const n = ++seq;
  defaultSource ??= await source();
  const sourceId = (partial.sourceId as Types.ObjectId | undefined) ?? defaultSource;
  const doc = await ListingModel.create({
    type: 'internship',
    title: `Frontend Engineering Intern ${n}`,
    company: `Company ${n}`,
    location: ['Bengaluru'],
    remote: 'hybrid',
    country: 'IN',
    applyUrl: `https://acme.test/jobs/${n}`,
    sourceId,
    sourceIds: [sourceId],
    canonicalKey: `c${n}|frontend|bengaluru`,
    contentHash: contentHash(`l${n}`),
    firstSeenAt: TEST_NOW,
    lastSeenAt: TEST_NOW,
    postedAt: TEST_NOW,
    skillsRequired: ['React', 'TypeScript'],
    descriptionMd: 'Build React and TypeScript interfaces for our dashboard.',
    eligibility: { gradYears: [2027] },
    ...partial,
  });
  return String(doc._id);
}

async function user(partial: Record<string, unknown> = {}) {
  const userId = new Types.ObjectId();
  await ProfileModel.create({
    userId,
    headline: 'Frontend developer',
    skills: [
      { name: 'React', proficiency: 'advanced', years: 2 },
      { name: 'TypeScript', proficiency: 'intermediate', years: 1 },
    ],
    education: [
      {
        institution: 'IIT',
        degree: 'B.Tech',
        degreeLevel: 'bachelor',
        field: 'CS',
        startYear: 2023,
        gradYear: 2027,
        current: true,
        gpa: null,
      },
    ],
    experienceYears: 0,
    preferredRoles: ['frontend_engineer'],
    preferredLocations: ['Bengaluru'],
    remotePref: 'any',
    openToRelocate: true,
    opportunityTypes: ['internship'],
    profileHash: 'api-profile-hash',
    embeddingHash: null,
    ...partial,
  });
  return String(userId);
}

// Collections are emptied between tests, so the cached community source must be recreated.
beforeEach(() => {
  defaultSource = null;
});

describe('embed', () => {
  it('embeds listings in batches (target + up to 15 waiting) and skips unchanged text', async () => {
    const deps = testDeps();
    const ids = await Promise.all(Array.from({ length: 20 }, () => listing()));
    const first = await embedListing(deps, ids[0]!);
    expect(first.embedded).toBe(16);
    expect(await ListingModel.countDocuments({ 'embedding.383': { $exists: true } })).toBe(16);
    // The target is done; the 4 still waiting ride along with the next job.
    expect(await embedListing(deps, ids[0]!)).toEqual({ embedded: 4, skipped: 0 });
    expect(await embedListing(deps, ids[1]!)).toEqual({ embedded: 0, skipped: 1 });
    const l = (await ListingModel.findById(ids[0]).lean())!;
    expect(l.embedding).toHaveLength(384);
    expect(l.embeddingModel).toBe('test-hash');
  });

  it('embeds a profile once and enqueues a match for the user', async () => {
    const deps = testDeps();
    const userId = await user();
    expect(await embedUser(deps, userId)).toMatchObject({ embedded: 1, changed: true });
    expect(await embedUser(deps, userId)).toMatchObject({ embedded: 0, changed: false });
    expect(deps.enqueue.matches).toEqual([{ userId, reason: 'embedding' }]);
    const p = (await ProfileModel.findOne({ userId: new Types.ObjectId(userId) }).lean())!;
    expect(p.embeddedAt).toEqual(TEST_NOW);
  });
});

describe('match', () => {
  it('recomputes a user: vector candidates + tracked listings, matches stamped with profileHash', async () => {
    const deps = testDeps();
    const good = await listing();
    const other = await listing({
      title: 'Senior Accountant',
      skillsRequired: ['Accounting'],
      type: 'fulltime',
      descriptionMd: 'Ledgers and audits.',
    });
    const tracked = await listing({ title: 'Archived tracked role', archived: true });
    for (const id of [good, other, tracked]) await embedListing(deps, id);
    const userId = await user();
    await embedUser(deps, userId);
    await TrackerItemModel.create({
      userId: new Types.ObjectId(userId),
      listingId: new Types.ObjectId(tracked),
      title: 't',
      company: 'c',
      stage: 'saved',
      lastActivityAt: TEST_NOW,
    });

    const out = await matchUser(deps, userId);
    expect(out.semantic).toBe(true);
    const matches = await MatchModel.find({ userId: new Types.ObjectId(userId) }).lean();
    expect(matches.map((m) => String(m.listingId)).sort()).toEqual([good, other, tracked].sort());
    const best = matches.find((m) => String(m.listingId) === good)!;
    const worst = matches.find((m) => String(m.listingId) === other)!;
    expect(best.score).toBeGreaterThan(worst.score);
    // FitResult fields at the top level (API.md §12), stamped with the API's profileHash.
    expect(best.semanticAvailable).toBe(true);
    expect(best.details.skills.matchedRequired).toEqual(
      expect.arrayContaining(['React', 'TypeScript']),
    );
    expect(best.components.semantic).toBeGreaterThan(0);
    expect(best.contributions.skills).toBeGreaterThan(0);
    expect(best.explain.whyFit.length).toBeGreaterThan(0);
    expect(new Set(matches.map((m) => m.profileHash))).toEqual(new Set(['api-profile-hash']));
    expect(new Set(matches.map((m) => m.matchHash)).size).toBe(1);

    // Weights change → new matchHash, matches rewritten with the new weights.
    await SettingsModel.create({
      userId: new Types.ObjectId(userId),
      weights: {
        semantic: 0,
        skills: 1,
        role: 0,
        eligibility: 0,
        location: 0,
        freshness: 0,
        stipend: 0,
      },
    });
    await matchUser(deps, userId);
    const after = await MatchModel.find({ userId: new Types.ObjectId(userId) }).lean();
    expect(after).toHaveLength(3);
    expect(after[0]!.matchHash).not.toBe(best.matchHash);
    expect(after.find((m) => String(m.listingId) === good)!.weights.skills).toBe(1);
  });

  const brokenEmbedder = {
    model: 'broken',
    dim: 384,
    embed: () => Promise.reject(new Error('model unavailable')),
  };

  it('works without a profile embedding (rules only over fresh listings)', async () => {
    const deps = testDeps({ embedder: brokenEmbedder });
    await listing();
    const userId = await user();
    const out = await matchUser(deps, userId);
    expect(out).toMatchObject({ semantic: false, written: 1 });
    const m = (await MatchModel.findOne({ userId: new Types.ObjectId(userId) }).lean())!;
    expect(m.semantic).toBeNull();
    expect(m.semanticAvailable).toBe(false);
  });

  it('builds a missing profile embedding itself instead of waiting for the embed queue', async () => {
    const deps = testDeps();
    const id = await listing();
    await embedListing(deps, id);
    const userId = await user();
    const out = await matchUser(deps, userId);
    expect(out).toMatchObject({ semantic: true, written: 1 });
    const profile = (await ProfileModel.findOne({ userId: new Types.ObjectId(userId) }).lean())!;
    expect(profile.embedding).toHaveLength(384);
    expect(deps.enqueue.matches).toEqual([]);
  });

  it('rules-only fallback keeps a quota for every type, larger for the types the profile chose', async () => {
    const deps = testDeps({ embedder: brokenEmbedder });
    deps.env = { ...deps.env, MATCH_CANDIDATES_K: 10 };
    const hackathons: string[] = [];
    for (let i = 0; i < 6; i++)
      hackathons.push(
        await listing({
          type: 'hackathon',
          title: `Hack ${i}`,
          skillsRequired: [],
          lastSeenAt: new Date(TEST_NOW.getTime() - 86_400_000),
        }),
      );
    const scholarship = await listing({
      type: 'scholarship',
      title: 'Grant',
      skillsRequired: [],
      lastSeenAt: new Date(TEST_NOW.getTime() - 86_400_000),
    });
    // 30 fresher full-time roles would fill a recency-only top 10 on their own.
    for (let i = 0; i < 30; i++) await listing({ type: 'fulltime', title: `Engineer ${i}` });
    const userId = await user({ opportunityTypes: ['hackathon'] });
    const out = await matchUser(deps, userId);
    expect(out.semantic).toBe(false);
    const matched = new Set(
      (await MatchModel.find({ userId: new Types.ObjectId(userId) }).lean()).map((m) =>
        String(m.listingId),
      ),
    );
    for (const h of hackathons) expect(matched.has(h)).toBe(true);
    expect(matched.has(scholarship)).toBe(true);
    expect(matched.size).toBeGreaterThan(10);
  });

  it("only matches listings from the user's sources; removing a source drops its matches", async () => {
    const deps = testDeps();
    const mine = await source({ scope: 'personal' });
    const subscribed = await source();
    const other = await source();
    const a = await listing({ sourceId: mine });
    const b = await listing({ sourceId: subscribed });
    const c = await listing({ sourceId: other });
    // Seen in an unsubscribed source but also (deduped) in a subscribed one → visible.
    const d = await listing({ sourceId: other, sourceIds: [other, subscribed] });
    for (const id of [a, b, c, d]) await embedListing(deps, id);
    const userId = await user();
    const uid = new Types.ObjectId(userId);
    await SourceModel.updateOne({ _id: mine }, { $set: { ownerId: uid } });
    await SubscriptionModel.create({
      userId: uid,
      sourceId: subscribed,
      packId: 'top-indian-product',
    });
    await embedUser(deps, userId);

    await matchUser(deps, userId);
    const ids = async () =>
      (await MatchModel.find({ userId: uid }).lean()).map((m) => String(m.listingId)).sort();
    expect(await ids()).toEqual([a, b, d].sort());

    // Pack disabled → the API deletes the subscription and enqueues match {userId}.
    await SubscriptionModel.deleteMany({ userId: uid });
    const out = await matchUser(deps, userId);
    expect(out.removed).toBe(2);
    expect(await ids()).toEqual([a]);

    // Incremental matching skips users who cannot see the listing.
    const e = await listing({ sourceId: other });
    await embedListing(deps, e);
    expect(await matchListings(deps, [e])).toMatchObject({ written: 0 });
  });

  it('keeps saved and tracked listings in the match set even outside stage 1', async () => {
    const deps = testDeps();
    const userId = await user();
    const uid = new Types.ObjectId(userId);
    // The user has a personal source, so the community listing below is not visible…
    await source({ scope: 'personal', ownerId: uid });
    const saved = await listing({
      title: 'Payroll Clerk',
      skillsRequired: ['Accounting'],
      type: 'fulltime',
    });
    await embedListing(deps, saved);
    await embedUser(deps, userId);
    expect((await matchUser(deps, userId)).written).toBe(0);
    // …until it is saved from a shared link: then it is always scored.
    await InteractionModel.create({
      userId: uid,
      listingId: new Types.ObjectId(saved),
      saved: true,
    });
    expect((await matchUser(deps, userId)).written).toBe(1);
    expect(
      await MatchModel.exists({ userId: uid, listingId: new Types.ObjectId(saved) }),
    ).toBeTruthy();
  });

  it('stage-1 floors: incremental keeps only listings that would have made the candidate set', () => {
    const floors = { overall: 0.6, byType: { hackathon: 0.3 } };
    expect(passesFloor(floors, 'internship', 0.7)).toBe(true);
    expect(passesFloor(floors, 'internship', 0.5)).toBe(false);
    // A type quota with a lower floor still admits the listing.
    expect(passesFloor(floors, 'hackathon', 0.4)).toBe(true);
    expect(passesFloor(null, 'internship', 0.1)).toBe(true);
    expect(passesFloor(floors, 'internship', null)).toBe(true);
    // −1: the pool was smaller than its quota at the last recompute, so everything passes.
    expect(passesFloor({ overall: -1, byType: {} }, 'research', -0.2)).toBe(true);
  });

  it('incremental: scores new listings for every embedded user and fires instant rules', async () => {
    const deps = testDeps();
    const a = await user();
    const b = await user({
      skills: [{ name: 'Accounting', proficiency: 'expert', years: 5 }],
      preferredRoles: ['accountant'],
      headline: 'Accountant',
    });
    await embedUser(deps, a);
    await embedUser(deps, b);
    await AlertRuleModel.create({
      userId: new Types.ObjectId(a),
      name: 'Strong internships',
      enabled: true,
      conditions: {
        minFit: 50,
        types: ['internship'],
        maxDeadlineDays: null,
        locations: [],
        remote: 'any',
        keywords: ['react'],
      },
      channels: ['inapp', 'push'],
      cadence: 'instant',
      digestTime: '09:00',
      digestDay: 1,
      quietHours: null,
      timezone: 'Asia/Kolkata',
    });
    const fresh = await listing();
    await embedListing(deps, fresh);
    const out = await matchListings(deps, [fresh]);
    expect(out).toMatchObject({ users: 2, written: 2, alerts: 1, continued: false });
    expect(await MatchModel.countDocuments({ listingId: new Types.ObjectId(fresh) })).toBe(2);
    expect(deps.enqueue.notifies).toEqual([
      { kind: 'instant', userId: a, ruleId: expect.any(String), listingIds: [fresh] },
    ]);
  });

  it('incremental: a profile with no vector is queued for a full recompute instead of being skipped', async () => {
    const deps = testDeps();
    const id = await listing();
    await embedListing(deps, id);
    const userId = await user();
    await matchListings(deps, [id]);
    expect(deps.enqueue.matches).toEqual([{ userId, reason: 'embedding' }]);
    expect(await MatchModel.countDocuments({ userId: new Types.ObjectId(userId) })).toBe(0);
  });

  it('chunks users and enqueues a continuation', async () => {
    const deps = testDeps({ env: loadEnv({ NODE_ENV: 'test', MATCH_USERS_PER_JOB: '1' }) });
    const u1 = await user();
    const u2 = await user();
    await embedUser(deps, u1);
    await embedUser(deps, u2);
    const fresh = await listing();
    const first = await matchListings(deps, [fresh]);
    expect(first).toMatchObject({ users: 1, continued: true });
    const next = deps.enqueue.matches.at(-1) as { listingIds: string[]; afterUserId: string };
    expect(next.listingIds).toEqual([fresh]);
    const second = await matchListings(deps, next.listingIds, next.afterUserId);
    expect(second).toMatchObject({ users: 1, continued: false });
    expect(await MatchModel.countDocuments({ listingId: new Types.ObjectId(fresh) })).toBe(2);
  });
});
