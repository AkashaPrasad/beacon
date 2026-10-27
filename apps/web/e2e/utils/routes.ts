/**
 * Route table for the QA specs: path → the page-root testid that proves the screen mounted,
 * and whether it needs a session. Keep it in step with docs/WEB.md (web-foundation).
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { pendingReason, type TestId } from './testids';

export interface AppRoute {
  name: string;
  path: string;
  pageId: TestId;
  auth: 'public' | 'user';
  /** For signed-in routes: the onboarding state the user must be in. */
  onboarding?: 'consent' | 'done';
}

export const ROUTES: readonly AppRoute[] = [
  { name: 'landing', path: '/', pageId: 'landing-page', auth: 'public' },
  { name: 'login', path: '/login', pageId: 'login-page', auth: 'public' },
  {
    name: 'consent',
    path: '/welcome',
    pageId: 'consent-page',
    auth: 'user',
    onboarding: 'consent',
  },
  { name: 'radar', path: '/radar', pageId: 'radar-page', auth: 'user', onboarding: 'done' },
  {
    name: 'deadlines',
    path: '/deadlines',
    pageId: 'deadlines-page',
    auth: 'user',
    onboarding: 'done',
  },
  { name: 'tracker', path: '/tracker', pageId: 'tracker-page', auth: 'user', onboarding: 'done' },
  { name: 'sources', path: '/sources', pageId: 'sources-page', auth: 'user', onboarding: 'done' },
  { name: 'alerts', path: '/alerts', pageId: 'alerts-page', auth: 'user', onboarding: 'done' },
  { name: 'profile', path: '/profile', pageId: 'profile-page', auth: 'user', onboarding: 'done' },
  {
    name: 'notifications',
    path: '/notifications',
    pageId: 'notifications-page',
    auth: 'user',
    onboarding: 'done',
  },
  {
    name: 'settings',
    path: '/settings/appearance',
    pageId: 'settings-page',
    auth: 'user',
    onboarding: 'done',
  },
  {
    name: 'not-found',
    path: '/this-route-does-not-exist',
    pageId: 'not-found-page',
    auth: 'public',
  },
];

export function route(name: string): AppRoute {
  const r = ROUTES.find((x) => x.name === name);
  if (!r) throw new Error(`unknown route ${name}`);
  return r;
}

export const byTestId = (page: Page, id: TestId): Locator => page.getByTestId(id);

/** Skip reason when the route's page root has not landed in apps/web/src yet. */
export function routePending(r: AppRoute, extra: readonly TestId[] = []): string | null {
  return pendingReason([r.pageId, ...extra]);
}

/** Navigate and wait for the page root (not for network idle: the feed streams). */
export async function open(
  page: Page,
  r: AppRoute | string,
  opts: { query?: string } = {},
): Promise<void> {
  const target = typeof r === 'string' ? route(r) : r;
  await page.goto(target.path + (opts.query ?? ''));
  await expect(
    byTestId(page, target.pageId),
    `${target.path} did not render [data-testid=${target.pageId}]`,
  ).toBeVisible({
    timeout: 15_000,
  });
}
