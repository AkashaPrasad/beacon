import { describe, expect, it } from 'vitest';

import { OPPORTUNITY_TYPES } from '../constants';
import { FIXTURE_NOW, sampleListings, sampleProfiles } from './index';
import { listingSchema } from '../schemas/listing';
import { profileSchema } from '../schemas/profile';
import { canonicaliseSkill } from '../taxonomy/skills';

describe('fixtures', () => {
  it('has 3 valid profiles and 12 valid listings covering every type', () => {
    expect(sampleProfiles).toHaveLength(3);
    expect(sampleListings).toHaveLength(12);
    for (const p of sampleProfiles) expect(profileSchema.safeParse(p).success).toBe(true);
    for (const l of sampleListings) expect(listingSchema.safeParse(l).success).toBe(true);
    expect(new Set(sampleListings.map((l) => l.type))).toEqual(new Set(OPPORTUNITY_TYPES));
    expect(new Set(sampleListings.map((l) => l.id)).size).toBe(12);
    expect(new Set(sampleListings.map((l) => l.canonicalKey)).size).toBe(12);
  });

  it('uses canonical taxonomy skill names everywhere', () => {
    const names = [
      ...sampleProfiles.flatMap((p) => p.skills.map((s) => s.name)),
      ...sampleListings.flatMap((l) => [...l.skillsRequired, ...l.skillsNice]),
    ];
    const notCanonical = names.filter((n) => canonicaliseSkill(n) !== n);
    expect(notCanonical).toEqual([]);
  });

  it('derives keys, role families and ghost risk at build time', () => {
    const fullstack = sampleListings[0]!;
    expect(fullstack.canonicalKey).toBe(
      'razorleaf payments|full stack developer intern react node js|bengaluru',
    );
    expect(fullstack.roleFamily).toBe('fullstack');
    expect(fullstack.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const ghost = sampleListings.find((l) => l.id === 'lst_12_ghost_talent_pool')!;
    expect(ghost.ghostRisk.score).toBeGreaterThanOrEqual(60);
    expect(ghost.ghostRisk.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['age', 'reposted', 'boilerplate', 'identical_roles']),
    );
    expect(FIXTURE_NOW.toISOString()).toBe('2026-10-27T06:30:00.000Z');
  });

  it('includes the edge cases tests rely on', () => {
    expect(sampleListings.some((l) => l.deadlineAt && l.deadlineAt < FIXTURE_NOW)).toBe(true);
    expect(sampleListings.some((l) => l.deadlineAt === null && l.deadlineKind === 'rolling')).toBe(
      true,
    );
    expect(sampleListings.some((l) => /\p{Extended_Pictographic}/u.test(l.title))).toBe(true);
    expect(sampleListings.some((l) => l.company.length > 60)).toBe(true);
  });
});
