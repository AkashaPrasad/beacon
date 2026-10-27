/**
 * Deterministic resume parser (no AI): text → sections → structured profile draft.
 * Works for the common single-column student resume; anything it cannot find is left empty
 * and reported in `warnings` so the user can fill it in.
 */
import {
  classifyRole,
  educationSchema,
  experienceSchema,
  extractSkills,
  profileInputSchema,
  profileLinkSchema,
  projectSchema,
  spokenLanguageSchema,
  type DegreeLevel,
  type ExtractedSkill,
} from '@kestrel/shared';
import type { z } from 'zod';

import { cleanText } from './extract.js';

export type ParsedProfile = z.output<typeof profileInputSchema>;

export const SECTION_NAMES = [
  'summary',
  'education',
  'experience',
  'projects',
  'skills',
  'links',
  'achievements',
  'certifications',
  'positions',
  'publications',
  'languages',
  'interests',
] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

const SECTION_PATTERNS: readonly [SectionName, RegExp][] = [
  ['summary', /^(professional\s+|career\s+)?(summary|profile|objective|about(\s+me)?)$/i],
  [
    'education',
    /^(education(al)?(\s+(background|details|qualifications?))?|academics?|academic\s+(background|details|qualifications?)|qualifications?|scholastic\s+(record|achievements?))$/i,
  ],
  [
    'experience',
    /^((work|professional|industry|relevant|internship)\s+experiences?|experiences?|employment(\s+history)?|work\s+history|internships?)$/i,
  ],
  ['projects', /^((personal|academic|key|selected|technical|major|notable|side)\s+)?projects?$/i],
  [
    'skills',
    /^((technical|key|core|relevant|professional)\s+)?(skills?|competencies|technologies|tech\s+stack|skills?\s*(&|and)\s*(tools|technologies|interests|expertise))(\s+summary)?$/i,
  ],
  ['links', /^(links|profiles|online\s+(presence|profiles)|social(\s+links)?|contact(\s+(info|information|details))?)$/i],
  ['achievements', /^(achievements?|awards?(\s*(&|and)\s*(honors|honours|achievements))?|honou?rs(\s*(&|and)\s*awards)?|accomplishments)$/i],
  ['certifications', /^(certifications?|certificates?|courses?(\s*(&|and)\s*certifications?)?|licen[cs]es(\s*(&|and)\s*certifications)?)$/i],
  [
    'positions',
    /^(positions?\s+of\s+responsibility|leadership(\s+experience)?|extra[- ]?curricular(\s+activities)?|activities|volunteer(ing|\s+experience)?)$/i,
  ],
  ['publications', /^(publications?|research(\s+experience)?|papers)$/i],
  ['languages', /^(languages?(\s+known)?|spoken\s+languages)$/i],
  ['interests', /^(interests|hobbies(\s*(&|and)\s*interests)?)$/i],
];

