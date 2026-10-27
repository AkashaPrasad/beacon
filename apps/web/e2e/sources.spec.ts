/**
 * Sources (UX restructure §2 Sources, USERFLOW §5.1): the list (headline, the "Add a source" hero
 * with live detection, the Details table), the full-page SourcePage (/sources/:id: health, recent
 * checks, settings, refresh, delete with Undo, Back to the same row) and PackPage
 * (/sources/packs/:id: what's in it, the switch), axe on each in light and dark, and a smoke run of
 * the same flows against the dev MSW handlers (src/mocks/handlers/sources.ts).
 *
 * The first groups use the QA Playwright-side fake API (`./utils/fixtures`); the MSW group lets the
 * app's own service worker answer. Runs on chromium, webkit and iPhone 14 (`mobile`).
 */
import { test as base, type Page } from '@playwright/test';

import { expectNoSeriousA11y } from './utils/a11y';
import { expect, test } from './utils/fixtures';
import type { MockApi } from './utils/mock-api';
import { detectOk, normaliseInputUrl } from './utils/mock-data';
import { open } from './utils/routes';

/**
 * The shell's own controls are covered by the QA a11y spec; these scans cover what the Sources
 * screens render.
 */
const SHELL = ['[data-testid="global-search"]', '[data-testid="user-menu"]'];

const tid = (page: Page, id: string) => page.getByTestId(id);
const rows = (page: Page) => page.getByTestId('source-row');
const detectLine = (page: Page) => page.getByTestId('source-detect-result');

const STRIPE = 'https://boards.greenhouse.io/stripe';

function stubStripe(api: MockApi) {
  api.state.detect.set(
    normaliseInputUrl(STRIPE),
    detectOk(STRIPE, 'greenhouse', 'stripe', 'Stripe', 142),
  );
}

/** `GET /v1/sources/:id/runs` is requested from the API (SHARED-REQUESTS); stub it for the page. */
async function stubRuns(page: Page) {
  await page.route(/\/v1\/sources\/[^/]+\/runs/, async (route) => {
    const at = Date.now();
    await route.fulfill({
      json: {
        items: [
          {
            id: 'r1',
            sourceId: 'x',
            reason: 'scheduled',
            status: 'ok',
            startedAt: new Date(at - 2 * 3_600_000).toISOString(),
            finishedAt: null,
            durationMs: 840,
            found: 14,
            new: 3,
            updated: 1,
            unchanged: 10,
            errors: [],
            backend: null,
            creditsUsed: 0,
          },
          {
            id: 'r2',
            sourceId: 'x',
            reason: 'scheduled',
            status: 'not_modified',
            startedAt: new Date(at - 8 * 3_600_000).toISOString(),
            finishedAt: null,
            durationMs: 310,
            found: 11,
            new: 0,
            updated: 0,
            unchanged: 11,
            errors: [],
            backend: null,
            creditsUsed: 0,
          },
          {
            id: 'r3',
            sourceId: 'x',
            reason: 'manual',
            status: 'error',
            startedAt: new Date(at - 30 * 3_600_000).toISOString(),
            finishedAt: null,
            durationMs: 10_000,
            found: 0,
            new: 0,
            updated: 0,
            unchanged: 0,
            errors: [{ kind: 'network', message: 'The page timed out.' }],
            backend: null,
            creditsUsed: 0,
          },
        ],
      },
    });
  });
}

const settle = async (page: Page) => {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(300);
};

async function useDark(page: Page, api: MockApi) {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  api.state.settings.appearance = { ...api.state.settings.appearance, theme: 'dark' };
  await page.addInitScript(() => {
    try {
      localStorage.setItem('beacon:appearance', JSON.stringify({ theme: 'dark' }));
    } catch {
      /* storage blocked: the media query still selects dark */
    }
  });
}

