/**
 * Tech-first answer options for the onboarding questions (BRIEF addendum: students in tech). The shared
 * taxonomy keeps non-tech entries; the pickers surface tech first and hide the rest behind "Other".
 */
import {
  Brain,
  Briefcase,
  BriefcaseBusiness,
  Cloud,
  Cpu,
  Database,
  FlaskConical,
  GitBranch,
  Globe,
  GraduationCap,
  House,
  Laptop,
  Layers,
  Microscope,
  PanelsTopLeft,
  PenTool,
  Server,
  Shield,
  Smartphone,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

import {
  ROLE_FAMILIES,
  type DegreeLevel,
  type OpportunityType,
  type RemotePref,
} from '@kestrel/shared';

import type { Tone } from './tones';

// ── Education ─────────────────────────────────────────────────────────────────────────────────────

export interface DegreeChoice {
  id: string;
  label: string;
  /** Stored as `education.degree` (as written). */
  degree: string;
  level: DegreeLevel;
  hint: string;
}

export const DEGREE_CHOICES: readonly DegreeChoice[] = [
  {
    id: 'btech',
    label: 'B.Tech / B.E.',
    degree: 'B.Tech',
    level: 'bachelor',
    hint: 'Engineering undergrad',
  },
  {
    id: 'bsc',
    label: 'B.Sc / BCA',
    degree: 'B.Sc',
    level: 'bachelor',
    hint: 'Science or computer applications',
  },
  {
    id: 'mtech',
    label: 'M.Tech / M.S.',
    degree: 'M.Tech',
    level: 'master',
    hint: 'Engineering postgrad',
  },
  {
    id: 'mca',
    label: 'MCA / M.Sc',
    degree: 'MCA',
    level: 'master',
    hint: 'Computer applications postgrad',
  },
  { id: 'phd', label: 'PhD', degree: 'PhD', level: 'phd', hint: 'Doctoral research' },
  {
    id: 'diploma',
    label: 'Diploma',
    degree: 'Diploma',
    level: 'diploma',
    hint: 'Polytechnic or similar',
  },
];

/** Branches, CS family first. */
export const BRANCHES: readonly string[] = [
  'Computer Science',
  'Information Technology',
  'Artificial Intelligence & ML',
  'Data Science',
  'Electronics & Communication',
  'Electrical & Electronics',
  'Mathematics & Computing',
  'Computer Engineering',
  'Cyber Security',
  'Instrumentation',
  'Mechanical',
  'Civil',
  'Chemical',
  'Physics',
  'Mathematics',
];

export function degreeChoiceOf(degree: string | null | undefined): DegreeChoice | null {
  if (!degree) return null;
  const d = degree.toLowerCase();
  return (
    DEGREE_CHOICES.find((c) => d.startsWith(c.degree.toLowerCase())) ??
    (/\bb\.?e\b|bachelor of engineering/.test(d) ? DEGREE_CHOICES[0]! : null) ??
    (/\bbca\b/.test(d) ? DEGREE_CHOICES[1]! : null) ??
    (/\bm\.?s\b|master of science/.test(d) ? DEGREE_CHOICES[2]! : null) ??
    null
  );
}

/** Graduation years: last year (fresh graduates), this year … +4 (ONBOARDING §2 #5). */
export function gradYearChoices(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 6 }, (_, i) => y - 1 + i);
}

// ── Types ─────────────────────────────────────────────────────────────────────────────────────────

export const TYPE_CARDS: readonly {
  id: string;
  label: string;
  types: OpportunityType[];
  hint: string;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  {
    id: 'internship',
    label: 'Internship',
    types: ['internship'],
    hint: 'SDE, data, ML and more',
    icon: Briefcase,
    tone: 'cobalt',
  },
  {
    id: 'fulltime',
    label: 'Full-time',
    types: ['fulltime'],
    hint: 'Graduate and entry-level roles',
    icon: BriefcaseBusiness,
    tone: 'indigo',
  },
  {
    id: 'hackathon',
    label: 'Hackathon',
    types: ['hackathon'],
    hint: 'Devfolio, MLH, Devpost',
    icon: Trophy,
    tone: 'orange',
  },
  {
    id: 'scholarship',
    label: 'Scholarship / Fellowship',
    types: ['scholarship', 'fellowship'],
    hint: 'Funding for tech students',
    icon: GraduationCap,
    tone: 'pink',
  },
  {
    id: 'research',
    label: 'Research',
    types: ['research'],
    hint: 'Lab internships, SURF, RA roles',
    icon: FlaskConical,
    tone: 'violet',
  },
  {
    id: 'opensource',
    label: 'Open-source programs',
    types: ['opensource'],
    hint: 'GSoC, LFX, Outreachy, MLH Fellowship',
    icon: GitBranch,
    tone: 'lime',
  },
];