const BULLET_RE = /^(?:[•●○◦▪▫■□►▶➢➤✓✔∙·*\-–—]|\d{1,2}[.)])\s*/;
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_TOKEN = `(?:${MONTH}\\s*'?\\d{2,4}|\\d{1,2}[/.-]\\d{4}|(?:19|20)\\d{2})`;
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|till)\\s*(${DATE_TOKEN}|present|current|now|ongoing|till\\s+date|date)`,
  'i',
);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const HAS_EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?\(?\d[\d\s().-]{8,15}\d/g;
const URL_RE =
  /\b((?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|in|io|dev|me|app|ai|co|org|net|xyz|tech|site|page|so|sh|codes)(?:\/[^\s,;|()<>"'\]]*)?)/gi;
const ROLE_WORDS =
  /\b(intern(ship)?|engineer|developer|analyst|scientist|manager|designer|lead|associate|consultant|research(er)?|assistant|trainee|fellow|member|head|founder|co-founder|president|coordinator|volunteer|architect|specialist|officer|executive|programmer|sde|swe|mentor|ambassador|tutor|teaching)\b/i;

export interface DeterministicResume {
  profile: ParsedProfile;
  sections: SectionName[];
  sectionText: Partial<Record<SectionName, string>>;
  skills: ExtractedSkill[];
  emails: string[];
  phones: string[];
  warnings: string[];
  textChars: number;
}

// ── Sections ─────────────────────────────────────────────────────────────────

function headingOf(line: string): SectionName | null {
  const bare = line
    .replace(BULLET_RE, '')
    .replace(/[:：\-–—|]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!bare || bare.length > 45) return null;
  for (const [name, re] of SECTION_PATTERNS) if (re.test(bare)) return name;
  return null;
}

export function splitSections(text: string): {
  header: string[];
  sections: Map<SectionName, string[]>;
} {
  const sections = new Map<SectionName, string[]>();
  const header: string[] = [];
  let current: SectionName | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = headingOf(line);
    if (heading) {
      current = heading;
      if (!sections.has(heading)) sections.set(heading, []);
      continue;
    }
    // Inline "Skills: Python, Java" starts a section unless we are already inside skills
    // (where "Languages: C++, Go" is a skill category, not a spoken-language section).
    const inline = /^([A-Za-z &]{3,40})[:：]\s*(.+)$/.exec(line);
    if (inline?.[1] && inline[2] && current !== 'skills') {
      const inlineHeading = headingOf(inline[1]);
      if (inlineHeading) {
        current = inlineHeading;
        const list = sections.get(inlineHeading) ?? [];
        list.push(inline[2].trim());
        sections.set(inlineHeading, list);
        continue;
      }
    }
    if (current) sections.get(current)?.push(line);
    else header.push(line);
  }
  return { header, sections };
}

// ── Contact details & links ──────────────────────────────────────────────────

export function extractEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(PHONE_RE)) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) continue;
    if (/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(raw)) continue;
    if (DATE_RANGE_RE.test(raw)) continue;
    out.add(raw.replace(/\s+/g, ' '));
  }
  return [...out];
}

type LinkKind = 'github' | 'linkedin' | 'portfolio' | 'leetcode' | 'kaggle' | 'devpost' | 'scholar' | 'other';

const LINK_HOSTS: readonly [RegExp, LinkKind][] = [
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)leetcode\.com$/, 'leetcode'],
  [/(^|\.)kaggle\.com$/, 'kaggle'],
  [/(^|\.)devpost\.com$/, 'devpost'],
  [/^scholar\.google\./, 'scholar'],
  [/\.github\.io$|\.vercel\.app$|\.netlify\.app$|\.pages\.dev$|\.dev$|\.me$|\.site$|\.page$/, 'portfolio'],
];
const OTHER_PROFILE_HOSTS = /(^|\.)(gitlab\.com|behance\.net|dribbble\.com|medium\.com|codeforces\.com|codechef\.com|hackerrank\.com|stackoverflow\.com|x\.com|twitter\.com)$/;

export function classifyLink(url: URL): LinkKind | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  for (const [re, kind] of LINK_HOSTS) if (re.test(host)) return kind;
  if (OTHER_PROFILE_HOSTS.test(host)) return 'other';
  return null;
}

function toUrl(raw: string): URL | null {
  const trimmed = raw.replace(/[.,;:)\]}>]+$/, '');
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    url.protocol = 'https:';
    return url;
  } catch {
    return null;
  }
}

/** Profile links (GitHub user page, LinkedIn, LeetCode, portfolio, ...). Repo links are left to projects. */
export function extractLinks(text: string, headerText: string): { kind: LinkKind; url: string }[] {
  const withoutEmails = text.replace(EMAIL_RE, ' ');
  const header = headerText.replace(EMAIL_RE, ' ');
  const seen = new Set<string>();
  const out: { kind: LinkKind; url: string }[] = [];
  for (const match of withoutEmails.matchAll(URL_RE)) {
    const raw = match[1];
    if (!raw) continue;
    const url = toUrl(raw);
    if (!url) continue;
    let kind = classifyLink(url);
    // Unknown hosts count as a portfolio only when they sit in the resume header with a scheme.
    if (!kind && /^https?:\/\//i.test(raw) && header.includes(raw)) kind = 'portfolio';
    if (!kind) continue;
    let href = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    if (kind === 'github') {
      const user = url.pathname.split('/').filter(Boolean)[0];
      if (!user) continue;
      href = `https://github.com/${user}`;
    }
    if (kind === 'linkedin' && !/\/(in|pub|company)\//.test(url.pathname)) continue;
    const key = href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, url: href });
  }
  return out;
}

