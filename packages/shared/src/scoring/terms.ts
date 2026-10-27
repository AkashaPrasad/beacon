/**
 * The individual SPEC §4 terms. Each returns a component value in 0..1 plus the
 * facts needed to explain it. `computeFit` combines them; they are exported from this
 * module (not the package barrel) so tests can exercise every term in isolation.
 */
import { DAY_MS, type OpportunityType, type RemoteMode, SCORING } from '../constants';
import type { ScoringListing, ScoringProfile } from './types';
import { normaliseCountry, normaliseLocations } from '../normalise/location';
import { convertCurrency, formatStipend, toMonthlyAmount } from '../normalise/stipend';
import type { HardFail } from '../schemas/fit';
import type { DegreeLevel } from '../schemas/profile';
import { areRolesRelated, classifyRole, getRoleFamily, resolveRoleFamily } from '../taxonomy/roles';
import { canonicaliseSkill, getSkill, skillKey } from '../taxonomy/skills';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const unique = <T>(items: readonly T[]) => [...new Set(items)];

// ── Skills: weighted Jaccard (required ×2, nice ×1, same-domain extras ×0.5) ─────────

export interface SkillsTerm {
  value: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedNice: string[];
  missingNice: string[];
  /** Profile skills outside the listing's skills but in the same categories. */
  profileOnly: string[];
  listingHasSkills: boolean;
  profileHasSkills: boolean;
}

function canonical(name: string): string {
  return canonicaliseSkill(name) ?? name.trim();
}

export function skillsTerm(profile: ScoringProfile, listing: ScoringListing): SkillsTerm {
  const required = unique((listing.skillsRequired ?? []).map(canonical).filter(Boolean));
  const requiredKeys = new Set(required.map(skillKey));
  const nice = unique((listing.skillsNice ?? []).map(canonical).filter(Boolean)).filter(
    (s) => !requiredKeys.has(skillKey(s)),
  );
  const profileSkills = new Map<string, string>();
  for (const { name } of profile.skills ?? []) {
    const canon = canonical(name);
    if (canon) profileSkills.set(skillKey(canon), canon);
  }

  const has = (s: string) => profileSkills.has(skillKey(s));
  const result: SkillsTerm = {
    value: SCORING.neutral,
    matchedRequired: required.filter(has),
    missingRequired: required.filter((s) => !has(s)),
    matchedNice: nice.filter(has),
    missingNice: nice.filter((s) => !has(s)),
    profileOnly: [],
    listingHasSkills: required.length + nice.length > 0,
    profileHasSkills: profileSkills.size > 0,
  };
  if (!result.listingHasSkills) return result;

  const listingKeys = new Set([...required, ...nice].map(skillKey));
  const listingCategories = new Set(
    [...required, ...nice].map((s) => getSkill(s)?.category).filter((c) => c !== undefined),
  );
  result.profileOnly = [...profileSkills.entries()]
    .filter(([key, name]) => {
      const category = getSkill(name)?.category;
      return !listingKeys.has(key) && category !== undefined && listingCategories.has(category);
    })
    .map(([, name]) => name);

  const wReq = SCORING.skillWeightRequired;
  const wNice = SCORING.skillWeightNice;
  const wExtra = SCORING.skillWeightProfileOnly;
  const intersection = wReq * result.matchedRequired.length + wNice * result.matchedNice.length;
  const union = wReq * required.length + wNice * nice.length + wExtra * result.profileOnly.length;
  result.value = union > 0 ? clamp01(intersection / union) : 0;
  return result;
}

// ── Role alignment ───────────────────────────────────────────────────────────

export type RoleAlignment =
  'exact' | 'related' | 'same_group' | 'none' | 'no_preference' | 'unclassified';

export interface RoleTerm {
  value: number;
  family: string | null;
  label: string | null;
  alignment: RoleAlignment;
}

export const ROLE_SCORES: Readonly<Record<RoleAlignment, number>> = {
  exact: 1,
  related: 0.6,
  same_group: 0.3,
  none: 0,
  no_preference: SCORING.neutral,
  unclassified: SCORING.neutral,
};

