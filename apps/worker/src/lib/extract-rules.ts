import {
  DAY_MS,
  type DeadlineKind,
  type Eligibility,
  extractSkills,
  inferRemote,
  type PayPeriod,
  parseDeadline,
  parseStipend,
  type RemoteMode,
} from '@kestrel/shared';

/** Deterministic listing enrichment (no AI): skills, eligibility, deadline, stipend, remote. */
export interface RuleExtraction {
  skillsRequired: string[];
  skillsNice: string[];
  eligibility: Eligibility;
  deadline: { at: Date | null; kind: DeadlineKind };
  stipend: { min: number | null; max: number | null; currency: string; period: PayPeriod } | null;
  remote: RemoteMode;
}

export interface RuleInput {
  title: string;
  descriptionMd: string;
  country?: string | null;
  now?: Date;
}

const NICE_HEADING =
  /(nice[- ]to[- ]haves?|good[- ]to[- ]haves?|preferred (qualifications|skills|experience)|bonus( points)?|pluses|is a plus|are a plus|would be a plus|desirable|preferred:|great if you)/i;
const END_HEADING = /\n#+\s*(benefits|perks|what we offer|about (us|the company)|why join|compensation|equal opportunity)/i;

function splitSkillRegions(text: string): { required: string; nice: string } {
  const niceAt = text.search(NICE_HEADING);
  if (niceAt < 0) return { required: text, nice: '' };
  const rest = text.slice(niceAt);
  const end = rest.slice(20).search(END_HEADING);
  return { required: text.slice(0, niceAt), nice: end < 0 ? rest : rest.slice(0, end + 20) };
}

export function extractSkillSets(title: string, description: string): { required: string[]; nice: string[] } {
  const { required, nice } = splitSkillRegions(description);
  const req = extractSkills(`${title}\n${required}`).map((s) => s.canonical);
  const reqSet = new Set(req);
  const niceSkills = extractSkills(nice)
    .map((s) => s.canonical)
    .filter((s) => !reqSet.has(s));
  return { required: req.slice(0, 40), nice: niceSkills.slice(0, 40) };
}

const YEAR = '(20[2-3]\\d)';
const GRAD_YEAR_PATTERNS = [
  new RegExp(`${YEAR}\\s*(?:[,/&]|and|or|-|–)\\s*${YEAR}\\s*(?:batch(?:es)?|pass[- ]?outs?|graduates?|grads)`, 'gi'),
  new RegExp(`${YEAR}\\s*(?:batch|pass[- ]?outs?|passing out|graduat\\w*|grads?)\\b`, 'gi'),
  new RegExp(`(?:class of|graduating (?:in|by)|batch of|graduation (?:year|in|by)|expected graduation(?: date)?(?: in| of)?|passing out in|graduate (?:in|by))\\s*:?\\s*(?:\\w+\\s+)?${YEAR}`, 'gi'),
];

export function extractGradYears(text: string): number[] {
  const years = new Set<number>();
  for (const re of GRAD_YEAR_PATTERNS) {
    for (const m of text.matchAll(re)) {
      for (const g of m.slice(1)) if (g && /^20[2-3]\d$/.test(g)) years.add(Number(g));
    }
  }
  return [...years].sort((a, b) => a - b);
}

