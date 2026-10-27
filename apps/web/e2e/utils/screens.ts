/**
 * Every screen the MSW-mode suites visit (`smoke-all`, `a11y`): how to reach it and what proves
 * it rendered. Detail pages (`/radar/:id`, `/tracker/:id`, `/sources/:id`, `/sources/packs/:id`,
 * `/alerts/:id`) are reached by clicking the first item of their list, so the ids always match
 * the mock data. Keep in step with `apps/web/src/app/routes.tsx` and `src/routes/public.tsx`.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import type { MockScenario } from './auth';

export interface Screen {
  name: string;
  /** URL to load (list screens) or the list to open the first item from (detail screens). */
  path: string;
  /** Page-root testid. */
  pageId: string;
  /** MSW scenario the tab starts in. `signed-out` = anonymous visitor. */
  scenario: MockScenario;
  /** Detail page: the element to click on `path` to reach it, and the URL it must land on. */
  open?: { item: (page: Page) => Locator; url: RegExp };
  /** Wait for real content (not skeletons) before checking. */
  ready?: (page: Page) => Locator;
}

const firstRadarRow = (p: Page) =>
  p.getByTestId('radar-card').or(p.getByTestId('radar-row')).first();

export const SCREENS: readonly Screen[] = [
  // Public
  { name: 'landing', path: '/', pageId: 'landing-page', scenario: 'signed-out' },
  { name: 'features', path: '/features', pageId: 'features-page', scenario: 'signed-out' },
  {
    name: 'how-it-works',
    path: '/how-it-works',
    pageId: 'how-it-works-page',
    scenario: 'signed-out',
  },
  {
    name: 'source-directory',
    path: '/packs',
    pageId: 'sources-directory-page',
    scenario: 'signed-out',
  },
  { name: 'pricing', path: '/pricing', pageId: 'pricing-page', scenario: 'signed-out' },
  { name: 'about', path: '/about', pageId: 'about-page', scenario: 'signed-out' },
  { name: 'privacy', path: '/privacy', pageId: 'privacy-page', scenario: 'signed-out' },
  { name: 'terms', path: '/terms', pageId: 'terms-page', scenario: 'signed-out' },
  { name: 'login', path: '/login', pageId: 'login-page', scenario: 'signed-out' },
  {
    name: 'not-found',
    path: '/this-route-does-not-exist',
    pageId: 'not-found-page',
    scenario: 'signed-out',
  },
  // First run
  { name: 'welcome', path: '/welcome', pageId: 'consent-page', scenario: 'consent' },
  // Signed in
  {
    name: 'radar',
    path: '/radar',
    pageId: 'radar-page',
    scenario: 'returning',
    ready: (p) => p.getByTestId('radar-card').or(p.getByTestId('radar-row')).first(),
  },
  {
    name: 'listing',
    path: '/radar',
    pageId: 'listing-page',
    scenario: 'returning',
    open: { item: firstRadarRow, url: /\/radar\/[^/]+$/ },
    ready: (p) => p.getByTestId('listing-drawer-title').first(),
  },
  { name: 'deadlines', path: '/deadlines', pageId: 'deadlines-page', scenario: 'returning' },
  {
    name: 'sources',
    path: '/sources',
    pageId: 'sources-page',
    scenario: 'returning',
    ready: (p) => p.getByTestId('source-row').first(),
  },
  {
    name: 'source',
    path: '/sources',
    pageId: 'source-page',
    scenario: 'returning',
    open: {
      item: (p) => p.getByTestId('source-row').first().getByRole('link').first(),
      url: /\/sources\/(?!packs)[^/]+$/,
    },
  },
  {
    name: 'packs',
    path: '/sources/packs',
    pageId: 'sources-page',
    scenario: 'returning',
  },
  {
    name: 'pack',
    path: '/sources/packs',
    pageId: 'pack-page',
    scenario: 'returning',
    open: {
      item: (p) => p.locator('a[href^="/sources/packs/"]').first(),
      url: /\/sources\/packs\/[^/]+$/,
    },
  },
  {
    name: 'alerts',
    path: '/alerts',
    pageId: 'alerts-page',
    scenario: 'returning',
    ready: (p) => p.getByTestId('alerts-rule').first(),
  },
  { name: 'alert-new', path: '/alerts/new', pageId: 'alert-editor-page', scenario: 'returning' },
  {
    name: 'alert-edit',
    path: '/alerts',
    pageId: 'alert-editor-page',
    scenario: 'returning',
    open: {
      item: (p) => p.locator('[data-testid="alerts-rule"] a[href^="/alerts/"]').first(),
      url: /\/alerts\/(?!new)[^/]+$/,
    },
  },
  {
    name: 'tracker',
    path: '/tracker',
    pageId: 'tracker-page',
    scenario: 'returning',
    ready: (p) => p.getByTestId('tracker-card').first(),
  },
  {
    name: 'tracker-item',
    path: '/tracker',
    pageId: 'tracker-item-page',
    scenario: 'returning',
    open: { item: (p) => p.getByTestId('tracker-card').first(), url: /\/tracker\/[^/]+$/ },
  },
  { name: 'profile', path: '/profile', pageId: 'profile-page', scenario: 'returning' },
  {
    name: 'settings-appearance',
    path: '/settings/appearance',
    pageId: 'settings-page',
    scenario: 'returning',
  },
  { name: 'settings-ai', path: '/settings/ai', pageId: 'settings-page', scenario: 'returning' },
  {
    name: 'settings-notifications',
    path: '/settings/notifications',
    pageId: 'settings-page',
    scenario: 'returning',
  },
  {
    name: 'settings-privacy',
    path: '/settings/privacy',
    pageId: 'settings-page',
    scenario: 'returning',
  },
  {
    name: 'notifications',
    path: '/notifications',
    pageId: 'notifications-page',
    scenario: 'returning',
    ready: (p) => p.getByTestId('notifications-item').first(),
  },
  {
    name: 'admin',
    path: '/admin',
    pageId: 'admin-page',
    scenario: 'admin',
    ready: (p) => p.getByTestId('admin-queues'),
  },
];

/**
 * Wait until a screen has settled: its `ready` element (if any), no skeleton or busy region
 * left (capped, so a perpetual spinner is reported by the checks rather than hanging), and a
 * short pause for entrance motion (reduced motion makes it near-instant).
 */
export async function settle(page: Page, ready?: Locator): Promise<void> {
  if (ready) await expect(ready, 'screen content never appeared').toBeVisible({ timeout: 20_000 });
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid$="-skeleton"], [aria-busy="true"]:not(button), .skeleton-shimmer',
        ).length === 0,
      undefined,
      { timeout: 6_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(350);
}

/**
 * Client-side navigation (history.pushState + popstate, which React Router follows), the way a
 * student moves around the app: it keeps MSW's in-page state (the source just added, the card
 * just moved). The first call in a tab is a real page load.
 */
export async function visit(page: Page, path: string): Promise<void> {
  if (!/^https?:/.test(page.url())) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    return;
  }
  await page.evaluate((to) => {
    // The state shape React Router's browser history writes ({ usr, key, idx }), as a push.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    const key = Math.random().toString(36).slice(2, 10);
    window.history.pushState({ usr: null, key, idx: idx + 1 }, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
  }, path);
  const want = new URL(path, 'http://x').pathname;
  await page.waitForURL((u) => u.pathname === want || u.pathname.startsWith(`${want}/`));
}