export function roleTerm(profile: ScoringProfile, listing: ScoringListing): RoleTerm {
  const family = listing.roleFamily ?? classifyRole(listing.title)?.family ?? null;
  const label = family ? (getRoleFamily(family)?.label ?? null) : null;
  const preferred = unique(
    (profile.preferredRoles ?? [])
      .map((role) => resolveRoleFamily(role))
      .filter((id): id is string => id !== null),
  );
  let alignment: RoleAlignment;
  if (preferred.length === 0) alignment = 'no_preference';
  else if (!family) alignment = 'unclassified';
  else if (preferred.includes(family)) alignment = 'exact';
  else if (preferred.some((p) => areRolesRelated(p, family))) alignment = 'related';
  else if (preferred.some((p) => getRoleFamily(p)?.group === getRoleFamily(family)?.group)) {
    alignment = 'same_group';
  } else alignment = 'none';
  return { value: ROLE_SCORES[alignment], family, label, alignment };
}

// ── Eligibility ──────────────────────────────────────────────────────────────

export type EligibilityStatus = 'pass' | 'unknown' | 'soft_fail' | 'hard_fail';

export interface EligibilityCheck {
  code: 'grad_year' | 'citizenship' | 'min_experience' | 'degree';
  status: EligibilityStatus;
  reason: string;
}

export interface EligibilityTerm {
  value: number;
  checks: EligibilityCheck[];
  hardFails: HardFail[];
}

const STATUS_SCORE: Readonly<Record<EligibilityStatus, number>> = {
  pass: 1,
  unknown: SCORING.neutral,
  soft_fail: 0.25,
  hard_fail: 0,
};

type DegreeRequirement = DegreeLevel | 'any';

/** Map a degree string ("B.Tech", "M.Sc", "Any graduate", "PhD") to a level. */
export function degreeLevelOf(text: string): DegreeRequirement | null {
  const t = ` ${text.toLowerCase().replace(/[.\s]+/g, ' ')} `;
  if (
    /\bany (graduate|degree|discipline|stream|branch)\b|\ball (degrees|streams|branches)\b/.test(t)
  ) {
    return 'any';
  }
  if (/\b(ph ?d|doctor(ate|al)?|d phil)\b/.test(t)) return 'phd';
  if (
    /\b(m ?tech|m ?e|m ?s|m ?sc|mba|mca|m ?des|m ?a|m ?com|ms by research|master'?s?|post ?graduate|pg)\b/.test(
      t,
    )
  ) {
    return 'master';
  }
  if (
    /\b(b ?tech|b ?e|b ?s|b ?sc|bca|bba|b ?des|b ?com|b ?a|b ?arch|bachelor'?s?|under ?graduate|ug|graduate|degree)\b/.test(
      t,
    )
  ) {
    return 'bachelor';
  }
  if (/\b(diploma|polytechnic)\b/.test(t)) return 'diploma';
  if (/\b(12th|class xii|high ?school|hsc|higher secondary)\b/.test(t)) return 'highschool';
  return null;
}

function profileGradYear(profile: ScoringProfile): number | null {
  const years = (profile.education ?? []).map((e) => e.gradYear).filter(Number.isFinite);
  return years.length > 0 ? Math.max(...years) : null;
}

