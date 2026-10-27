/**
 * Public (marketing) routes — the one file the marketing-site agent edits to add pages.
 *
 * The router (src/app/routes.tsx) spreads `publicRoutes` at the top level, inside the root layout
 * (document title from `handle.title`, toasts, scroll restoration, route error boundary). Rules:
 * - Anything for anonymous visitors only (signed-in visitors are sent into the app) goes under the
 *   `<PublicOnly />` element; pages everyone can read (policy, about…) go beside it.
 * - Prefer `lazy: () => import('…')` for everything except `/`; a lazy module exports `Component`
 *   (and optionally `handle`). Lazy pages can still be prerendered: list them in `prerenderPages`.
 * - Rendered on the server at build time: no window/document/storage access during render (effects
 *   only), client-only UI behind `useHydrated()`. See docs/WEB.md §8.
 * The app's own public routes (`/login`, `/auth/callback`) and the 404 stay in src/app/routes.tsx.
 */
import type { RouteObject } from 'react-router';

import { PublicOnly } from '@/app/guards';
import { RouteError } from '@/app/RouteError';
import { LandingScreen } from '@/features/landing/LandingScreen';
import { PUBLIC_PAGE_LIST, PUBLIC_PAGES, documentTitle } from '@/features/marketing/content/pages';

const errorElement = <RouteError />;

export const publicRoutes: RouteObject[] = [
  {
    element: <PublicOnly />,
    errorElement,
    children: [{ index: true, element: <LandingScreen />, handle: { title: null } }],
  },
  {
    path: PUBLIC_PAGES.features.path.slice(1),
    lazy: () => import('@/features/marketing/pages/FeaturesPage'),
    handle: { title: PUBLIC_PAGES.features.title },
    errorElement,
  },
  {
    path: PUBLIC_PAGES.howItWorks.path.slice(1),
    lazy: () => import('@/features/marketing/pages/HowItWorksPage'),
    handle: { title: PUBLIC_PAGES.howItWorks.title },
    errorElement,
  },
  {
    path: PUBLIC_PAGES.sources.path.slice(1),
    lazy: () => import('@/features/marketing/pages/SourcesPage'),
    handle: { title: PUBLIC_PAGES.sources.title },
    errorElement,
  },
  {
    path: PUBLIC_PAGES.pricing.path.slice(1),
    lazy: () => import('@/features/marketing/pages/PricingPage'),
    handle: { title: PUBLIC_PAGES.pricing.title },
    errorElement,
  },
  {
    path: PUBLIC_PAGES.about.path.slice(1),
    lazy: () => import('@/features/marketing/pages/AboutPage'),
    handle: { title: PUBLIC_PAGES.about.title },
    errorElement,
  },
  {
    path: 'privacy',
    lazy: () => import('@/features/legal/PrivacyScreen'),
    handle: { title: PUBLIC_PAGES.privacy.title },
    errorElement,
  },
  {
    path: 'terms',
    lazy: () => import('@/features/legal/TermsScreen'),
    handle: { title: PUBLIC_PAGES.terms.title },
    errorElement,
  },
];

export interface PrerenderPage {
  /** URL path rendered (and the value of `data-prerendered` on #root). */
  path: string;
  /** Output file inside dist/ (`foo.html` is served at `/foo` by Cloudflare Pages and vite preview). */
  file: string;
  /** Document title (otherwise index.html's). */
  title?: string;
  /** Meta description (otherwise index.html's). */
  description?: string;
}

/** Public pages written as static HTML at build time (scripts/prerender.mjs). */
export const prerenderPages: PrerenderPage[] = PUBLIC_PAGE_LIST.map((page) => ({
  path: page.path,
  file: page.file,
  ...(page.title ? { title: documentTitle(page) } : {}),
  description: page.description,
}));
