/**
 * axe on every route (SPEC §8: 0 serious/critical), in light, dark and compact density, plus
 * the overlays that only exist after interaction: detail drawer, command palette, shortcut
 * sheet, and the radar's empty and error states. Runs in every Playwright project (Chromium,
 * WebKit, iPhone 14).
 */
import type { Page } from '@playwright/test';

import { expectNoSeriousA11y } from './utils/a11y';
import { loginAs, signOut } from './utils/auth';
import { needs, test, expect } from './utils/fixtures';
import type { MockApi } from './utils/mock-api';
import { failNext, fixtureUsers, zeroMatches } from './utils/mock-data';
import { byTestId, open, ROUTES, type AppRoute } from './utils/routes';
import { openDrawerFor, PALETTE_SHORTCUT, rows, waitForRows } from './utils/ui';

type Variant = 'light' | 'dark' | 'compact';
const VARIANTS: readonly Variant[] = ['light', 'dark', 'compact'];

async function applyVariant(page: Page, api: MockApi, variant: Variant): Promise<void> {
  const appearance = {
    theme: variant === 'dark' ? 'dark' : 'light',
    density: variant === 'compact' ? 'compact' : 'comfortable',
  } as const;
  api.state.settings.appearance = { ...api.state.settings.appearance, ...appearance };
  await page.emulateMedia({ colorScheme: appearance.theme, reducedMotion: 'reduce' });
  await page.addInitScript((a) => {
    try {
      localStorage.setItem('beacon:appearance', JSON.stringify(a));
    } catch {
      /* ignore */
    }
  }, appearance);
}

async function prepare(page: Page, api: MockApi, r: AppRoute): Promise<void> {
  if (r.auth === 'public') signOut(api);
  else if (r.onboarding === 'consent') await loginAs(page, api, fixtureUsers.newbie);
}

/** Wait until the screen has real content, so axe sees the steady state, not skeletons. */
async function settle(page: Page, r: AppRoute): Promise<void> {
  if (r.name === 'radar') await waitForRows(page);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  // Let entrance transitions finish (reduced motion makes them near-instant).
  await page.waitForTimeout(300);
}

for (const variant of VARIANTS) {
  test.describe(`axe · ${variant}`, () => {
    for (const r of ROUTES) {
      test(`${r.name} (${r.path})`, async ({ page, api }, testInfo) => {
        needs(r.pageId);
        await prepare(page, api, r);
        await applyVariant(page, api, variant);
        await open(page, r);
        if (variant !== 'light') {
          const html = page.locator('html');
          if (variant === 'dark') await expect(html).toHaveAttribute('data-theme', 'dark');
          if (variant === 'compact') await expect(html).toHaveAttribute('data-density', 'compact');
        }
        await settle(page, r);
        await expectNoSeriousA11y(page, testInfo, `${r.name}-${variant}`);
      });
    }

    test('radar with the detail drawer open', async ({ page, api }, testInfo) => {
      needs('radar-page', 'radar-row', 'radar-row-title', 'listing-drawer');
      await applyVariant(page, api, variant);
      await open(page, 'radar');
      await waitForRows(page);
      await openDrawerFor(page, rows(page).first());
      await page.waitForTimeout(300);
      await expectNoSeriousA11y(page, testInfo, `drawer-${variant}`);
    });
  });
}

test.describe('axe · overlays and states', () => {
  test('command palette', async ({ page }, testInfo) => {
    needs('radar-page', 'command-palette', 'command-palette-input');
    await open(page, 'radar');
    await page.keyboard.press(PALETTE_SHORTCUT);
    await expect(byTestId(page, 'command-palette')).toBeVisible();
    await byTestId(page, 'command-palette-input').fill('intern');
    await page.waitForTimeout(300);
    await expectNoSeriousA11y(page, testInfo, 'palette');
  });

  test('shortcut sheet', async ({ page }, testInfo) => {
    needs('radar-page', 'shortcuts-sheet');
    await open(page, 'radar');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('?');
    await expect(byTestId(page, 'shortcuts-sheet')).toBeVisible();
    await expectNoSeriousA11y(page, testInfo, 'shortcuts');
  });

  test('radar empty state (0 matches)', async ({ page, api }, testInfo) => {
    needs('radar-page', 'radar-empty');
    zeroMatches(api.state);
    await open(page, 'radar');
    await expect(byTestId(page, 'radar-empty')).toBeVisible();
    await expectNoSeriousA11y(page, testInfo, 'radar-empty');
  });

  test('radar error state', async ({ page, api }, testInfo) => {
    needs('radar-page', 'radar-error');
    failNext(api.state, 'GET /v1/feed', 500, 10);
    await open(page, 'radar');
    await expect(byTestId(page, 'radar-error')).toBeVisible({ timeout: 20_000 });
    await expectNoSeriousA11y(page, testInfo, 'radar-error');
  });

  test('offline banner', async ({ page, context, api }, testInfo) => {
    needs('radar-page', 'offline-banner');
    await open(page, 'radar');
    api.offline = true;
    await context.setOffline(true);
    await expect(byTestId(page, 'offline-banner')).toBeVisible();
    await expectNoSeriousA11y(page, testInfo, 'offline');
    api.offline = false;
    await context.setOffline(false);
  });
});