export function eligibilityTerm(profile: ScoringProfile, listing: ScoringListing): EligibilityTerm {
  const elig = listing.eligibility ?? {};
  const checks: EligibilityCheck[] = [];

  const gradYears = elig.gradYears ?? [];
  if (gradYears.length > 0) {
    const year = profileGradYear(profile);
    const list = [...gradYears].sort((a, b) => a - b).join(', ');
    if (year === null) {
      checks.push({
        code: 'grad_year',
        status: 'unknown',
        reason: `Open to ${list} graduates; add your graduation year`,
      });
    } else if (gradYears.includes(year)) {
      checks.push({ code: 'grad_year', status: 'pass', reason: `Open to ${year} graduates` });
    } else {
      checks.push({
        code: 'grad_year',
        status: 'hard_fail',
        reason: `Open to ${list} graduates only; you graduate in ${year}`,
      });
    }
  }

  const required = (elig.citizenship ?? []).map((c) => normaliseCountry(c) ?? c.toUpperCase());
  if (required.length > 0) {
    const mine = (profile.workAuth?.citizenship ?? []).map(
      (c) => normaliseCountry(c) ?? c.toUpperCase(),
    );
    const list = unique(required).join(', ');
    if (mine.length === 0) {
      checks.push({
        code: 'citizenship',
        status: 'unknown',
        reason: `Requires ${list} citizenship; add yours to your profile`,
      });
    } else if (mine.some((c) => required.includes(c))) {
      checks.push({
        code: 'citizenship',
        status: 'pass',
        reason: `Citizenship requirement (${list}) met`,
      });
    } else {
      checks.push({
        code: 'citizenship',
        status: 'hard_fail',
        reason: `Requires ${list} citizenship`,
      });
    }
  }

  const minExp = elig.minExperienceYears ?? null;
  if (minExp !== null && minExp > 0) {
    const have = profile.experienceYears ?? 0;
    checks.push(
      have >= minExp
        ? { code: 'min_experience', status: 'pass', reason: `Needs ${minExp}+ years of experience` }
        : {
            code: 'min_experience',
            status: 'hard_fail',
            reason: `Needs ${minExp}+ years of experience; you have ${have}`,
          },
    );
  }

  const wanted = (elig.degrees ?? []).map(degreeLevelOf).filter((d) => d !== null);
  if (wanted.length > 0 && !wanted.includes('any')) {
    const education = profile.education ?? [];
    const levels = education.map(
      (e) => e.degreeLevel ?? (e.degree ? degreeLevelOf(e.degree) : null),
    );
    const label = (elig.degrees ?? []).join(' / ');
    if (education.length === 0) {
      checks.push({
        code: 'degree',
        status: 'unknown',
        reason: `Asks for ${label}; add your education`,
      });
    } else if (levels.some((l) => l !== null && wanted.includes(l))) {
      checks.push({ code: 'degree', status: 'pass', reason: `Degree requirement (${label}) met` });
    } else {
      checks.push({ code: 'degree', status: 'soft_fail', reason: `Asks for ${label}` });
    }
  }

  const value =
    checks.length === 0
      ? 1
      : checks.reduce((sum, check) => sum + STATUS_SCORE[check.status], 0) / checks.length;
  const hardFails: HardFail[] = checks
    .filter((check) => check.status === 'hard_fail' && check.code !== 'degree')
    .map((check) => ({ code: check.code as HardFail['code'], reason: check.reason }));
  return { value, checks, hardFails };
}

// ── Location ─────────────────────────────────────────────────────────────────

export type PlaceMatch = 'city' | 'country' | 'none' | 'no_preference';

export interface LocationTerm {
  value: number;
  mode: RemoteMode;
  place: PlaceMatch;
  matchedCity: string | null;
  /** remote_only user vs on-site listing without relocation (cap 50). */
  remoteOnlyConflict: boolean;
}

function listingMode(listing: ScoringListing): RemoteMode {
  if (listing.remote && listing.remote !== 'unknown') return listing.remote;
  const locs = normaliseLocations(listing.location ?? []);
  if (locs.some((l) => l.remote === 'remote')) return 'remote';
  if (locs.some((l) => l.remote === 'hybrid')) return 'hybrid';
  if (locs.some((l) => l.remote === 'onsite' || l.city !== null)) return 'onsite';
  return 'unknown';
}

export function locationTerm(profile: ScoringProfile, listing: ScoringListing): LocationTerm {
  const pref = profile.remotePref ?? 'any';
  const relocate = profile.openToRelocate ?? false;
  const mode = listingMode(listing);

  const wanted = normaliseLocations(profile.preferredLocations ?? []).filter(
    (l) => l.city !== null || l.country !== null,
  );
  const offered = normaliseLocations(listing.location ?? []);
  const offeredCountries = new Set(
    [...offered.map((l) => l.country), listing.country ?? null].filter((c) => c !== null),
  );
  let place: PlaceMatch = 'no_preference';
  let matchedCity: string | null = null;
  if (wanted.length > 0 && (offered.length > 0 || offeredCountries.size > 0)) {
    const city = offered.find((o) => o.city !== null && wanted.some((w) => w.city === o.city));
    if (city) {
      place = 'city';
      matchedCity = city.city;
    } else if (
      wanted.some((w) => w.country !== null && w.city === null && offeredCountries.has(w.country))
    ) {
      // A country-level preference ("India") is satisfied by any city in that country.
      place = 'city';
    } else if (wanted.some((w) => w.country !== null && offeredCountries.has(w.country))) {
      place = 'country';
    } else {
      place = 'none';
    }
  }
  const placeScore = { city: 1, country: 0.7, no_preference: 0.7, none: relocate ? 0.6 : 0.2 }[
    place
  ];

  let value: number;
  let remoteOnlyConflict = false;
  switch (mode) {
    case 'remote':
      value = pref === 'onsite' ? 0.6 : 1;
      break;
    case 'hybrid':
      value = {
        remote_only: 0.3,
        prefer_remote: 0.6 * placeScore,
        hybrid: placeScore,
        onsite: 0.9 * placeScore,
        any: placeScore,
      }[pref];
      break;
    case 'onsite':
      if (pref === 'remote_only') {
        remoteOnlyConflict = !relocate;
        value = relocate ? 0.4 * placeScore : 0;
      } else {
        value = { prefer_remote: 0.5, hybrid: 0.8, onsite: 1, any: 1 }[pref] * placeScore;
      }
      break;
    case 'unknown':
      value = SCORING.neutral;
      break;
  }
  return { value: clamp01(value), mode, place, matchedCity, remoteOnlyConflict };
}

