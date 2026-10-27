import { describe, expect, it } from 'vitest';

import { DAY_MS } from '../constants';
import {
  degreeLevelOf,
  eligibilityTerm,
  freshnessTerm,
  locationTerm,
  roleTerm,
  skillsTerm,
  stipendTerm,
} from './terms';
import type { ScoringListing, ScoringProfile } from './types';

const NOW = new Date('2026-10-27T06:30:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY_MS);
const L = (extra: Partial<ScoringListing> = {}): ScoringListing => ({
  type: 'internship',
  title: 'Frontend Engineer Intern',
  company: 'Acme',
  ...extra,
});
const skills = (...names: string[]) => names.map((name) => ({ name }));

describe('skillsTerm: weighted Jaccard (required 2×, nice 1×, same-domain extras 0.5×)', () => {
  it.each([
    ['all required matched', skills('React', 'JavaScript'), ['React', 'JavaScript'], [], 1],
    ['half the required', skills('React'), ['React', 'Node.js'], [], 0.5],
    ['extra same-category skill dilutes at 0.5', skills('React', 'Vue.js'), ['React'], [], 2 / 2.5],
    ['unrelated-category extra does not dilute', skills('React', 'Figma'), ['React'], [], 1],
    ['nice-to-have weighs half a required', skills('TypeScript'), ['React'], ['TypeScript'], 1 / 3],
    ['zero-skills profile', [], ['React'], [], 0],
    ['aliases are canonicalised', skills('reactjs', 'JS'), ['React', 'JavaScript'], [], 1],
    [
      'skill in both lists counts once as required',
      skills('Docker'),
      ['React'],
      ['React', 'Docker'],
      1 / 3,
    ],
    [
      'unknown skills match by key',
      skills('quantum basket weaving'),
      ['Quantum Basket Weaving'],
      [],
      1,
    ],
    [
      'duplicates in the listing are collapsed',
      skills('React'),
      ['React', 'react', 'React.js'],
      [],
      1,
    ],
  ])('%s', (_label, profileSkills, required, nice, expected) => {
    const term = skillsTerm(
      { skills: profileSkills },
      L({ skillsRequired: required, skillsNice: nice }),
    );
    expect(term.value).toBeCloseTo(expected, 6);
  });

  it('reports matched and missing skills', () => {
    const term = skillsTerm(
      { skills: skills('React', 'Docker', 'Express') },
      L({ skillsRequired: ['React', 'Node.js'], skillsNice: ['Docker', 'AWS'] }),
    );
    expect(term).toMatchObject({
      matchedRequired: ['React'],
      missingRequired: ['Node.js'],
      matchedNice: ['Docker'],
      missingNice: ['AWS'],
      profileOnly: ['Express'],
    });
    // (2·1 + 1·1) / (2·2 + 1·2 + 0.5·1)
    expect(term.value).toBeCloseTo(3 / 6.5, 6);
  });

  it('is neutral when the listing names no skills', () => {
    const term = skillsTerm({ skills: skills('React') }, L());
    expect(term).toMatchObject({ value: 0.5, listingHasSkills: false, profileHasSkills: true });
  });
});

describe('roleTerm', () => {
  it.each([
    ['no preference', [], 'Frontend Engineer', 'no_preference', 0.5],
    ['exact family', ['frontend'], 'Frontend Engineer', 'exact', 1],
    ['free-text preference resolves', ['Front-end developer'], 'React Developer', 'exact', 1],
    ['related family', ['fullstack'], 'Frontend Engineer', 'related', 0.6],
    ['same group', ['backend'], 'Android Developer', 'same_group', 0.3],
    ['different group', ['data_scientist'], 'Frontend Engineer', 'none', 0],
    ['unclassified listing', ['frontend'], 'Smart City Hackathon', 'unclassified', 0.5],
    ['unresolvable preference', ['Astronaut'], 'Frontend Engineer', 'no_preference', 0.5],
    ['emoji in title', ['frontend'], '🚀 Frontend Engineer 🔥', 'exact', 1],
  ])('%s', (_label, preferredRoles, title, alignment, value) => {
    expect(roleTerm({ preferredRoles }, L({ title }))).toMatchObject({ alignment, value });
  });

  it('prefers the stored roleFamily over re-classifying the title', () => {
    const term = roleTerm(
      { preferredRoles: ['ml engineer'] },
      L({ title: 'Intern', roleFamily: 'ml_engineer' }),
    );
    expect(term).toMatchObject({
      alignment: 'exact',
      family: 'ml_engineer',
      label: 'ML / AI Engineer',
    });
  });
});

describe('degreeLevelOf', () => {
  it.each([
    ['B.Tech', 'bachelor'],
    ['B.E.', 'bachelor'],
    ['BSc Computer Science', 'bachelor'],
    ['Bachelor of Engineering', 'bachelor'],
    ['M.Tech', 'master'],
    ['MS by Research', 'master'],
    ['MBA', 'master'],
    ['Post Graduate', 'master'],
    ['PhD', 'phd'],
    ['Doctorate', 'phd'],
    ['Diploma in Mechanical', 'diploma'],
    ['Class XII', 'highschool'],
    ['Any graduate', 'any'],
    ['All streams', 'any'],
    ['Basket weaving', null],
  ])('%s → %j', (text, expected) => {
    expect(degreeLevelOf(text)).toBe(expected);
  });
});

describe('eligibilityTerm', () => {
  const grad = (gradYear: number) => ({
    education: [{ gradYear, degreeLevel: 'bachelor' as const }],
  });
  it.each<[string, ScoringProfile, ScoringListing['eligibility'], number, string[]]>([
    ['no restrictions', grad(2027), {}, 1, []],
    ['grad year accepted', grad(2027), { gradYears: [2026, 2027] }, 1, []],
    ['grad year rejected (hard)', grad(2027), { gradYears: [2026] }, 0, ['grad_year']],
    ['grad year unknown', {}, { gradYears: [2026] }, 0.5, []],
    [
      'latest grad year is used',
      { education: [{ gradYear: 2023 }, { gradYear: 2026 }] },
      { gradYears: [2026] },
      1,
      [],
    ],
    ['citizenship met', { workAuth: { citizenship: ['IN'] } }, { citizenship: ['IN'] }, 1, []],
    [
      'citizenship by name',
      { workAuth: { citizenship: ['Indian'] } },
      { citizenship: ['India'] },
      1,
      [],
    ],
    [
      'citizenship mismatch (hard)',
      { workAuth: { citizenship: ['IN'] } },
      { citizenship: ['US'] },
      0,
      ['citizenship'],
    ],
    ['citizenship unknown', {}, { citizenship: ['US'] }, 0.5, []],
    ['experience met', { experienceYears: 3 }, { minExperienceYears: 2 }, 1, []],
    [
      'experience short (hard)',
      { experienceYears: 0.5 },
      { minExperienceYears: 2 },
      0,
      ['min_experience'],
    ],
    ['experience missing counts as 0', {}, { minExperienceYears: 1 }, 0, ['min_experience']],
    ['zero min experience ignored', {}, { minExperienceYears: 0 }, 1, []],
    ['degree met', grad(2027), { degrees: ['B.Tech', 'B.E.'] }, 1, []],
    [
      'degree level from text',
      { education: [{ gradYear: 2027, degree: 'M.Tech CSE' }] },
      { degrees: ['M.Tech'] },
      1,
      [],
    ],
    ['degree mismatch is soft', grad(2027), { degrees: ['M.Tech'] }, 0.25, []],
    ['degree unknown without education', {}, { degrees: ['B.Tech'] }, 0.5, []],
    ['"any graduate" is unrestricted', {}, { degrees: ['Any graduate'] }, 1, []],
    ['unmappable degree ignored', {}, { degrees: ['Basket weaving'] }, 1, []],
    [
      'mixed: pass + hard fail averages',
      { ...grad(2027), workAuth: { citizenship: ['IN'] } },
      { gradYears: [2027], citizenship: ['US'] },
      0.5,
      ['citizenship'],
    ],
  ])('%s', (_label, profile, eligibility, value, hardFailCodes) => {
    const term = eligibilityTerm(profile, L({ eligibility }));
    expect(term.value).toBeCloseTo(value, 6);
    expect(term.hardFails.map((f) => f.code)).toEqual(hardFailCodes);
  });

  it('explains each check', () => {
    const term = eligibilityTerm(
      { education: [{ gradYear: 2027 }] },
      L({ eligibility: { gradYears: [2026, 2025] } }),
    );
    expect(term.checks[0]?.reason).toBe('Open to 2025, 2026 graduates only; you graduate in 2027');
  });
});

describe('locationTerm', () => {
  const blr = { location: ['Bengaluru, India'] };
  it.each<[string, ScoringProfile, Partial<ScoringListing>, number, boolean]>([
    ['remote listing, any pref', { remotePref: 'any' }, { remote: 'remote' }, 1, false],
    [
      'remote listing, remote-only pref',
      { remotePref: 'remote_only' },
      { remote: 'remote' },
      1,
      false,
    ],
    ['remote listing, onsite pref', { remotePref: 'onsite' }, { remote: 'remote' }, 0.6, false],
    [
      'hybrid, remote-only',
      { remotePref: 'remote_only' },
      { remote: 'hybrid', ...blr },
      0.3,
      false,
    ],
    [
      'hybrid, prefer remote, city match',
      { remotePref: 'prefer_remote', preferredLocations: ['Bangalore'] },
      { remote: 'hybrid', ...blr },
      0.6,
      false,
    ],
    [
      'hybrid, hybrid pref, city match',
      { remotePref: 'hybrid', preferredLocations: ['Bengaluru'] },
      { remote: 'hybrid', ...blr },
      1,
      false,
    ],
    [
      'hybrid, onsite pref, city match',
      { remotePref: 'onsite', preferredLocations: ['Bengaluru'] },
      { remote: 'hybrid', ...blr },
      0.9,
      false,
    ],
    [
      'hybrid, any, no location prefs',
      { remotePref: 'any' },
      { remote: 'hybrid', ...blr },
      0.7,
      false,
    ],
    [
      'onsite vs remote-only (cap)',
      { remotePref: 'remote_only' },
      { remote: 'onsite', ...blr },
      0,
      true,
    ],
    [
      'onsite vs remote-only + relocation',
      { remotePref: 'remote_only', openToRelocate: true, preferredLocations: ['Bengaluru'] },
      { remote: 'onsite', ...blr },
      0.4,
      false,
    ],
    [
      'onsite, prefer remote, city',
      { remotePref: 'prefer_remote', preferredLocations: ['Bengaluru'] },
      { remote: 'onsite', ...blr },
      0.5,
      false,
    ],
    [
      'onsite, hybrid pref, city',
      { remotePref: 'hybrid', preferredLocations: ['Bengaluru'] },
      { remote: 'onsite', ...blr },
      0.8,
      false,
    ],
    [
      'onsite, onsite pref, city',
      { remotePref: 'onsite', preferredLocations: ['Bengaluru'] },
      { remote: 'onsite', ...blr },
      1,
      false,
    ],
    [
      'onsite, other country',
      { remotePref: 'any', preferredLocations: ['Pune'] },
      { remote: 'onsite', location: ['Berlin, Germany'] },
      0.2,
      false,
    ],
    [
      'onsite, other country, relocation ok',
      { remotePref: 'any', preferredLocations: ['Pune'], openToRelocate: true },
      { remote: 'onsite', location: ['Berlin'] },
      0.6,
      false,
    ],
    [
      'onsite, other city in the same country',
      { remotePref: 'any', preferredLocations: ['Pune'] },
      { remote: 'onsite', ...blr },
      0.7,
      false,
    ],
    [
      'onsite, same country',
      { remotePref: 'any', preferredLocations: ['Pune', 'Berlin'] },
      { remote: 'onsite', location: ['Hyderabad'] },
      0.7,
      false,
    ],
    [
      'country-level preference covers its cities',
      { remotePref: 'any', preferredLocations: ['India'] },
      { remote: 'onsite', ...blr },
      1,
      false,
    ],
    [
      'country-only listing',
      { remotePref: 'any', preferredLocations: ['India'] },
      { remote: 'onsite', country: 'IN' },
      1,
      false,
    ],
    ['unknown arrangement', { remotePref: 'remote_only' }, {}, 0.5, false],
    [
      'arrangement inferred from location text',
      { remotePref: 'remote_only' },
      { location: ['Remote (India)'] },
      1,
      false,
    ],
    [
      'bare city inferred as onsite',
      { remotePref: 'remote_only' },
      { location: ['Pune'] },
      0,
      true,
    ],
    [
      'hybrid inferred from location',
      { remotePref: 'hybrid' },
      { location: ['Hybrid - Pune'] },
      0.7,
      false,
    ],
  ])('%s', (_label, profile, listing, value, conflict) => {
    const term = locationTerm(profile, L(listing));
    expect(term.value).toBeCloseTo(value, 6);
    expect(term.remoteOnlyConflict).toBe(conflict);
  });

  it('defaults to "any" preference and reports the matched city', () => {
    const term = locationTerm(
      { preferredLocations: ['Bangalore'] },
      L({ remote: 'onsite', ...blr }),
    );
    expect(term).toMatchObject({
      value: 1,
      mode: 'onsite',
      place: 'city',
      matchedCity: 'Bengaluru',
    });
  });
});

describe('freshnessTerm', () => {
  it.each<[string, Partial<ScoringListing>, number, { urgent?: boolean; expired?: boolean }]>([
    ['posted today', { postedAt: NOW }, 1, { urgent: false }],
    ['15 days old', { postedAt: ago(15) }, 0.5, {}],
    ['30 days old', { postedAt: ago(30) }, 0, {}],
    ['45 days old', { postedAt: ago(45) }, 0, {}],
    ['falls back to firstSeenAt', { firstSeenAt: ago(6) }, 0.8, {}],
    ['no dates is neutral', {}, 0.5, {}],
    ['future posted date (clock skew)', { postedAt: ahead(2) }, 1, {}],
    ['urgent deadline boosts', { postedAt: ago(15), deadlineAt: ahead(3) }, 0.75, { urgent: true }],
    ['boost clamps at 1', { postedAt: NOW, deadlineAt: ahead(2) }, 1, { urgent: true }],
    [
      'exactly 7 days is urgent',
      { postedAt: ago(15), deadlineAt: ahead(7) },
      0.75,
      { urgent: true },
    ],
    ['8 days is not urgent', { postedAt: ago(15), deadlineAt: ahead(8) }, 0.5, { urgent: false }],
    ['deadline passed', { postedAt: NOW, deadlineAt: ago(1) }, 0, { expired: true, urgent: false }],
    [
      'no deadline (rolling)',
      { postedAt: ago(3), deadlineKind: 'rolling' },
      0.9,
      { urgent: false, expired: false },
    ],
  ])('%s', (_label, listing, value, flags) => {
    const term = freshnessTerm(L(listing), NOW);
    expect(term.value).toBeCloseTo(value, 6);
    expect(term).toMatchObject(flags);
  });
});

describe('stipendTerm', () => {
  const floor = (amount: number, period: 'month' | 'year' = 'month', currency = 'INR') => ({
    stipendFloor: { amount, currency, period },
  });
  const pay = (
    min: number | null,
    max: number | null,
    currency: string | null = 'INR',
    period: ScoringListing['period'] = 'month',
  ) => ({
    stipendMin: min,
    stipendMax: max,
    currency,
    period,
  });
  it.each<[string, ScoringProfile, Partial<ScoringListing>, number, string]>([
    ['no pay info', floor(20_000), {}, 0.5, 'unknown'],
    ['unpaid below a floor', floor(20_000), pay(0, 0), 0, 'unpaid'],
    ['unpaid without a floor', {}, pay(0, 0), 0.3, 'unpaid'],
    ['paid, no floor', {}, pay(30_000, 40_000), 1, 'paid'],
    ['zero floor means no floor', floor(0), pay(30_000, 40_000), 1, 'paid'],
    ['2× the floor', floor(20_000), pay(30_000, 40_000), 1, 'above_floor'],
    ['1.25× the floor', floor(20_000), pay(25_000, 25_000), 0.775, 'above_floor'],
    ['exactly the floor', floor(20_000), pay(20_000, 20_000), 0.7, 'above_floor'],
    ['below the floor', floor(20_000), pay(15_000, 15_000), 0, 'below_floor'],
    [
      'annual vs monthly floor',
      floor(30_000),
      pay(600_000, 600_000, 'INR', 'year'),
      0.7 + 0.3 * (50_000 / 30_000 - 1),
      'above_floor',
    ],
    [
      'cross-currency (USD vs INR floor)',
      floor(30_000),
      pay(1_500, 1_500, 'USD'),
      1,
      'above_floor',
    ],
    ['only an upper bound', floor(20_000), pay(null, 22_000), 0.7 + 0.3 * 0.1, 'above_floor'],
    [
      'missing period assumes month',
      floor(20_000),
      pay(40_000, 40_000, 'INR', null),
      1,
      'above_floor',
    ],
    [
      'missing currency assumes the floor currency',
      floor(20_000),
      pay(40_000, 40_000, null),
      1,
      'above_floor',
    ],
    [
      'one-off total is not comparable',
      floor(20_000),
      pay(3_000, 3_000, 'USD', 'total'),
      0.7,
      'not_comparable',
    ],
    [
      'unknown currency is not comparable',
      floor(20_000),
      pay(3_000, 3_000, 'XYZ'),
      0.7,
      'not_comparable',
    ],
    [
      'hackathon prize is an award',
      floor(20_000),
      { type: 'hackathon', ...pay(500_000, 500_000, 'INR', 'total') },
      1,
      'award',
    ],
    [
      'scholarship unpaid floor does not apply',
      floor(20_000),
      { type: 'scholarship', ...pay(0, 0) },
      0.3,
      'unpaid',
    ],
  ])('%s', (_label, profile, listing, value, status) => {
    const term = stipendTerm(profile, L(listing));
    expect(term.value).toBeCloseTo(value, 6);
    expect(term.status).toBe(status);
  });

  it('labels the stipend', () => {
    expect(stipendTerm({}, L(pay(30_000, 40_000))).label).toBe('₹30,000–₹40,000/month');
  });
});
