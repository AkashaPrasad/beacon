import { SCORE_COMPONENTS, type ScoreComponent, SCORING } from '../constants';
import {
  eligibilityTerm,
  freshnessTerm,
  locationTerm,
  roleTerm,
  skillsTerm,
  stipendTerm,
} from './terms';
import type { ComputeFitInput } from './types';
import type { FitCap, FitResult } from '../schemas/fit';
import { normaliseWeights, type Weights } from '../schemas/weights';

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function list(items: readonly string[], max = 3): string {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} +${items.length - max}` : shown;
}

/**
 * SPEC §4 explainable fit score.
 *
 *   rawScore = 100 · Σ wᵢ · componentᵢ        (weights normalised to sum 1)
 *   score    = min(rawScore − ghostPenalty, …caps)   clamped to 0..100, rounded
 *
 * - ghostPenalty = 20 · ghostRisk.score / 100
 * - caps: eligibility hard-fail → 35; remote-only vs on-site (no relocation) → 50;
 *   deadline passed → 20. Caps are reported, never applied silently.
 * - When `semantic` is not supplied its weight is redistributed over the other terms.
 */
export function computeFit({
  profile,
  listing,
  weights,
  now = new Date(),
  semantic,
}: ComputeFitInput): FitResult {
  const semanticAvailable = typeof semantic === 'number' && Number.isFinite(semantic);
  const w: Weights = semanticAvailable
    ? normaliseWeights(weights)
    : normaliseWeights({ ...normaliseWeights(weights), semantic: 0 });

  const skills = skillsTerm(profile, listing);
  const role = roleTerm(profile, listing);
  const eligibility = eligibilityTerm(profile, listing);
  const location = locationTerm(profile, listing);
  const freshness = freshnessTerm(listing, now);
  const stipend = stipendTerm(profile, listing);

  const components: Record<ScoreComponent, number> = {
    semantic: semanticAvailable ? clamp(semantic, 0, 1) : 0,
    skills: skills.value,
    role: role.value,
    eligibility: eligibility.value,
    location: location.value,
    freshness: freshness.value,
    stipend: stipend.value,
  };
  const contributions = Object.fromEntries(
    SCORE_COMPONENTS.map((c) => [c, round1(100 * w[c] * components[c])]),
  ) as Record<ScoreComponent, number>;
  const rawScore = clamp(
    SCORE_COMPONENTS.reduce((sum, c) => sum + 100 * w[c] * components[c], 0),
    0,
    100,
  );

  const ghostScore = clamp(listing.ghostRisk?.score ?? 0, 0, 100);
  const ghostPenalty = round1((ghostScore / 100) * SCORING.ghostPenaltyMax);

  const caps: FitCap[] = [];
  if (eligibility.hardFails.length > 0) {
    caps.push({
      code: 'eligibility_hard_fail',
      max: SCORING.eligibilityHardFailCap,
      reason: `Not eligible: ${eligibility.hardFails.map((f) => f.reason).join('; ')}`,
    });
  }
  if (location.remoteOnlyConflict) {
    caps.push({
      code: 'remote_only_onsite',
      max: SCORING.remoteOnlyOnsiteCap,
      reason: 'On-site role; you only want remote work (enable relocation to lift this cap)',
    });
  }
  if (freshness.expired) {
    caps.push({
      code: 'deadline_passed',
      max: SCORING.deadlinePassedCap,
      reason: 'Deadline has passed',
    });
  }

  const ceiling = Math.min(100, ...caps.map((cap) => cap.max));
  const score = Math.round(clamp(Math.min(rawScore - ghostPenalty, ceiling), 0, 100));

  // ── Explanations ──
  const why: { text: string; weight: number }[] = [];
  const gaps: { text: string; severity: number }[] = [];

  if (skills.matchedRequired.length > 0) {
    const total = skills.matchedRequired.length + skills.missingRequired.length;
    why.push({
      text: `Matches ${skills.matchedRequired.length}/${total} required skills (${list(skills.matchedRequired)})`,
      weight: contributions.skills,
    });
  } else if (skills.matchedNice.length > 0) {
    why.push({
      text: `Has ${plural(skills.matchedNice.length, 'nice-to-have skill')} (${list(skills.matchedNice)})`,
      weight: contributions.skills,
    });
  }
  if (role.alignment === 'exact' && role.label) {
    why.push({ text: `${role.label}: one of your preferred roles`, weight: contributions.role });
  } else if (role.alignment === 'related' && role.label) {
    why.push({ text: `${role.label}: close to your preferred roles`, weight: contributions.role });
  }
  if (semanticAvailable && components.semantic >= 0.6) {
    why.push({
      text:
        components.semantic >= 0.75
          ? 'Strong match with your profile'
          : 'Good match with your profile',
      weight: contributions.semantic,
    });
  }
  const gradPass = eligibility.checks.find((c) => c.code === 'grad_year' && c.status === 'pass');
  if (gradPass) why.push({ text: gradPass.reason, weight: contributions.eligibility });
  if (location.mode === 'remote' && (profile.remotePref ?? 'any') !== 'onsite') {
    why.push({ text: 'Remote: works with your preference', weight: contributions.location });
  } else if (location.place === 'city' && location.matchedCity) {
    why.push({
      text: `In ${location.matchedCity}: one of your locations`,
      weight: contributions.location,
    });
  }
  if (freshness.ageDays !== null && freshness.ageDays < 3) {
    const days = Math.floor(freshness.ageDays);
    why.push({
      text: days === 0 ? 'Posted today' : `Posted ${plural(days, 'day')} ago`,
      weight: contributions.freshness,
    });
  }
  if (stipend.label && (stipend.status === 'above_floor' || stipend.status === 'paid')) {
    why.push({
      text:
        stipend.status === 'above_floor'
          ? `${stipend.label}: above your floor`
          : `Paid: ${stipend.label}`,
      weight: contributions.stipend,
    });
  }

  for (const fail of eligibility.hardFails) gaps.push({ text: fail.reason, severity: 100 });
  if (freshness.expired) gaps.push({ text: 'Deadline has passed', severity: 95 });
  if (location.remoteOnlyConflict)
    gaps.push({ text: 'On-site role; you want remote only', severity: 90 });
  if (skills.missingRequired.length > 0) {
    gaps.push({
      text: `Missing ${list(skills.missingRequired)}`,
      severity: 70 + skills.missingRequired.length,
    });
  }
  if (stipend.status === 'below_floor')
    gaps.push({ text: 'Stipend below your floor', severity: 60 });
  if (stipend.status === 'unpaid' && stipend.value === 0) {
    gaps.push({ text: 'Unpaid; you set a stipend floor', severity: 60 });
  }
  if (ghostScore >= 30) {
    gaps.push({
      text: 'Possible ghost listing: check before applying',
      severity: 50 + ghostScore / 10,
    });
  }
  const degreeFail = eligibility.checks.find(
    (c) => c.code === 'degree' && c.status === 'soft_fail',
  );
  if (degreeFail) gaps.push({ text: degreeFail.reason, severity: 45 });
  if (location.place === 'none')
    gaps.push({ text: 'Not in your preferred locations', severity: 40 });
  if (role.alignment === 'none') gaps.push({ text: 'Outside your preferred roles', severity: 35 });
  for (const check of eligibility.checks) {
    if (check.status === 'unknown') gaps.push({ text: check.reason, severity: 30 });
  }
  if (!skills.profileHasSkills && skills.listingHasSkills) {
    gaps.push({ text: 'Add skills to your profile for a sharper match', severity: 25 });
  }

  return {
    score,
    rawScore: round1(rawScore),
    components: Object.fromEntries(
      SCORE_COMPONENTS.map((c) => [c, Math.round(components[c] * 1000) / 1000]),
    ) as Record<ScoreComponent, number>,
    contributions,
    weights: Object.fromEntries(
      SCORE_COMPONENTS.map((c) => [c, Math.round(w[c] * 10_000) / 10_000]),
    ) as Record<ScoreComponent, number>,
    caps,
    ghostPenalty,
    hardFails: eligibility.hardFails,
    semanticAvailable,
    details: {
      skills: {
        matchedRequired: skills.matchedRequired,
        missingRequired: skills.missingRequired,
        matchedNice: skills.matchedNice,
        missingNice: skills.missingNice,
      },
      roleFamily: role.family,
    },
    explain: {
      // Zero-weight facts (e.g. stipend with the default weight 0) still explain, ranked last.
      whyFit: why.sort((a, b) => b.weight - a.weight).map((item) => item.text),
      gaps: gaps.sort((a, b) => b.severity - a.severity).map((item) => item.text),
    },
  };
}
