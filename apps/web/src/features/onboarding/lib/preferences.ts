/**
 * Step 2 (Preferences) form model: the zod schema the form validates with, defaults derived from the
 * parsed profile (USERFLOW §1.5 prefill column) and the mapping to a `PATCH /v1/profile` body.
 * Reused by Profile > Preferences.
 */
import { z } from 'zod';

import {
  editEducation,
  primaryEducation,
  suggestRoles,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import {
  DEGREE_LEVELS,
  KNOWN_CITIES,
  OPPORTUNITY_TYPES,
  REMOTE_PREFS,
  type OpportunityType,
  type ProfilePatch,
  type RemotePref,
} from '@kestrel/shared';

// ── Choices ───────────────────────────────────────────────────────────────────────────────────────

/** USERFLOW §1.5 #3: three choices; stored as the closest `RemotePref`. */
export const REMOTE_CHOICES: readonly { value: RemotePref; label: string; hint: string }[] = [
  { value: 'remote_only', label: 'Remote only', hint: 'On-site roles are capped at 50' },
  { value: 'prefer_remote', label: 'Remote or hybrid', hint: 'Remote ranks higher' },
  { value: 'any', label: 'Any', hint: 'No preference' },
];

/** Collapses the five stored prefs onto the three choices shown. */
export function remoteChoiceOf(pref: RemotePref): RemotePref {
  if (pref === 'remote_only') return 'remote_only';
  if (pref === 'prefer_remote' || pref === 'hybrid') return 'prefer_remote';
  return 'any';
}

/** The type cards. Scholarship and fellowship are one card (USERFLOW §1.5 #1). */
export const TYPE_CHOICES: readonly {
  id: string;
  label: string;
  types: readonly OpportunityType[];
  hint: string;
}[] = [
  { id: 'internship', label: 'Internship', types: ['internship'], hint: 'Paid or unpaid, 1–12 months' },
  { id: 'fulltime', label: 'Full-time', types: ['fulltime'], hint: 'Graduate and entry-level roles' },
  { id: 'hackathon', label: 'Hackathon', types: ['hackathon'], hint: 'Online and in-person' },
  {
    id: 'scholarship',
    label: 'Scholarship / Fellowship',
    types: ['scholarship', 'fellowship'],
    hint: 'Funding, fellowships, grants',
  },
  { id: 'research', label: 'Research', types: ['research'], hint: 'Labs and research internships' },
  {
    id: 'opensource',
    label: 'Open-source programs',
    types: ['opensource'],
    hint: 'GSoC, LFX, MLH Fellowship',
  },
];

export const STIPEND_CURRENCIES = {
  INR: { symbol: '₹', max: 100_000, step: 5_000, locale: 'en-IN' },
  USD: { symbol: '$', max: 5_000, step: 250, locale: 'en-US' },
} as const;
export type StipendCurrency = keyof typeof STIPEND_CURRENCIES;

/** "₹45,000/mo" or "No minimum". */
export function formatStipendFloor(amount: number, currency: StipendCurrency): string {
  if (amount <= 0) return 'No minimum';
  const c = STIPEND_CURRENCIES[currency];
  return `${c.symbol}${new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(amount)}/mo`;
}

/** Countries offered for work authorisation (ISO alpha-2), India first. */
export const WORK_AUTH_COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'UAE' },
  { code: 'AU', name: 'Australia' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'JP', name: 'Japan' },
  { code: 'FR', name: 'France' },
];

export const LANGUAGE_CHOICES: readonly string[] = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
  'Urdu',
  'German',
  'French',
  'Spanish',
  'Japanese',
];

export const EXPERIENCE_BANDS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'None yet' },
  { value: 0.5, label: 'Under 1 year' },
  { value: 1, label: '1–2 years' },
  { value: 3, label: '3+ years' },
];

export const SPECIAL_LOCATIONS = ['Remote', 'Anywhere in India', 'Outside India'] as const;

export interface LocationOption {
  value: string;
  label: string;
  group: 'Suggested' | 'India' | 'Worldwide';
  keywords: readonly string[];
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  IE: 'Ireland',
  DE: 'Germany',
  NL: 'Netherlands',
  FR: 'France',
  SG: 'Singapore',
  AE: 'UAE',
  AU: 'Australia',
  JP: 'Japan',
};

/** Indian metros first, then every known Indian city, then the world (USERFLOW §1.5 #3). */
export const LOCATION_OPTIONS: readonly LocationOption[] = (() => {
  const metros = ['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Gurugram', 'Noida', 'Kolkata'];
  const special: LocationOption[] = SPECIAL_LOCATIONS.map((value) => ({
    value,
    label: value,
    group: 'Suggested',
    keywords: value === 'Remote' ? ['wfh', 'work from home', 'online'] : ['india', 'abroad', 'global'],
  }));
  const byName = new Map(KNOWN_CITIES.map((c) => [c.name, c]));
  const india = [
    ...metros.flatMap((m) => (byName.has(m) ? [byName.get(m)!] : [])),
    ...KNOWN_CITIES.filter((c) => c.country === 'IN' && !metros.includes(c.name)),
  ].map<LocationOption>((c) => ({
    value: c.name,
    label: c.name,
    group: 'India',
    keywords: [...c.aliases, c.region ?? ''].filter(Boolean),
  }));
  const world = KNOWN_CITIES.filter((c) => c.country !== 'IN').map<LocationOption>((c) => ({
    value: c.name,
    label: COUNTRY_NAMES[c.country] ? `${c.name}, ${COUNTRY_NAMES[c.country] ?? ''}` : c.name,
    group: 'Worldwide',
    keywords: [...c.aliases, c.country],
  }));
  return [...special, ...india, ...world];
})();