test.describe('sources list', () => {
  test('headline, then add a source from the hero: live detection, row at the top', async ({
    page,
    api,
  }) => {
    stubStripe(api);
    await open(page, 'sources');
    await expect(tid(page, 'sources-headline')).toContainText(/watching\s+\d+\s+source/i);
    await expect(rows(page).first()).toBeVisible();
    await expect(tid(page, 'credit-meter')).toContainText(/312\s*\/\s*500/);

    await tid(page, 'sources-add-button').click();
    const form = tid(page, 'source-add-dialog');
    await expect(form).toBeVisible();
    await expect(tid(page, 'source-add-url')).toBeFocused();
    await tid(page, 'source-add-url').fill(STRIPE);
    await expect(detectLine(page)).toContainText(/Detected:.*Greenhouse board.*stripe.*142 jobs/);
    await expect(page.getByRole('list', { name: 'Preview' }).getByRole('listitem')).toHaveCount(3);
    await tid(page, 'source-add-submit').click();

    await expect(form).toHaveCount(0);
    await expect(tid(page, 'sources-add-button')).toBeVisible();
    await expect(rows(page).first()).toContainText('Stripe careers');
    await expect
      .poll(() => api.calls('POST', '/v1/sources').filter((r) => r.status === 201).length)
      .toBe(1);
    expect(api.calls('POST', '/v1/sources')[0]?.body).toMatchObject({
      url: STRIPE,
      kind: 'greenhouse',
      boardToken: 'stripe',
      refreshInterval: '6h',
    });
    await expect(page.getByText('Added Stripe careers. Checking it now.')).toBeVisible();
  });

  test('Esc folds the add form away; pasting a link on the page opens it prefilled', async ({
    page,
    api,
  }) => {
    stubStripe(api);
    await open(page, 'sources');
    await tid(page, 'sources-add-button').click();
    await expect(tid(page, 'source-add-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tid(page, 'source-add-dialog')).toHaveCount(0);

    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.evaluate((url) => {
      const data = new DataTransfer();
      data.setData('text', url);
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
      );
    }, STRIPE);
    await expect(tid(page, 'source-add-url')).toHaveValue(STRIPE);
    await expect(detectLine(page)).toContainText('Detected:');
  });

  test('Details shows the full table (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The details table is a desktop view; phones keep the card list.');
    await open(page, 'sources');
    await expect(tid(page, 'sources-table')).toHaveAttribute('data-view', 'simple');
    await tid(page, 'sources-details-toggle').click();
    await expect(tid(page, 'sources-table')).toHaveAttribute('data-view', 'details');
    await expect(page.getByRole('columnheader', { name: /Last check/ })).toBeVisible();
    await page.keyboard.press('d');
    await expect(tid(page, 'sources-table')).toHaveAttribute('data-view', 'simple');
  });
});

