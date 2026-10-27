/**
 * Public-site constants: navigation, footer, links and the real numbers every page quotes.
 * The numbers come from seed/source-packs.json and seed/VERIFICATION.md (2026-10-27) and are checked
 * against the generated directory by `facts.test.ts`, so a seed change cannot leave a page lying.
 */

export const REPO_URL = 'https://github.com/AkashaPrasad/beacon';
export const ISSUES_URL = `${REPO_URL}/issues`;
export const API_DOCS_URL = 'https://api-beacon.spacesdrive.cc/docs';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const SELF_HOST_URL = `${REPO_URL}#running-locally`;

/** A prefilled GitHub issue asking for a new source in the shared packs. */
export function requestSourceUrl(name = '', url = ''): string {
  const params = new URLSearchParams({
    title: `Source request: ${name || '<company or programme>'}`,
    labels: 'source-request',
    body: [
      `Name: ${name}`,
      `Careers or listings page: ${url}`,
      'Kind (if known): Greenhouse / Lever / Ashby / SmartRecruiters / Workable / Workday / RSS / other',
      'Which pack it belongs in:',
      'Why students would want it:',
    ].join('\n'),
  });
  return `${ISSUES_URL}/new?${params.toString()}`;
}

export const CONTACT_URL = `${ISSUES_URL}/new?${new URLSearchParams({ title: 'Hello from the website' }).toString()}`;

/** Seed numbers (seed/VERIFICATION.md, verified 27 Oct 2026). */
export const SEED = {
  verifiedOn: '27 Oct 2026',
  sources: 338,
  packs: 7,
  /** Verified ATS JSON endpoints: free to poll, no credits. */
  atsFeeds: 222,
  publicApis: 5,
  rssFeeds: 21,
  crawled: 90,
  atsKinds: [
    { kind: 'Greenhouse', count: 85 },
    { kind: 'Ashby', count: 77 },
    { kind: 'Workday', count: 32 },
    { kind: 'Lever', count: 15 },
    { kind: 'SmartRecruiters', count: 12 },
    { kind: 'Workable', count: 1 },
  ],
  /** Companies probed for a public ATS endpoint while building the packs. */
  companiesProbed: 407,
  /** Postings all sources returned on the verification date, and how many had intern/graduate titles. */
  postings: 55060,
  internPostings: 19452,
} as const;

export const ATS_SHARE = Math.round((SEED.atsFeeds / SEED.sources) * 100);

export interface NavLink {
  to: string;
  label: string;
}

/** Primary navigation, in reading order. */
export const NAV_LINKS: readonly NavLink[] = [
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/packs', label: 'Sources' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
];

export interface FooterLink {
  label: string;
  /** Internal route (`/…`) or absolute URL (opens normally; GitHub links). */
  href: string;
}

export const FOOTER_COLUMNS: readonly { title: string; links: readonly FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Source directory', href: '/packs' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Sign in', href: '/login' },
    ],
  },
  {
    title: 'Open source',
    links: [
      { label: 'Source code', href: REPO_URL },
      { label: 'Self-host Beacon', href: SELF_HOST_URL },
      { label: 'API reference', href: API_DOCS_URL },
      { label: 'Request a source', href: requestSourceUrl() },
      { label: 'Report a problem', href: ISSUES_URL },
    ],
  },
  {
    title: 'Beacon',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Contact', href: CONTACT_URL },
    ],
  },
];

export const BRAND_LINE = 'Every opportunity that fits you. Nothing that doesn’t.';