// ── Schema ────────────────────────────────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

export const preferencesFormSchema = z.object({
  opportunityTypes: z
    .array(z.enum(OPPORTUNITY_TYPES))
    .min(1, 'Pick at least one type, so Beacon knows what to look for.'),
  preferredRoles: z.array(z.string().trim().min(1).max(80)).max(5, 'Pick up to 5 roles.'),
  remotePref: z.enum(REMOTE_PREFS),
  preferredLocations: z.array(z.string().trim().min(1).max(120)).max(20, 'Pick up to 20 places.'),
  openToRelocate: z.boolean(),
  gradYear: z
    .number({ error: 'Add your graduation year.' })
    .int('Add your graduation year.')
    .min(1950, 'Add your graduation year.')
    .max(currentYear + 10, `Graduation year must be ${currentYear + 10} or earlier.`)
    .nullable()
    .refine((v): v is number => v !== null, 'Add your graduation year.'),
  degreeLevel: z.enum(DEGREE_LEVELS),
  stipendAmount: z.number().min(0).max(10_000_000),
  stipendCurrency: z.enum(['INR', 'USD']),
  authorisedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20),
  languages: z.array(z.string().trim().min(1).max(60)).max(20),
  experienceYears: z.number().min(0).max(60),
});

export type PreferencesFormInput = z.input<typeof preferencesFormSchema>;
export type PreferencesFormValues = z.output<typeof preferencesFormSchema>;

/** Defaults: stored preferences when present, else the USERFLOW §1.5 prefills from the resume. */
export function defaultPreferences(draft: ProfileDraft, now: Date = new Date()): PreferencesFormInput {
  const edu = primaryEducation(draft);
  const gradYear = edu?.gradYear ?? null;
  const stillStudying = gradYear !== null && gradYear >= now.getFullYear() + 1;
  const types: OpportunityType[] =
    draft.opportunityTypes.length > 0
      ? [...draft.opportunityTypes]
      : gradYear === null || stillStudying
        ? ['internship', 'hackathon']
        : ['fulltime', 'internship'];
  const floor = draft.stipendFloor;
  const currency: StipendCurrency = floor?.currency === 'USD' ? 'USD' : 'INR';
  return {
    opportunityTypes: types,
    preferredRoles:
      draft.preferredRoles.length > 0 ? draft.preferredRoles.slice(0, 5) : suggestRoles(draft.skills),
    remotePref: remoteChoiceOf(draft.remotePref),
    preferredLocations: [...draft.preferredLocations],
    openToRelocate: draft.openToRelocate,
    gradYear,
    degreeLevel: edu?.degreeLevel ?? 'bachelor',
    stipendAmount: floor && floor.period === 'month' ? floor.amount : 0,
    stipendCurrency: currency,
    authorisedCountries:
      draft.workAuth.authorisedCountries.length > 0 ? [...draft.workAuth.authorisedCountries] : ['IN'],
    languages: draft.languages.map((l) => l.name),
    experienceYears: draft.experienceYears,
  };
}

/** Maps validated form values to a profile PATCH (plus the education entry carrying the grad year). */
export function preferencesPatch(values: PreferencesFormValues, draft: ProfileDraft): ProfilePatch {
  const withEducation = editEducation(draft, {
    gradYear: values.gradYear,
    degreeLevel: values.degreeLevel,
  });
  const existingLanguages = new Map(draft.languages.map((l) => [l.name.toLowerCase(), l]));
  return {
    opportunityTypes: values.opportunityTypes,
    preferredRoles: values.preferredRoles,
    remotePref: values.remotePref,
    preferredLocations: values.preferredLocations,
    openToRelocate: values.openToRelocate,
    education: withEducation.education,
    stipendFloor:
      values.stipendAmount > 0
        ? { amount: values.stipendAmount, currency: values.stipendCurrency, period: 'month' }
        : null,
    workAuth: {
      ...draft.workAuth,
      authorisedCountries: values.authorisedCountries,
    },
    languages: values.languages.map(
      (name) => existingLanguages.get(name.toLowerCase()) ?? { name, proficiency: 'professional' },
    ),
    experienceYears: values.experienceYears,
  };
}

/** Query for the live "≈ N open listings match so far" counter (GET /v1/feed, `total` on page 1). */
export function matchCountQuery(values: PreferencesFormInput): Record<string, string> {
  const q: Record<string, string> = { limit: '1' };
  if (values.opportunityTypes.length > 0) q.types = values.opportunityTypes.join(',');
  if (values.remotePref === 'remote_only') q.remote = 'remote';
  const cities = values.preferredLocations.filter(
    (l) => !(SPECIAL_LOCATIONS as readonly string[]).includes(l),
  );
  if (cities.length > 0 && values.remotePref !== 'remote_only') q.locations = cities.join(',');
  if (values.stipendAmount > 0) {
    q.minStipend = String(values.stipendAmount);
    q.stipendCurrency = values.stipendCurrency;
  }
  if (typeof values.gradYear === 'number') q.gradYear = String(values.gradYear);
  return q;
}