const DEGREES: readonly [string, RegExp][] = [
  ['B.Tech / B.E.', /\b(b\.?\s?tech|b\.?\s?e\.?(?=[\s,/)])|bachelor of (technology|engineering))\b/i],
  ['M.Tech / M.E.', /\b(m\.?\s?tech|master of (technology|engineering))\b/i],
  ['BCA', /\bbca\b/i],
  ['MCA', /\bmca\b/i],
  ['B.Sc', /\bb\.?\s?sc\b/i],
  ['M.Sc', /\bm\.?\s?sc\b/i],
  ['MBA', /\bmba\b/i],
  ['PhD', /\b(ph\.?\s?d|doctoral)\b/i],
  ["Bachelor's", /\bbachelor'?s?\b(?! of (technology|engineering))/i],
  ["Master's", /\bmaster'?s\b(?! of (technology|engineering))/i],
  ['Any graduate', /\bany (graduate|degree|stream)\b/i],
];

export function extractDegrees(text: string): string[] {
  return DEGREES.filter(([, re]) => re.test(text)).map(([label]) => label);
}

const EXPERIENCE = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?)(?:'|’)?(?:\s+of)?(?:\s+[\w/+-]+){0,4}?\s+(?:experience|exp\b)/i;

export function extractMinExperience(text: string): number | null {
  const m = EXPERIENCE.exec(text);
  if (!m) return /\b(freshers?|no (prior )?experience (required|needed))\b/i.test(text) ? 0 : null;
  const n = Number(m[1]);
  return n <= 30 ? n : null;
}

const CITIZENSHIP: readonly [string, RegExp][] = [
  ['IN', /\b(indian (citizens?|nationals?)( only)?|citizens? of india|must be (an )?indian (citizen|national))\b/i],
  ['US', /\b(u\.?s\.? citizen(ship)?( is)? required|must be (a )?u\.?s\.? citizen|us citizens? only|u\.s\. persons? only|security clearance required)\b/i],
  ['GB', /\b(uk|british) (citizens?|nationals?) only\b/i],
  ['CA', /\bcanadian (citizens?|permanent residents?) only\b/i],
];

const OTHER_REQUIREMENTS: readonly RegExp[] = [
  /[^.\n]*\b(authori[sz]ed to work|eligible to work|right to work|work authori[sz]ation)\b[^.\n]*/i,
  /[^.\n]*\b(no|not able to|unable to|cannot|will not) (provide |offer )?(visa )?sponsor(ship)?\b[^.\n]*/i,
  /[^.\n]*\b(women|female candidates)( only| are encouraged)\b[^.\n]*/i,
  /[^.\n]*\b(final[- ]year|pre[- ]final[- ]year|currently enrolled|currently pursuing)\b[^.\n]*/i,
];

export function extractEligibility(text: string): Eligibility {
  const other: string[] = [];
  for (const re of OTHER_REQUIREMENTS) {
    const m = re.exec(text);
    const phrase = m?.[0]?.replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
    if (phrase && phrase.length >= 8) other.push(phrase.slice(0, 300));
  }
  return {
    gradYears: extractGradYears(text),
    degrees: extractDegrees(text),
    minExperienceYears: extractMinExperience(text),
    citizenship: CITIZENSHIP.filter(([, re]) => re.test(text)).map(([code]) => code),
    other,
  };
}

const DEADLINE_LINE = /(deadline|apply by|apply before|last date|applications? (close|closes|closing|due)|closing date|register by|registrations? (close|closes|ends)|submit by|submissions? (close|due))/i;
const ROLLING = /\b(rolling (basis|applications?|admissions?)|until (the )?(position is )?filled|open until filled|applications are reviewed on a rolling)\b/i;

export function extractDeadline(text: string, now: Date): { at: Date | null; kind: DeadlineKind } {
  const lines = text.split(/\n|(?<=\.)\s+/).filter((l) => DEADLINE_LINE.test(l));
  for (const line of lines.slice(0, 10)) {
    const parsed = parseDeadline(line.slice(0, 300), { now });
    if (parsed.kind === 'date' && parsed.confidence >= 0.6) {
      const delta = parsed.at.getTime() - now.getTime();
      if (delta > -60 * DAY_MS && delta < 400 * DAY_MS) return { at: parsed.at, kind: 'date' };
    }
    if (parsed.kind === 'rolling') return { at: null, kind: 'rolling' };
  }
  return { at: null, kind: ROLLING.test(text) ? 'rolling' : 'unknown' };
}

/** A line must name pay explicitly; a bare currency amount ("$180+ billion processed") is not pay. */
const STIPEND_LINE = /(stipend|salary|ctc|compensation|pay range|base pay|\bpay\b|per month|\/\s?(month|mo|year|yr|hour|hr)\b|p\.m\.|\blpa\b|per annum|per year|per hour|annual(ly)? (salary|base))/i;
const NOT_PAY = /(raised|funding|series [a-e]|valuation|revenue|customers|users|billion|million|trillion|transactions|processes|investors|arr\b)/i;

export function extractStipend(text: string, country: string | null | undefined): RuleExtraction['stipend'] {
  const lines = text.split(/\n/).filter((l) => STIPEND_LINE.test(l) && !NOT_PAY.test(l));
  for (const line of lines.slice(0, 15)) {
    const parsed = parseStipend(line.slice(0, 300), { defaultCurrency: country === 'IN' ? 'INR' : 'USD' });
    if (parsed.kind !== 'amount') continue;
    const top = parsed.max ?? parsed.min ?? 0;
    if (top < 100 || (top >= 1990 && top <= 2040 && parsed.min === parsed.max)) continue;
    return { min: parsed.min, max: parsed.max, currency: parsed.currency, period: parsed.period };
  }
  return null;
}

export function extractByRules(input: RuleInput): RuleExtraction {
  const now = input.now ?? new Date();
  const text = input.descriptionMd.slice(0, 50_000);
  const skills = extractSkillSets(input.title, text);
  return {
    skillsRequired: skills.required,
    skillsNice: skills.nice,
    eligibility: extractEligibility(`${input.title}\n${text}`),
    deadline: extractDeadline(text, now),
    stipend: extractStipend(text, input.country),
    remote: inferRemote(`${input.title}\n${text.slice(0, 1_500)}`),
  };
}