test.describe('source page', () => {
  test('opens as a full page with health, recent checks and settings; Back lands on the same row', async ({
    page,
    api,
  }) => {
    await stubRuns(page);
    const src = api.state.sources[0]!;
    await open(page, 'sources');
    const row = page.locator(`[data-testid="source-row"][data-source-id="${src.id}"]`);
    await row.getByRole('link', { name: new RegExp(src.name) }).click();

    await expect(page).toHaveURL(new RegExp(`/sources/${src.id}$`));
    const view = tid(page, 'source-page');
    await expect(view).toBeVisible();
    await expect(view.getByRole('heading', { level: 1, name: src.name })).toBeVisible();
    await expect(tid(page, 'source-health')).toHaveAttribute('data-status', 'ok');
    const runs = tid(page, 'source-runs');
    await expect(runs.getByRole('listitem')).toHaveCount(3);
    await expect(runs).toContainText('Found 3 new');
    await expect(runs).toContainText('Failed: The page timed out.');

    // Settings save on change.
    await tid(page, 'source-interval').click();
    await page.getByRole('option', { name: 'Daily' }).click();
    await expect
      .poll(() => api.calls('PATCH', `/v1/sources/${src.id}`).at(-1)?.body)
      .toMatchObject({ refreshInterval: 'daily' });
    await tid(page, 'source-enabled').click();
    await expect
      .poll(() => api.calls('PATCH', `/v1/sources/${src.id}`).at(-1)?.body)
      .toMatchObject({ enabled: false });
    await expect(page.getByText(`Paused ${src.name}.`)).toBeVisible();

    await page.getByRole('link', { name: 'Back to Sources' }).click();
    await expect(tid(page, 'sources-page')).toBeVisible();
    await expect(row.getByRole('link', { name: new RegExp(src.name) })).toBeFocused();
  });

  test('Refresh now queues a check', async ({ page, api }) => {
    const src = api.state.sources[0]!;
    await page.goto(`/sources/${src.id}`);
    await tid(page, 'source-refresh').click();
    // The fake API has no refresh route: the client falls back to re-enabling (API §5 side effects).
    await expect.poll(() => api.calls('POST', `/v1/sources/${src.id}/refresh`).length).toBe(1);
    await expect(page.getByText(`Checking ${src.name} now.`)).toBeVisible();
  });

  test('delete from the page goes back to the list with Undo, and Undo keeps the source', async ({
    page,
    api,
  }) => {
    const src = api.state.sources[0]!;
    await open(page, 'sources');
    await page
      .locator(`[data-testid="source-row"][data-source-id="${src.id}"]`)
      .getByRole('link', { name: new RegExp(src.name) })
      .click();
    await expect(tid(page, 'source-page')).toBeVisible();
    await tid(page, 'source-delete').click();

    await expect(tid(page, 'sources-page')).toBeVisible();
    await expect(
      page.locator(`[data-testid="source-row"][data-source-id="${src.id}"]`),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(
      page.locator(`[data-testid="source-row"][data-source-id="${src.id}"]`),
    ).toHaveCount(1);
    await page.waitForTimeout(500);
    expect(api.calls('DELETE', `/v1/sources/${src.id}`)).toHaveLength(0);
  });

  test('an unknown id says so and links back', async ({ page }) => {
    await page.goto('/sources/650000000000000000000999');
    await expect(tid(page, 'source-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('This source isn’t here any more.')).toBeVisible();
    await page.getByRole('link', { name: 'Back to sources' }).click();
    await expect(tid(page, 'sources-page')).toBeVisible();
  });
});

test.describe('pack page', () => {
  test('a pack card opens its page; the switch turns it on; each source links to its page', async ({
    page,
    api,
  }) => {
    await open(page, 'sources', { query: '?tab=packs' });
    await expect(page).toHaveURL(/\/sources\/packs$/);
    const card = tid(page, 'sources-pack-faang-plus-india');
    await expect(card).toHaveAttribute('data-enabled', 'false');
    await card.getByRole('link', { name: /FAANG|Global/i }).click();

    await expect(page).toHaveURL(/\/sources\/packs\/faang-plus-india$/);
    const view = tid(page, 'pack-page');
    await expect(view).toBeVisible();
    await expect(tid(page, 'pack-sources').getByRole('listitem')).toHaveCount(3);
    await tid(page, 'pack-enabled').click();
    await expect
      .poll(() => api.calls('POST', '/v1/sources/packs/faang-plus-india/enable').length)
      .toBe(1);
    await expect(tid(page, 'pack-enabled')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('link', { name: 'Back to Packs' }).click();
    await expect(tid(page, 'sources-pack-faang-plus-india')).toHaveAttribute(
      'data-enabled',
      'true',
    );
  });

  test('turning a pack off offers Undo', async ({ page, api }) => {
    await page.goto('/sources/packs/top-indian-product');
    await expect(tid(page, 'pack-page')).toBeVisible({ timeout: 15_000 });
    await expect(tid(page, 'pack-enabled')).toHaveAttribute('aria-checked', 'true');
    await tid(page, 'pack-enabled').click();
    await expect(page.getByText(/Turned off/)).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect
      .poll(() => api.calls('POST', '/v1/sources/packs/top-indian-product/enable').length)
      .toBe(1);
  });
});

test.describe('sources accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe (${theme}): list, add form, packs, source page, pack page`, async ({
      page,
      api,
    }, testInfo) => {
      if (theme === 'dark') await useDark(page, api);
      else await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await stubRuns(page);
      stubStripe(api);

      await open(page, 'sources');
      if (theme === 'dark')
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(rows(page).first()).toBeVisible();
      await settle(page);
      await expectNoSeriousA11y(page, testInfo, `sources-${theme}`, { exclude: SHELL });

      await tid(page, 'sources-add-button').click();
      await tid(page, 'source-add-url').fill(STRIPE);
      await expect(detectLine(page)).toContainText('Detected:');
      await settle(page);
      await expectNoSeriousA11y(page, testInfo, `sources-add-${theme}`, { exclude: SHELL });
      await page.keyboard.press('Escape');

      await page.getByRole('tab', { name: /Packs/ }).click();
      await expect(tid(page, 'sources-pack-top-indian-product')).toBeVisible();
      await settle(page);
      await expectNoSeriousA11y(page, testInfo, `sources-packs-${theme}`, { exclude: SHELL });

      await page.goto(`/sources/${api.state.sources[0]!.id}`);
      await expect(tid(page, 'source-runs')).toBeVisible({ timeout: 15_000 });
      await settle(page);
      await expectNoSeriousA11y(page, testInfo, `source-page-${theme}`, { exclude: SHELL });

      await page.goto('/sources/packs/hackathons-india');
      await expect(tid(page, 'pack-sources')).toBeVisible({ timeout: 15_000 });
      await settle(page);
      await expectNoSeriousA11y(page, testInfo, `pack-page-${theme}`, { exclude: SHELL });
    });
  }
});