// ── Education ────────────────────────────────────────────────────────────────

interface DegreePattern {
  re: RegExp;
  label: string;
  level: DegreeLevel;
}

const DEGREE_PATTERNS: readonly DegreePattern[] = [
  { re: /\bdual\s+degree\b/i, label: 'Dual Degree', level: 'master' },
  { re: /\b(ph\.?\s?d\.?|doctor\s+of\s+philosophy)(?![a-z])/i, label: 'PhD', level: 'phd' },
  { re: /\b(m\.?\s?tech|master\s+of\s+technology)\b/i, label: 'M.Tech', level: 'master' },
  { re: /\b(mba|pgdm|master\s+of\s+business\s+administration)\b/i, label: 'MBA', level: 'master' },
  { re: /\b(mca|master\s+of\s+computer\s+applications)\b/i, label: 'MCA', level: 'master' },
  { re: /\b(m\.?\s?sc|master\s+of\s+science)\b/i, label: 'MSc', level: 'master' },
  { re: /(?<![A-Za-z])(M\.S\.?|MS)(?=\s*(?:in\b|\(|,|-|–|$))/, label: 'MS', level: 'master' },
  { re: /\bmaster\s+of\s+engineering\b|(?<![A-Za-z])M\.E\.?(?![A-Za-z])/i, label: 'M.E.', level: 'master' },
  { re: /\b(b\.?\s?tech|bachelor\s+of\s+technology)\b/i, label: 'B.Tech', level: 'bachelor' },
  { re: /\bbachelor\s+of\s+engineering\b|(?<![A-Za-z])(B\.E\.?|BE)(?=\s*(?:in\b|\(|,|-|–|$))/, label: 'BE', level: 'bachelor' },
  { re: /\b(bca|bachelor\s+of\s+computer\s+applications)\b/i, label: 'BCA', level: 'bachelor' },
  { re: /\b(b\.?\s?sc|bachelor\s+of\s+science)\b|(?<![A-Za-z])B\.?S\.?(?=\s*(?:in\b|\(|,|-|–))/i, label: 'BSc', level: 'bachelor' },
  { re: /\b(b\.?\s?com|bachelor\s+of\s+commerce)\b/i, label: 'B.Com', level: 'bachelor' },
  { re: /\b(bba|bachelor\s+of\s+business\s+administration)\b/i, label: 'BBA', level: 'bachelor' },
  { re: /\bb\.?\s?des\b|\bbachelor\s+of\s+design\b/i, label: 'B.Des', level: 'bachelor' },
  { re: /\bb\.a\.|\bbachelor\s+of\s+arts\b/i, label: 'BA', level: 'bachelor' },
  { re: /\bdiploma\b/i, label: 'Diploma', level: 'diploma' },
  { re: /\b(class\s+(xii|12)|hsc|higher\s+secondary|senior\s+secondary|cbse|isc)\b/i, label: 'Class XII', level: 'highschool' },
];

const BRANCH_ABBREVIATIONS: Readonly<Record<string, string>> = {
  CSE: 'Computer Science and Engineering',
  CS: 'Computer Science',
  ECE: 'Electronics and Communication Engineering',
  EEE: 'Electrical and Electronics Engineering',
  EE: 'Electrical Engineering',
  IT: 'Information Technology',
  ME: 'Mechanical Engineering',
  CE: 'Civil Engineering',
  AIML: 'Artificial Intelligence and Machine Learning',
  'AI&ML': 'Artificial Intelligence and Machine Learning',
  'AI & ML': 'Artificial Intelligence and Machine Learning',
  AIDS: 'Artificial Intelligence and Data Science',
};

const KNOWN_BRANCHES = [
  'Computer Science and Engineering',
  'Computer Science & Engineering',
  'Computer Science and Business Systems',
  'Computer Science',
  'Computer Engineering',
  'Information Technology',
  'Information Science',
  'Electronics and Communication Engineering',
  'Electronics & Communication Engineering',
  'Electronics and Communication',
  'Electrical and Electronics Engineering',
  'Electrical Engineering',
  'Electronics Engineering',
  'Electronics and Telecommunication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Aerospace Engineering',
  'Biotechnology',
  'Engineering Physics',
  'Mathematics and Computing',
  'Artificial Intelligence and Machine Learning',
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence',
  'Data Science',
  'Machine Learning',
  'Mathematics',
  'Statistics',
  'Physics',
  'Chemistry',
  'Economics',
  'Design',
];

function detectBranch(line: string): string | null {
  const lower = line.toLowerCase();
  for (const branch of KNOWN_BRANCHES) {
    if (lower.includes(branch.toLowerCase())) return branch.replace(' & ', ' and ');
  }
  for (const [abbr, name] of Object.entries(BRANCH_ABBREVIATIONS)) {
    const re = new RegExp(`(?:\\(|\\bin\\s+|[,–-]\\s*)${abbr.replace(/[&]/g, '\\&')}(?:\\)|\\b|$)`);
    if (re.test(line)) return name;
  }
  const inMatch = /\b(?:in|of)\s+([A-Z][A-Za-z&]+(?:\s+(?:and|&|of|[A-Z][A-Za-z&]+)){0,5})/.exec(line);
  if (inMatch?.[1] && !/^(Technology|Engineering|Science|Philosophy|Arts|Commerce)$/.test(inMatch[1])) {
    return inMatch[1].trim();
  }
  return null;
}

const GRAD_MARKER_RE =
  /(?:batch\s+of|class\s+of|expected(?:\s+graduation)?|graduating(?:\s+in)?|graduation(?:\s+year)?|passing\s+year|year\s+of\s+(?:passing|graduation)|exp\.)\s*[:\-–]?\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?['’]?((?:20)?\d{2})\b/gi;

function fullYear(token: string): number {
  const n = Number(token);
  return token.length === 2 ? 2000 + n : n;
}

/** Graduation year: explicit markers ("Batch of 2027", "Expected May 2026") win, then date ranges. */
export function extractGradYear(educationText: string, fullText: string): number | null {
  const markerYears: number[] = [];
  for (const source of [educationText, fullText]) {
    for (const m of source.matchAll(GRAD_MARKER_RE)) {
      const year = fullYear(m[1] ?? '');
      if (year >= 2024 && year <= 2032) markerYears.push(year);
    }
    if (markerYears.length) return Math.max(...markerYears);
  }
  const rangeEnds: number[] = [];
  for (const m of educationText.matchAll(new RegExp(DATE_RANGE_RE.source, 'gi'))) {
    const end = m[2] ?? '';
    const year = /(\d{4})/.exec(end)?.[1] ?? /'(\d{2})$/.exec(end)?.[1];
    if (year) rangeEnds.push(fullYear(year));
  }
  const plausible = rangeEnds.filter((y) => y >= 1990 && y <= 2035);
  if (plausible.length) return Math.max(...plausible);
  const loose = [...educationText.matchAll(/\b(20(?:2[4-9]|3[0-2]))\b/g)].map((m) => Number(m[1]));
  return loose.length ? Math.max(...loose) : null;
}

function extractGpa(text: string): { value: number; scale: number } | null {
  const m = /\b(?:c?gpa|cpi|spi|sgpa)\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*(\d{1,3}(?:\.\d+)?))?/i.exec(text);
  const pct = /\b(\d{2}(?:\.\d{1,2})?)\s*%/.exec(text);
  if (m?.[1]) {
    const value = Number(m[1]);
    const scale = m[2] ? Number(m[2]) : value <= 4 ? 4 : 10;
    if (value <= scale && scale <= 100) return { value, scale };
  }
  if (pct?.[1]) {
    const value = Number(pct[1]);
    if (value <= 100) return { value, scale: 100 };
  }
  return null;
}

const INSTITUTION_RE =
  /\b(university|universit[äé]|institute|institution|college|school|academy|polytechnic|vidyalaya|vidyapeeth|iit|nit|iiit|bits|vit|iisc|iiser|iim)\b/i;

function cleanInstitution(line: string): string {
  return line
    .replace(DATE_RANGE_RE, '')
    .replace(/\b(?:c?gpa|cpi)\b.*$/i, '')
    .split(/\s[|•·]\s|\s{2,}|\t/)[0]!
    .replace(/[,\-–|]+\s*$/, '')
    .trim()
    .slice(0, 200);
}

export function parseEducation(lines: string[], fullText: string): {
  entries: ParsedProfile['education'];
  warnings: string[];
} {
  const warnings: string[] = [];
  const text = lines.join('\n');
  let degreeLine = -1;
  let degree: DegreePattern | null = null;
  for (const [i, line] of lines.entries()) {
    for (const pattern of DEGREE_PATTERNS) {
      if (pattern.level === 'highschool') continue;
      const m = pattern.re.exec(line);
      if (m) {
        degree = pattern;
        degreeLine = i;
        break;
      }
    }
    if (degree) break;
  }
  const gradYear = extractGradYear(text, fullText);
  if (!degree) {
    if (lines.length) warnings.push('Could not recognise a degree in the education section.');
    if (gradYear === null) warnings.push('Graduation year not found; add it so eligibility checks work.');
    return { entries: [], warnings };
  }
  const window = lines.slice(Math.max(0, degreeLine - 2), degreeLine + 3);
  const institutionLine =
    [lines[degreeLine] ?? '', ...window].find((l) => INSTITUTION_RE.test(l)) ?? null;
  const branch = detectBranch(lines[degreeLine] ?? '') ?? detectBranch(lines[degreeLine + 1] ?? '');
  if (gradYear === null) {
    warnings.push('Graduation year not found; add it so eligibility checks work.');
    return { entries: [], warnings };
  }
  if (!institutionLine) warnings.push('Institution name not found in the education section.');
  const startYearMatch = DATE_RANGE_RE.exec(window.join(' '));
  const startYear = startYearMatch?.[1] ? Number(/(\d{4})/.exec(startYearMatch[1])?.[1] ?? NaN) : NaN;
  const degreeLabel = degree.label === 'Dual Degree' ? 'Dual Degree' : degree.label;
  const candidate = {
    institution: institutionLine ? cleanInstitution(institutionLine) || 'Not specified' : 'Not specified',
    degree: branch ? `${degreeLabel} ${branch}`.slice(0, 120) : degreeLabel,
    degreeLevel: degree.level,
    field: branch,
    startYear: Number.isFinite(startYear) && startYear < gradYear ? startYear : null,
    gradYear,
    current: gradYear >= new Date().getUTCFullYear(),
    gpa: extractGpa(window.join(' ')),
  };
  const parsed = educationSchema.safeParse(candidate);
  if (!parsed.success) {
    warnings.push('Education details were incomplete; please review them.');
    return { entries: [], warnings };
  }
  return { entries: [parsed.data], warnings };
}

// ── Experience ───────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDateToken(token: string): Date | null {
  const t = token.trim().toLowerCase();
  if (/^(present|current|now|ongoing|till\s+date|date)$/.test(t)) return null;
  const monthYear = /^([a-z]+)\.?\s*'?(\d{2,4})$/.exec(t);
  if (monthYear?.[1] && monthYear[2]) {
    const month = MONTHS.indexOf(monthYear[1].slice(0, 3));
    if (month >= 0) return new Date(Date.UTC(fullYear(monthYear[2]), month, 1));
  }
  const numeric = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (numeric?.[1] && numeric[2]) return new Date(Date.UTC(Number(numeric[2]), Number(numeric[1]) - 1, 1));
  const year = /^(\d{4})$/.exec(t);
  if (year?.[1]) return new Date(Date.UTC(Number(year[1]), 0, 1));
  return null;
}

function splitRoleCompany(header: string): { title: string | null; company: string | null } {
  const text = header.replace(/\s+/g, ' ').replace(/[|,–—-]+\s*$/, '').trim();
  const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(text);
  if (at?.[1] && at[2]) return { title: at[1].trim(), company: at[2].trim() };
  const parts = text.split(/\s*(?:\||–|—|\s-\s|,)\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const [a = '', b = ''] = parts;
    if (ROLE_WORDS.test(a) && !ROLE_WORDS.test(b)) return { title: a, company: b };
    if (ROLE_WORDS.test(b) && !ROLE_WORDS.test(a)) return { title: b, company: a };
    return { title: a, company: b };
  }
  if (!text) return { title: null, company: null };
  return ROLE_WORDS.test(text) ? { title: text, company: null } : { title: null, company: text };
}

export function parseExperience(lines: string[]): {
  entries: ParsedProfile['experience'];
  experienceYears: number;
} {
  interface Draft {
    header: string;
    extra: string | null;
    start: Date | null;
    end: Date | null;
    current: boolean;
    bullets: string[];
  }
  const drafts: Draft[] = [];
  let pendingHeader: string | null = null;
  for (const line of lines) {
    const range = DATE_RANGE_RE.exec(line);
    const isBullet = BULLET_RE.test(line);
    if (range && !isBullet) {
      const headerPart = line.replace(range[0], '').replace(/[()|,–—-]+\s*$/, '').trim();
      const header = headerPart.length >= 3 ? headerPart : (pendingHeader ?? '');
      const endToken = range[2] ?? '';
      drafts.push({
        header,
        extra: headerPart.length >= 3 ? pendingHeader : null,
        start: parseDateToken(range[1] ?? ''),
        end: parseDateToken(endToken),
        current: /present|current|now|ongoing|till/i.test(endToken),
        bullets: [],
      });
      pendingHeader = null;
      continue;
    }
    const last = drafts.at(-1);
    if (isBullet && last) {
      last.bullets.push(line.replace(BULLET_RE, '').trim());
    } else if (last && last.bullets.length === 0 && !last.extra && line.length < 90) {
      last.extra = line;
    } else if (!isBullet) {
      pendingHeader = line;
    }
  }

  const entries: ParsedProfile['experience'] = [];
  let months = 0;
  for (const d of drafts) {
    let { title, company } = splitRoleCompany(d.header);
    if (d.extra) {
      const other = splitRoleCompany(d.extra);
      if (!title) title = other.title ?? (ROLE_WORDS.test(d.extra) ? d.extra : null);
      if (!company) company = other.company ?? (!ROLE_WORDS.test(d.extra) ? d.extra : null);
    }
    if (!title && company) title = 'Role';
    if (!company && title) company = 'Not specified';
    const parsed = experienceSchema.safeParse({
      company: company?.slice(0, 200),
      title: title?.slice(0, 200),
      startDate: d.start,
      endDate: d.current ? null : d.end,
      current: d.current,
      description: d.bullets.length ? d.bullets.join('\n').slice(0, 5_000) : null,
    });
    if (!parsed.success) continue;
    entries.push(parsed.data);
    if (d.start) {
      const end = d.current || !d.end ? new Date() : d.end;
      const span = (end.getUTCFullYear() - d.start.getUTCFullYear()) * 12 + end.getUTCMonth() - d.start.getUTCMonth();
      months += Math.max(1, Math.min(span + (d.end && !d.current ? 1 : 0), 120));
    }
  }
  return { entries, experienceYears: Math.round((months / 12) * 10) / 10 };
}

// ── Projects ─────────────────────────────────────────────────────────────────

export function parseProjects(lines: string[]): ParsedProfile['projects'] {
  interface Draft {
    title: string;
    bullets: string[];
  }
  const drafts: Draft[] = [];
  for (const line of lines) {
    const isBullet = BULLET_RE.test(line);
    const last = drafts.at(-1);
    if (isBullet && last) {
      last.bullets.push(line.replace(BULLET_RE, '').trim());
    } else if (!isBullet && last && last.bullets.length === 0 && line.length > 80) {
      last.bullets.push(line);
    } else if (!isBullet) {
      drafts.push({ title: line, bullets: [] });
    } else {
      drafts.push({ title: line.replace(BULLET_RE, '').trim(), bullets: [] });
    }
  }
  const projects: ParsedProfile['projects'] = [];
  for (const d of drafts) {
    const urlMatch = /(https?:\/\/[^\s|,)]+|(?:www\.)?github\.com\/[^\s|,)]+)/i.exec(`${d.title} ${d.bullets.join(' ')}`);
    const rawTitle = d.title.replace(DATE_RANGE_RE, '').replace(/(https?:\/\/\S+|github\.com\/\S+)/gi, '');
    const [name = '', ...rest] = rawTitle.split(/\s*(?:\||–|—|\s-\s|:)\s*/);
    const cleanName = name.replace(/[,\-–|]+\s*$/, '').trim();
    if (cleanName.length < 2) continue;
    const skillText = `${rest.join(' ')} ${d.bullets.join(' ')}`;
    const url = urlMatch?.[1] ? toUrl(urlMatch[1])?.toString().replace(/\/$/, '') ?? null : null;
    const parsed = projectSchema.safeParse({
      name: cleanName.slice(0, 160),
      description: d.bullets.length ? d.bullets.join('\n').slice(0, 5_000) : null,
      url,
      skills: extractSkills(skillText)
        .map((s) => s.canonical)
        .slice(0, 20),
    });
    if (parsed.success) projects.push(parsed.data);
  }
  return projects.slice(0, 20);
}