/** `answers.interests`, derived from the types (the separate interests page was folded in). */
export function interestsFromTypes(types: readonly OpportunityType[], hasCp = false): string[] {
  return [
    ...(types.includes('opensource') ? ['opensource'] : []),
    ...(types.includes('hackathon') ? ['hackathons'] : []),
    ...(types.includes('research') ? ['research'] : []),
    ...(hasCp ? ['cp'] : []),
  ];
}

/** Sensible default: students still studying want internships + hackathons; graduates want jobs. */
export function defaultTypes(gradYear: number | null, now: Date = new Date()): OpportunityType[] {
  if (gradYear === null || gradYear >= now.getFullYear() + 1) return ['internship', 'hackathon'];
  return ['fulltime', 'internship'];
}

// ── Roles ─────────────────────────────────────────────────────────────────────────────────────────

/** Tech role families shown first (ids from the shared taxonomy), in a sensible reading order. */
export const TECH_ROLE_IDS = [
  'software_engineer',
  'backend',
  'frontend',
  'fullstack',
  'mobile',
  'ml_engineer',
  'data_scientist',
  'data_engineer',
  'data_analyst',
  'devops',
  'cloud',
  'sre',
  'security',
  'systems',
  'embedded',
  'qa',
  'platform',
  'android',
  'ios',
  'game_dev',
  'blockchain',
  'nlp',
  'computer_vision',
  'mlops',
  'research_scientist',
  'research_assistant',
  'quant',
  'product_designer',
  'ux_researcher',
  'product_manager',
  'devrel',
  'technical_writer',
  'open_source',
  'ar_vr',
  'robotics',
] as const;

export interface RoleOption {
  id: string;
  label: string;
  tech: boolean;
}

export const ROLE_OPTIONS: readonly RoleOption[] = (() => {
  const byId = new Map(ROLE_FAMILIES.map((f) => [f.id, f]));
  const tech = TECH_ROLE_IDS.flatMap((id) => {
    const f = byId.get(id);
    return f ? [{ id: f.id, label: f.label, tech: true }] : [];
  });
  const techSet = new Set<string>(TECH_ROLE_IDS);
  const other = ROLE_FAMILIES.filter((f) => !techSet.has(f.id)).map((f) => ({
    id: f.id,
    label: f.label,
    tech: false,
  }));
  return [...tech, ...other];
})();

export function roleLabel(id: string): string {
  return ROLE_OPTIONS.find((r) => r.id === id)?.label ?? id;
}

export const MAX_ROLES = 5;

/** The roles question's cards (ONBOARDING §2 #8): tech families grouped the way students say them. */
export const ROLE_CARDS: readonly {
  id: string;
  label: string;
  roles: readonly string[];
  hint: string;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  {
    id: 'backend',
    label: 'Backend',
    roles: ['backend', 'software_engineer'],
    hint: 'APIs, services, databases',
    icon: Server,
    tone: 'cobalt',
  },
  {
    id: 'frontend',
    label: 'Frontend',
    roles: ['frontend'],
    hint: 'Web UI, React, design systems',
    icon: PanelsTopLeft,
    tone: 'violet',
  },
  {
    id: 'fullstack',
    label: 'Full-stack',
    roles: ['fullstack'],
    hint: 'End to end, MERN and friends',
    icon: Layers,
    tone: 'indigo',
  },
  {
    id: 'mobile',
    label: 'Mobile',
    roles: ['mobile', 'android', 'ios'],
    hint: 'Android, iOS, Flutter',
    icon: Smartphone,
    tone: 'teal',
  },
  {
    id: 'data',
    label: 'Data',
    roles: ['data_analyst', 'data_engineer', 'analytics_engineer'],
    hint: 'Analytics, pipelines, BI',
    icon: Database,
    tone: 'orange',
  },
  {
    id: 'ml',
    label: 'ML / AI',
    roles: ['ml_engineer', 'data_scientist', 'nlp', 'computer_vision', 'mlops'],
    hint: 'Models, LLMs, vision',
    icon: Brain,
    tone: 'pink',
  },
  {
    id: 'devops',
    label: 'DevOps / Cloud / SRE',
    roles: ['devops', 'cloud', 'sre', 'platform'],
    hint: 'Infra, CI/CD, reliability',
    icon: Cloud,
    tone: 'teal',
  },
  {
    id: 'security',
    label: 'Security',
    roles: ['security'],
    hint: 'AppSec, pentesting, SOC',
    icon: Shield,
    tone: 'amber',
  },
  {
    id: 'systems',
    label: 'Systems / Embedded',
    roles: ['systems', 'embedded'],
    hint: 'OS, firmware, low level',
    icon: Cpu,
    tone: 'lime',
  },
  {
    id: 'research',
    label: 'Research',
    roles: ['research_scientist', 'research_assistant'],
    hint: 'Labs, papers, RA roles',
    icon: Microscope,
    tone: 'violet',
  },
  {
    id: 'product',
    label: 'Product / UX for tech',
    roles: ['product_manager', 'product_designer', 'ux_researcher'],
    hint: 'PM, product design, UX research',
    icon: PenTool,
    tone: 'pink',
  },
];