base.describe('sources on the dev mock API (MSW)', () => {
  base.use({ serviceWorkers: 'allow', locale: 'en-IN', timezoneId: 'Asia/Kolkata' });

  base('list → add → source page with recent checks → pack page', async ({ page }) => {
    await page.goto('/sources');
    await expect(tid(page, 'sources-page')).toBeVisible({ timeout: 15_000 });
    await expect(rows(page).first()).toBeVisible();
    await expect(tid(page, 'credit-meter')).toContainText(/\/\s*500/);

    await tid(page, 'sources-add-button').click();
    await tid(page, 'source-add-url').fill('jobs.lever.co/razorpay');
    await expect(detectLine(page)).toContainText(/Detected:.*Lever board.*razorpay/);
    await tid(page, 'source-add-submit').click();
    await expect(rows(page).first()).toContainText('Razorpay');

    // An existing, checked personal source: its page shows the recent checks from the MSW handler.
    const checked = page
      .locator('[data-testid="source-row"][data-scope="personal"][data-health="healthy"]')
      .first();
    await checked.getByRole('link').first().click();
    await expect(tid(page, 'source-page')).toBeVisible();
    await expect(tid(page, 'source-runs').getByRole('listitem').first()).toBeVisible();

    await page.goto('/sources/packs');
    const off = page.locator('[data-testid^="sources-pack-"][data-enabled="false"]').first();
    const packId = ((await off.getAttribute('data-testid')) ?? '').replace('sources-pack-', '');
    await off.getByRole('link').first().click();
    await expect(tid(page, 'pack-page')).toBeVisible();
    await expect(tid(page, 'pack-sources').getByRole('listitem').first()).toBeVisible();
    await tid(page, 'pack-enabled').click();
    await expect(tid(page, 'pack-enabled')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('link', { name: 'Back to Packs' }).click();
    await expect(tid(page, `sources-pack-${packId}`)).toHaveAttribute('data-enabled', 'true');
  });
});
