import { contentHash } from '@kestrel/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { loadEnv } from '../env.js';
import { AlertRuleModel, ListingModel, MatchModel, ProfileModel, SettingsModel, TrackerItemModel } from '../models/index.js';
import { testDeps } from '../test/deps.js';
import { useMongo } from '../test/mongo.js';
import { TEST_NOW } from '../test/samples.js';

import { embedListing, embedUser } from './embed.js';
import { matchListings, matchUser } from './match.js';

useMongo();

let seq = 0;
async function listing(partial: Record<string, unknown> = {}) {
  seq++;
  const doc = await ListingModel.create({
    type: 'internship',
    title: `Frontend Engineering Intern ${seq}`,
    company: `Company ${seq}`,
    location: ['Bengaluru'],
    remote: 'hybrid',
    country: 'IN',
    applyUrl: `https://acme.test/jobs/${seq}`,
    sourceId: new Types.ObjectId(),
    canonicalKey: `c${seq}|frontend|bengaluru`,
    contentHash: contentHash(`l${seq}`),
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
    skills: [{ name: 'React', proficiency: 'advanced', years: 2 }, { name: 'TypeScript', proficiency: 'intermediate', years: 1 }],
    education: [{ institution: 'IIT', degree: 'B.Tech', degreeLevel: 'bachelor', field: 'CS', startYear: 2023, gradYear: 2027, current: true, gpa: null }],
    experienceYears: 0,
    preferredRoles: ['frontend_engineer'],
    preferredLocations: ['Bengaluru'],
    remotePref: 'any',
    openToRelocate: true,
    opportunityTypes: ['internship'],
    embeddingHash: null,
    ...partial,
  });
  return String(userId);
}

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
    expect(deps.enqueue.matches).toEqual([{ userId }]);
  });
});

describe('match', () => {
  it('recomputes a user: vector candidates + tracked listings, matches stamped with profileHash', async () => {
    const deps = testDeps();
    const good = await listing();
    const other = await listing({ title: 'Senior Accountant', skillsRequired: ['Accounting'], type: 'fulltime', descriptionMd: 'Ledgers and audits.' });
    const tracked = await listing({ title: 'Archived tracked role', archived: true });
    for (const id of [good, other, tracked]) await embedListing(deps, id);
    const userId = await user();
    await embedUser(deps, userId);
    await TrackerItemModel.create({ userId: new Types.ObjectId(userId), listingId: new Types.ObjectId(tracked), title: 't', company: 'c', stage: 'saved', lastActivityAt: TEST_NOW });

    const out = await matchUser(deps, userId);
    expect(out.semantic).toBe(true);
    const matches = await MatchModel.find({ userId: new Types.ObjectId(userId) }).lean();
    expect(matches.map((m) => String(m.listingId)).sort()).toEqual([good, other, tracked].sort());
    const best = matches.find((m) => String(m.listingId) === good)!;
    const worst = matches.find((m) => String(m.listingId) === other)!;
    expect(best.score).toBeGreaterThan(worst.score);
    expect(best.fit.semanticAvailable).toBe(true);
    expect(best.fit.details.skills.matchedRequired).toEqual(expect.arrayContaining(['React', 'TypeScript']));
    expect(new Set(matches.map((m) => m.profileHash)).size).toBe(1);

    // Weights change → new profileHash, old matches replaced.
    await SettingsModel.create({ userId: new Types.ObjectId(userId), weights: { semantic: 0, skills: 1, role: 0, eligibility: 0, location: 0, freshness: 0, stipend: 0 } });
    await matchUser(deps, userId);
    const after = await MatchModel.find({ userId: new Types.ObjectId(userId) }).lean();
    expect(after).toHaveLength(3);
    expect(after[0]!.profileHash).not.toBe(best.profileHash);
    expect(after.find((m) => String(m.listingId) === good)!.fit.weights.skills).toBe(1);
  });

  it('works without a profile embedding (rules only over fresh listings)', async () => {
    const deps = testDeps();
    await listing();
    const userId = await user();
    const out = await matchUser(deps, userId);
    expect(out).toMatchObject({ semantic: false, written: 1 });
    const m = (await MatchModel.findOne({ userId: new Types.ObjectId(userId) }).lean())!;
    expect(m.semantic).toBeNull();
    expect(m.fit.semanticAvailable).toBe(false);
  });

  it('incremental: scores new listings for every embedded user and fires instant rules', async () => {
    const deps = testDeps();
    const a = await user();
    const b = await user({ skills: [{ name: 'Accounting', proficiency: 'expert', years: 5 }], preferredRoles: ['accountant'], headline: 'Accountant' });
    await embedUser(deps, a);
    await embedUser(deps, b);
    await AlertRuleModel.create({
      userId: new Types.ObjectId(a),
      name: 'Strong internships',
      enabled: true,
      conditions: { minFit: 50, types: ['internship'], maxDeadlineDays: null, locations: [], remote: 'any', keywords: ['react'] },
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
    expect(deps.enqueue.notifies).toEqual([{ kind: 'instant', userId: a, ruleId: expect.any(String), listingIds: [fresh] }]);
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