const CARD_ROLE_IDS = new Set(ROLE_CARDS.flatMap((c) => c.roles));

/** Families not covered by a card (the collapsed "Other (non-tech)" group, plus niche tech). */
export const OTHER_ROLE_OPTIONS: readonly RoleOption[] = ROLE_OPTIONS.filter(
  (o) => !CARD_ROLE_IDS.has(o.id),
);

/** Cards whose roles are all chosen (or any, for a prefill from skills). */
export function cardsForRoles(roles: readonly string[]): string[] {
  return ROLE_CARDS.filter((c) => c.roles.some((r) => roles.includes(r))).map((c) => c.id);
}

// ── Stack ─────────────────────────────────────────────────────────────────────────────────────────

/** Quick-add chips grouped by what students actually write on resumes. */
export const POPULAR_STACK: readonly { group: string; items: readonly string[] }[] = [
  {
    group: 'Languages',
    items: ['Python', 'Java', 'C++', 'JavaScript', 'TypeScript', 'Go', 'C', 'Kotlin'],
  },
  { group: 'Frontend', items: ['React', 'Next.js', 'HTML', 'CSS', 'Tailwind CSS', 'Vue.js'] },
  {
    group: 'Backend',
    items: ['Node.js', 'Express', 'Django', 'Spring Boot', 'FastAPI', 'PostgreSQL', 'MongoDB'],
  },
  {
    group: 'Data & ML',
    items: ['SQL', 'Pandas', 'NumPy', 'PyTorch', 'TensorFlow', 'scikit-learn'],
  },
  { group: 'Cloud & DevOps', items: ['AWS', 'Docker', 'Kubernetes', 'Linux', 'GCP', 'CI/CD'] },
  { group: 'Mobile', items: ['Android', 'Flutter', 'React Native', 'Swift'] },
  { group: 'Tools', items: ['Git', 'Figma', 'Postman', 'Jira'] },
];

/** The stack page's extra chip; it writes `answers.interests: ['cp']` rather than a skill. */
export const COMPETITIVE_PROGRAMMING = 'Competitive programming';

// ── Location ──────────────────────────────────────────────────────────────────────────────────────

export const REMOTE_CARDS: readonly {
  value: RemotePref;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  {
    value: 'remote_only',
    label: 'Remote only',
    hint: 'On-site roles drop down the list',
    icon: House,
    tone: 'teal',
  },
  {
    value: 'prefer_remote',
    label: 'Remote or hybrid',
    hint: 'Remote ranks higher',
    icon: Laptop,
    tone: 'cobalt',
  },
  { value: 'any', label: 'Anywhere', hint: 'Rank on fit alone', icon: Globe, tone: 'violet' },
];

/** Tech hubs first. */
export const CITY_CHIPS: readonly string[] = [
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Gurugram',
  'Noida',
  'Mumbai',
  'Chennai',
  'Delhi',
  'Kolkata',
  'Ahmedabad',
];

// ── Stipend ───────────────────────────────────────────────────────────────────────────────────────

/** Slider ranges per currency (ONBOARDING §2 #10: ₹0–₹1,00,000 in ₹5k steps). */
export const STIPEND_SLIDER: Record<'INR' | 'USD', { max: number; step: number }> = {
  INR: { max: 100_000, step: 5_000 },
  USD: { max: 5_000, step: 250 },
};

// ── Work authorisation ────────────────────────────────────────────────────────────────────────────

export const WORK_COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'SG', name: 'Singapore' },
  { code: 'CA', name: 'Canada' },
  { code: 'AE', name: 'UAE' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
];

export function countryName(code: string): string {
  return WORK_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// ── Companies ─────────────────────────────────────────────────────────────────────────────────────

export interface CompanyOption {
  name: string;
  domain: string;
}

/** Companies students in tech ask about most (logos come from the domain). */
export const POPULAR_COMPANIES: readonly CompanyOption[] = [
  { name: 'Google', domain: 'google.com' },
  { name: 'Microsoft', domain: 'microsoft.com' },
  { name: 'Amazon', domain: 'amazon.com' },
  { name: 'Atlassian', domain: 'atlassian.com' },
  { name: 'Razorpay', domain: 'razorpay.com' },
  { name: 'Zerodha', domain: 'zerodha.com' },
  { name: 'CRED', domain: 'cred.club' },
  { name: 'Flipkart', domain: 'flipkart.com' },
  { name: 'Swiggy', domain: 'swiggy.com' },
  { name: 'Stripe', domain: 'stripe.com' },
  { name: 'Postman', domain: 'postman.com' },
  { name: 'Uber', domain: 'uber.com' },
  { name: 'Adobe', domain: 'adobe.com' },
  { name: 'NVIDIA', domain: 'nvidia.com' },
  { name: 'Meesho', domain: 'meesho.com' },
  { name: 'PhonePe', domain: 'phonepe.com' },
];
