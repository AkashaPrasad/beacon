import { describe, expect, it } from 'vitest';

import { FIXTURE_NOW, sampleListings, sampleProfiles } from '../__fixtures__';
import { DAY_MS, DEFAULT_WEIGHTS } from '../constants';
import { computeFit } from './fit';
import type { ScoringListing, ScoringProfile } from './types';
import { fitResultSchema } from '../schemas/fit';

const NOW = new Date('2026-10-27T06:30:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

/** Hand-computed baseline: every component is known exactly. */
const profile: ScoringProfile = {
  skills: [{ name: 'React' }, { name: 'JavaScript' }],
  education: [{ gradYear: 2027, degreeLevel: 'bachelor' }],
  preferredRoles: ['frontend'],
  preferredLocations: ['Bengaluru'],
  remotePref: 'any',
  workAuth: { citizenship: ['IN'] },
};
const listing: ScoringListing = {
  type: 'internship',
  title: 'Frontend Engineer Intern',
  company: 'Acme Pvt Ltd',
  location: ['Bengaluru'],
  remote: 'onsite',
  postedAt: ago(15), // freshness 0.5
  deadlineAt: null,
  eligibility: { gradYears: [2027] }, // eligibility 1
  skillsRequired: ['React', 'JavaScript', 'TypeScript'], // skills 4/6
  stipendMin: 30_000,
  stipendMax: 30_000,
  currency: 'INR',
  period: 'month',
};
const fit = (
  p: Partial<ScoringProfile> = {},
  l: Partial<ScoringListing> = {},
  extra: object = {},
) =>
  computeFit({
    profile: { ...profile, ...p },
    listing: { ...listing, ...l },
    now: NOW,
    semantic: 0.8,
    ...extra,
  });

// 100·(0.4·0.8 + 0.25·(4/6) + 0.15·1 + 0.10·1 + 0.05·1 + 0.05·0.5 + 0·1)
const BASELINE_RAW = 100 * (0.32 + 0.25 * (4 / 6) + 0.15 + 0.1 + 0.05 + 0.025);

describe('computeFit: SPEC §4 formula', () => {
  it('computes the weighted sum exactly', () => {
    const result = fit();
    expect(result.components).toEqual({
      semantic: 0.8,
      skills: 0.667,
      role: 1,
      eligibility: 1,
      location: 1,
      freshness: 0.5,
      stipend: 1,
    });
    expect(result.weights).toEqual(DEFAULT_WEIGHTS);
    expect(result.contributions).toEqual({
      semantic: 32,
      skills: 16.7,
      role: 15,
      eligibility: 10,
      location: 5,
      freshness: 2.5,
      stipend: 0,
    });
    expect(result.rawScore).toBe(81.2);
    expect(result.score).toBe(Math.round(BASELINE_RAW));
    expect(result).toMatchObject({
      caps: [],
      hardFails: [],
      ghostPenalty: 0,
      semanticAvailable: true,
    });
    expect(fitResultSchema.safeParse(result).success).toBe(true);
  });

  it('explains why it fits (by contribution) and the gaps (by severity)', () => {
    const { explain, details } = fit();
    expect(explain.whyFit.slice(0, 5)).toEqual([
      'Strong match with your profile',
      'Matches 2/3 required skills (React, JavaScript)',
      'Frontend Engineer: one of your preferred roles',
      'Open to 2027 graduates',
      'In Bengaluru: one of your locations',
    ]);
    expect(explain.gaps).toEqual(['Missing TypeScript']);
    expect(details.skills).toEqual({
      matchedRequired: ['React', 'JavaScript'],
      missingRequired: ['TypeScript'],
      matchedNice: [],
      missingNice: [],
    });
    expect(details.roleFamily).toBe('frontend');
  });

  it.each([
    [0.95, 'Strong match with your profile'],
    [0.65, 'Good match with your profile'],
  ])('semantic %d → %s', (semantic, text) => {
    expect(fit({}, {}, { semantic }).explain.whyFit).toContain(text);
  });
});

describe('computeFit: weights', () => {
  it('normalises any slider scale to the same result', () => {
    const scaled = Object.fromEntries(
      Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => [k, v * 100]),
    );
    expect(fit({}, {}, { weights: scaled }).score).toBe(fit().score);
  });

  it('falls back to defaults for all-zero weights', () => {
    const zero = {
      semantic: 0,
      skills: 0,
      role: 0,
      eligibility: 0,
      location: 0,
      freshness: 0,
      stipend: 0,
    };
    expect(fit({}, {}, { weights: zero }).weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('can be driven by a single term', () => {
    const skillsOnly = {
      semantic: 0,
      skills: 1,
      role: 0,
      eligibility: 0,
      location: 0,
      freshness: 0,
      stipend: 0,
    };
    const result = fit({}, {}, { weights: skillsOnly });
    expect(result.score).toBe(67);
    expect(result.contributions.skills).toBe(66.7);
  });

  it('includes stipend when its slider is raised', () => {
    const result = fit(
      { stipendFloor: { amount: 60_000, currency: 'INR', period: 'month' } },
      {},
      {
        weights: { ...DEFAULT_WEIGHTS, stipend: 0.25 },
      },
    );
    expect(result.weights.stipend).toBeCloseTo(0.2, 6);
    expect(result.components.stipend).toBe(0);
    expect(result.explain.gaps).toContain('Stipend below your floor');
  });

  it('redistributes the semantic weight when no embedding similarity is available', () => {
    const result = fit({}, {}, { semantic: undefined });
    expect(result.semanticAvailable).toBe(false);
    expect(result.weights.semantic).toBe(0);
    expect(result.weights.skills).toBeCloseTo(0.25 / 0.6, 4);
    // 100·(0.25·(4/6) + 0.15 + 0.10 + 0.05 + 0.05·0.5) / 0.6
    expect(result.score).toBe(
      Math.round((100 * (0.25 * (4 / 6) + 0.15 + 0.1 + 0.05 + 0.025)) / 0.6),
    );
    expect(result.explain.whyFit).not.toContain('Strong match with your profile');
  });

  it.each([
    [1.7, 1],
    [-0.4, 0],
  ])('clamps semantic %d to %d', (semantic, expected) => {
    expect(fit({}, {}, { semantic }).components.semantic).toBe(expected);
  });

  it('treats NaN semantic as unavailable', () => {
    expect(fit({}, {}, { semantic: Number.NaN }).semanticAvailable).toBe(false);
  });
});

describe('computeFit: ghost penalty (0–20 from ghostRisk.score)', () => {
  it.each([
    [0, 0],
    [25, 5],
    [50, 10],
    [83, 16.6],
    [100, 20],
    [140, 20],
    [-10, 0],
  ])('ghostRisk %d → penalty %d', (ghost, penalty) => {
    const result = fit({}, { ghostRisk: { score: ghost } });
    expect(result.ghostPenalty).toBe(penalty);
    expect(result.score).toBe(Math.round(BASELINE_RAW - penalty));
  });

  it('flags likely ghost listings as a gap', () => {
    expect(fit({}, { ghostRisk: { score: 60 } }).explain.gaps).toContain(
      'Possible ghost listing: check before applying',
    );
  });
});

describe('computeFit: caps (never silent)', () => {
  it('caps an eligibility hard-fail at 35 with the reason', () => {
    const result = fit({}, { eligibility: { gradYears: [2026] } });
    expect(result.rawScore).toBeGreaterThan(35);
    expect(result.score).toBe(35);
    expect(result.caps).toEqual([
      expect.objectContaining({ code: 'eligibility_hard_fail', max: 35 }),
    ]);
    expect(result.hardFails).toEqual([
      { code: 'grad_year', reason: 'Open to 2026 graduates only; you graduate in 2027' },
    ]);
    expect(result.explain.gaps[0]).toBe('Open to 2026 graduates only; you graduate in 2027');
  });

  it.each([
    ['citizenship', { eligibility: { citizenship: ['US'] } }],
    ['min experience', { eligibility: { minExperienceYears: 3 } }],
  ])('caps a %s hard-fail at 35', (_label, l) => {
    expect(fit({}, l).score).toBe(35);
  });

  it('does not cap a soft degree mismatch', () => {
    const result = fit({}, { eligibility: { gradYears: [2027], degrees: ['M.Tech'] } });
    expect(result.caps).toEqual([]);
    expect(result.components.eligibility).toBeCloseTo(0.625, 6);
    expect(result.explain.gaps).toContain('Asks for M.Tech');
  });

  it('caps remote-only vs on-site at 50 unless relocation is OK', () => {
    const capped = fit({ remotePref: 'remote_only' });
    expect(capped.score).toBe(50);
    expect(capped.caps.map((c) => c.code)).toEqual(['remote_only_onsite']);
    expect(capped.explain.gaps).toContain('On-site role; you want remote only');

    const relocating = fit({ remotePref: 'remote_only', openToRelocate: true });
    expect(relocating.caps).toEqual([]);
    expect(relocating.score).toBe(Math.round(BASELINE_RAW - 5 + 100 * 0.05 * 0.4));
  });

  it('caps a passed deadline at 20', () => {
    const result = fit({}, { deadlineAt: ago(1) });
    expect(result.score).toBe(20);
    expect(result.components.freshness).toBe(0);
    expect(result.caps.map((c) => c.code)).toEqual(['deadline_passed']);
    expect(result.explain.gaps).toContain('Deadline has passed');
  });

  it('applies the lowest of several caps', () => {
    const result = fit({}, { deadlineAt: ago(1), eligibility: { gradYears: [2026] } });
    expect(result.caps.map((c) => c.max)).toEqual([35, 20]);
    expect(result.score).toBe(20);
  });

  it('never raises a score that is already below the cap', () => {
    const result = fit(
      { skills: [], preferredRoles: ['accounting'] },
      { eligibility: { gradYears: [2026] }, postedAt: ago(60) },
      { semantic: 0.1 },
    );
    expect(result.score).toBeLessThan(35);
    expect(result.score).toBe(Math.round(result.rawScore));
  });

  it('applies the ghost penalty before the cap', () => {
    expect(fit({}, { eligibility: { gradYears: [2026] }, ghostRisk: { score: 100 } }).score).toBe(
      35,
    );
  });
});

describe('computeFit: edge cases', () => {
  it('handles a listing with no deadline and no dates', () => {
    const result = fit({}, { deadlineAt: null, postedAt: null, firstSeenAt: null });
    expect(result.components.freshness).toBe(0.5);
    expect(result.caps).toEqual([]);
  });

  it('boosts freshness for an urgent deadline', () => {
    expect(fit({}, { deadlineAt: new Date(NOW.getTime() + 3 * DAY_MS) }).components.freshness).toBe(
      0.75,
    );
  });

  it('scores emoji titles like plain titles', () => {
    expect(fit({}, { title: '🚀 Frontend Engineer Intern 🔥' }).score).toBe(fit().score);
  });

  it('handles very long company names', () => {
    const company = `${'Very Long Company Name '.repeat(12)}Private Limited`;
    const result = fit({}, { company });
    expect(result.score).toBe(fit().score);
  });

  it('handles a zero-skills profile', () => {
    const result = fit({ skills: [] });
    expect(result.components.skills).toBe(0);
    expect(result.explain.gaps).toEqual(
      expect.arrayContaining([
        'Missing React, JavaScript, TypeScript',
        'Add skills to your profile for a sharper match',
      ]),
    );
  });

  it('lists at most three missing skills then a count', () => {
    const result = fit(
      { skills: [] },
      { skillsRequired: ['React', 'JavaScript', 'TypeScript', 'Docker', 'AWS'] },
    );
    expect(result.explain.gaps).toContain('Missing React, JavaScript, TypeScript +2');
  });

  it('works with an empty profile and a minimal listing', () => {
    const result = computeFit({
      profile: {},
      listing: { type: 'hackathon', title: 'Hack Day', company: 'X' },
    });
    expect(fitResultSchema.safeParse(result).success).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('explains remote, freshness, related role, nice-to-have skills and pay', () => {
    const result = fit(
      { preferredRoles: ['fullstack'], skills: [{ name: 'Docker' }] },
      {
        remote: 'remote',
        location: ['Remote'],
        postedAt: ago(1),
        skillsRequired: [],
        skillsNice: ['Docker'],
      },
    );
    expect(result.explain.whyFit).toEqual(
      expect.arrayContaining([
        'Remote: works with your preference',
        'Posted 1 day ago',
        'Frontend Engineer: close to your preferred roles',
        'Has 1 nice-to-have skill (Docker)',
        'Paid: ₹30,000/month',
      ]),
    );
    expect(fit({}, { postedAt: NOW }).explain.whyFit).toContain('Posted today');
  });

  it('explains stipend floors, unpaid roles, location and role mismatches, unknown eligibility', () => {
    const above = fit({ stipendFloor: { amount: 20_000, currency: 'INR', period: 'month' } });
    expect(above.explain.whyFit).toContain('₹30,000/month: above your floor');

    const unpaid = fit(
      {
        stipendFloor: { amount: 20_000, currency: 'INR', period: 'month' },
        preferredRoles: ['accounting'],
        education: [],
      },
      { stipendMin: 0, stipendMax: 0, location: ['Berlin'], remote: 'onsite' },
    );
    expect(unpaid.explain.gaps).toEqual(
      expect.arrayContaining([
        'Unpaid; you set a stipend floor',
        'Not in your preferred locations',
        'Outside your preferred roles',
        'Open to 2027 graduates; add your graduation year',
      ]),
    );
  });
});

describe('computeFit on fixtures', () => {
  const scores = (profileIndex: number) =>
    sampleListings
      .map((l) => ({
        id: l.id,
        ...computeFit({ profile: sampleProfiles[profileIndex]!, listing: l, now: FIXTURE_NOW }),
      }))
      .sort((a, b) => b.score - a.score);

  it('ranks the full-stack internship first for the full-stack student', () => {
    expect(scores(0)[0]?.id).toBe('lst_01_fullstack_intern');
  });

  it('ranks an ML/NLP listing first for the ML student', () => {
    expect(['lst_02_ml_intern', 'lst_10_research_nlp']).toContain(scores(1)[0]?.id);
  });

  it('ranks the remote design internship first for the remote-only designer', () => {
    expect(scores(2)[0]?.id).toBe('lst_03_design_intern');
  });

  it('caps the expired scholarship and the ghost listing for everyone', () => {
    for (const index of [0, 1, 2]) {
      const byId = new Map(scores(index).map((s) => [s.id, s]));
      expect(byId.get('lst_08_scholarship_saraswati')?.score).toBeLessThanOrEqual(20);
      expect(byId.get('lst_12_ghost_talent_pool')?.score).toBeLessThanOrEqual(35);
      expect(byId.get('lst_12_ghost_talent_pool')?.ghostPenalty).toBeGreaterThan(10);
    }
  });

  it('produces schema-valid results for every pair', () => {
    for (const p of sampleProfiles) {
      for (const l of sampleListings) {
        const result = computeFit({ profile: p, listing: l, now: FIXTURE_NOW, semantic: 0.5 });
        expect(fitResultSchema.safeParse(result).success).toBe(true);
      }
    }
  });
});
