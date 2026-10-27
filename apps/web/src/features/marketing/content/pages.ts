/**
 * Every public page in one table: the route (src/routes/public.tsx), the prerendered file and its
 * <title>/description (scripts/prerender.mjs via `prerenderPages`), the runtime <head> tags (`Seo`)
 * and the sitemap (public/sitemap.xml, checked against this list by `facts.test.ts`) all read it.
 */
export interface PublicPage {
  path: string;
  /** Short name: nav label and `handle.title` ("Pricing · Beacon"); null = the brand title. */
  title: string | null;
  /** Meta description: one or two plain sentences, ≤ 160 characters. */
  description: string;
  /** Output file inside dist/ (`foo.html` is served at `/foo`). */
  file: string;
}

export const SITE_TITLE = 'Beacon · Every opportunity that fits you';

export const PUBLIC_PAGES = {
  home: {
    path: '/',
    title: null,
    file: 'index.html',
    description:
      'Beacon watches internships, jobs, hackathons and scholarships for students in tech, and ranks each one against your resume with the working shown. Free.',
  },
  features: {
    path: '/features',
    title: 'Features',
    file: 'features.html',
    description:
      'A radar ranked by explainable fit, a deadline timeline, ghost-listing flags, push alerts on your rules and a tracker that nudges you to follow up.',
  },
  howItWorks: {
    path: '/how-it-works',
    title: 'How it works',
    file: 'how-it-works.html',
    description:
      'How Beacon reads 338 sources through the cheapest path first, scores every listing with a formula you can see and change, and works with AI switched off.',
  },
  sources: {
    path: '/packs',
    title: 'Sources',
    file: 'packs.html',
    description:
      'Every company career page, hackathon calendar and scholarship list Beacon watches: 338 verified sources in 7 packs, searchable, with how each one is read.',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing',
    file: 'pricing.html',
    description:
      'Beacon is free, with no paid tier and no paywall on alerts. Use the built-in AI, bring your own key, or switch AI off. Open source and self-hostable.',
  },
  about: {
    path: '/about',
    title: 'About',
    file: 'about.html',
    description:
      'Why Beacon exists, the principles it is built on, and who it is for: students in tech who want fewer tabs and better applications.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy',
    file: 'privacy.html',
    description:
      'What Beacon stores, where it lives, what is sent to an AI provider and how to export or delete everything. Plain language, no tracking.',
  },
  terms: {
    path: '/terms',
    title: 'Terms',
    file: 'terms.html',
    description:
      'Short, plain terms for a free, open-source tool that helps students find and track opportunities.',
  },
} as const satisfies Record<string, PublicPage>;

export type PublicPageKey = keyof typeof PUBLIC_PAGES;

export const PUBLIC_PAGE_LIST: readonly PublicPage[] = Object.values(PUBLIC_PAGES);

/** Document title exactly as RootLayout writes it ("Pricing · Beacon"). */
export function documentTitle(page: PublicPage): string {
  return page.title ? `${page.title} · Beacon` : SITE_TITLE;
}