// ── Freshness ────────────────────────────────────────────────────────────────

export interface FreshnessTerm {
  value: number;
  ageDays: number | null;
  daysToDeadline: number | null;
  urgent: boolean;
  expired: boolean;
}

export function freshnessTerm(listing: ScoringListing, now: Date): FreshnessTerm {
  const posted = listing.postedAt ?? listing.firstSeenAt ?? null;
  const ageDays = posted ? Math.max(0, (now.getTime() - posted.getTime()) / DAY_MS) : null;
  const base =
    ageDays === null ? SCORING.neutral : Math.max(0, 1 - ageDays / SCORING.freshnessWindowDays);
  const deadline = listing.deadlineAt ?? null;
  const daysToDeadline = deadline ? (deadline.getTime() - now.getTime()) / DAY_MS : null;
  const expired = daysToDeadline !== null && daysToDeadline < 0;
  const urgent = daysToDeadline !== null && !expired && daysToDeadline <= SCORING.urgencyWindowDays;
  const value = expired ? 0 : clamp01(base + (urgent ? SCORING.urgencyBoost : 0));
  return { value, ageDays, daysToDeadline, urgent, expired };
}

// ── Stipend ──────────────────────────────────────────────────────────────────

/** Types where a stipend floor is meaningful (hackathon prizes / scholarship awards are not pay). */
export const STIPEND_FLOOR_TYPES: readonly OpportunityType[] = [
  'internship',
  'fulltime',
  'fellowship',
  'research',
  'opensource',
];

export type StipendStatus =
  'above_floor' | 'below_floor' | 'unpaid' | 'unknown' | 'paid' | 'not_comparable' | 'award';

export interface StipendTerm {
  value: number;
  status: StipendStatus;
  label: string | null;
}

export function stipendTerm(profile: ScoringProfile, listing: ScoringListing): StipendTerm {
  const min = listing.stipendMin ?? null;
  const max = listing.stipendMax ?? null;
  const label = formatStipend(listing);
  const floor =
    profile.stipendFloor && profile.stipendFloor.amount > 0 ? profile.stipendFloor : null;
  const applies = STIPEND_FLOOR_TYPES.includes(listing.type);

  if (min === null && max === null) return { value: SCORING.neutral, status: 'unknown', label };
  if ((max ?? 0) === 0 && (min ?? 0) === 0) {
    return floor && applies
      ? { value: 0, status: 'unpaid', label }
      : { value: 0.3, status: 'unpaid', label };
  }
  if (!applies) return { value: 1, status: 'award', label };
  if (!floor) return { value: 1, status: 'paid', label };

  const best = max ?? min ?? 0;
  const currency = listing.currency ?? floor.currency;
  const monthly = toMonthlyAmount(best, listing.period ?? 'month');
  const floorMonthly = toMonthlyAmount(floor.amount, floor.period);
  const floorInListingCurrency =
    floorMonthly === null ? null : convertCurrency(floorMonthly, floor.currency, currency);
  if (monthly === null || floorInListingCurrency === null || floorInListingCurrency <= 0) {
    return { value: 0.7, status: 'not_comparable', label };
  }
  const ratio = monthly / floorInListingCurrency;
  if (ratio < 1) return { value: 0, status: 'below_floor', label };
  return { value: clamp01(0.7 + 0.3 * Math.min(1, ratio - 1)), status: 'above_floor', label };
}