// ── Languages ────────────────────────────────────────────────────────────────

function parseLanguages(lines: string[]): ParsedProfile['languages'] {
  const out: ParsedProfile['languages'] = [];
  for (const part of lines.join(',').split(/[,|•;/]+/)) {
    const m = /^\s*([A-Za-zÀ-ɏऀ-ॿ ]{2,40}?)\s*(?:\(([^)]+)\))?\s*$/.exec(part);
    if (!m?.[1]) continue;
    const level = (m[2] ?? '').toLowerCase();
    const proficiency = /native|mother/.test(level)
      ? 'native'
      : /fluent|professional|full/.test(level)
        ? 'professional'
        : /conversational|intermediate|working/.test(level)
          ? 'conversational'
          : /basic|elementary|beginner/.test(level)
            ? 'basic'
            : 'professional';
    const parsed = spokenLanguageSchema.safeParse({ name: m[1].trim(), proficiency });
    if (parsed.success) out.push(parsed.data);
  }
  return out.slice(0, 10);
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function parseResumeText(rawText: string): DeterministicResume {
  const text = cleanText(rawText);
  const warnings: string[] = [];
  const { header, sections } = splitSections(text);
  const get = (name: SectionName) => sections.get(name) ?? [];
  const sectionText: Partial<Record<SectionName, string>> = {};
  for (const [name, lines] of sections) sectionText[name] = lines.join('\n');

  if (sections.size === 0) {
    warnings.push(
      'No standard section headings were found (the resume may use an unusual layout or language). Review every field.',
    );
  }

  const skills = extractSkills(text);
  if (!sections.has('skills')) {
    warnings.push(
      skills.length
        ? 'No skills section found; skills were picked up from the rest of the resume.'
        : 'No skills found. Add your skills so matching works.',
    );
  }

  const education = parseEducation(get('education'), text);
  warnings.push(...education.warnings);
  const experience = parseExperience(get('experience'));
  const projects = parseProjects(get('projects'));

  const headerText = header.join('\n');
  const links = extractLinks(text, headerText)
    .map((l) => profileLinkSchema.safeParse(l))
    .flatMap((r) => (r.success ? [r.data] : []))
    .slice(0, 20);

  const headlineLine = header
    .slice(1, 4)
    .find((l) => l.length <= 100 && ROLE_WORDS.test(l) && !HAS_EMAIL_RE.test(l) && !/\d{5,}/.test(l));
  const summary = get('summary').join(' ').slice(0, 2_000) || null;

  const roleSources = [headlineLine ?? '', ...experience.entries.map((e) => e.title)];
  const preferredRoles = [
    ...new Set(roleSources.map((t) => (t ? classifyRole(t)?.family : undefined)).filter((f): f is string => Boolean(f))),
  ].slice(0, 3);

  const profile = profileInputSchema.parse({
    headline: headlineLine ?? null,
    summary,
    skills: skills.slice(0, 60).map((s) => ({ name: s.canonical.slice(0, 80), proficiency: 'intermediate', years: null })),
    education: education.entries,
    experience: experience.entries,
    experienceYears: Math.min(experience.experienceYears, 60),
    projects,
    links,
    preferredRoles,
    languages: parseLanguages(get('languages')),
  });

  return {
    profile,
    sections: [...sections.keys()],
    sectionText,
    skills,
    emails: extractEmails(text),
    phones: extractPhones(headerText || text.slice(0, 600)),
    warnings,
    textChars: text.length,
  };
}
