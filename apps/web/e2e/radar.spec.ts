/**
 * Radar happy path (web-radar): the ranked feed with the 66-listing radar fixture set (shared
 * fixtures + edge cases), filters into the request, keyboard triage (j/k, s, h + undo), the drawer by
 * URL with prev/next and Esc, the three views, phone swipe-to-save, and axe in light and dark.
 *
 * Transport: the QA fake API (`e2e/utils/fixtures`, page.route, signed in as the default user);
 * the feed is replaced with the same listings the MSW mock serves under `VITE_MOCK_API=1`.
 */
import { buildDefaultListings } from '../src/features/radar/mocks/fixtures';

import { expectNoSeriousA11y } from './utils/a11y';
import { expect, test } from './utils/fixtures';
import type { MockApi } from './utils/mock-api';
import { setFeed } from './utils/mock-data';
import { byTestId, open } from './utils/routes';
import { activeRow, rows, waitForRows } from './utils/ui';

function seed(api: MockApi) {
  setFeed(api.state, buildDefaultListings(Date.now()));
}

const isPhone = (width: number) => width < 768;

test.describe('radar', () => {
  test.beforeEach(async ({ page, api }) => {
    seed(api);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('feed, filters, keyboard triage with undo, views', async ({ page, api }, testInfo) => {
    await open(page, 'radar');
    await waitForRows(page, 5);
    await expect(byTestId(page, 'radar-total')).toContainText(/\d+ fits?/);
    // Virtualised: a 66-row list mounts only what is near the viewport.
    expect(await rows(page).count()).toBeLessThan(40);

    const width = page.viewportSize()?.width ?? 1280;
    if (!isPhone(width)) {
      // Filters → URL → request (the server does the filtering).
      const rail = width >= 1024 ? byTestId(page, 'radar-filter-rail') : null;
      if (!rail) await byTestId(page, 'radar-filters-button').click();
      await byTestId(page, 'radar-filter-type-hackathon').first().click();
      await expect(page).toHaveURL(/types=hackathon/);
      await expect
        .poll(() => api.calls('GET', '/v1/feed').some((r) => r.query.types === 'hackathon'))
        .toBe(true);
      if (!rail) await page.keyboard.press('Escape');
      await page.goto('/radar');
      await waitForRows(page, 5);
    }

    // Keyboard triage: the feed is one tab stop; j/k move the cursor.
    await rows(page).first().focus();
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    const second = await activeRow(page).getAttribute('data-listing-id');
    await page.keyboard.press('k');
    const first = (await activeRow(page).getAttribute('data-listing-id'))!;
    expect(first).not.toBe(second);

    await page.keyboard.press('s');
    await expect(activeRow(page)).toHaveAttribute('data-saved', 'true');
    await expect.poll(() => api.calls('POST', `/v1/listings/${first}/save`).length).toBe(1);

    await page.keyboard.press('h');
    await expect.poll(() => api.calls('POST', `/v1/listings/${first}/hide`).length).toBe(1);
    await expect(page.locator(`[data-testid="radar-row"][data-listing-id="${first}"]`)).toHaveCount(0);
    await expect(page.getByText(/^Hidden/).first()).toBeVisible();
    await page.keyboard.press('u');
    await expect.poll(() => api.calls('POST', `/v1/listings/${first}/unhide`).length).toBe(1);
    await expect(page.locator(`[data-testid="radar-row"][data-listing-id="${first}"]`)).toHaveCount(1);

    // Views: 3 board, 2 timeline, 1 list.
    await page.keyboard.press('3');
    await expect(byTestId(page, 'radar-board')).toBeVisible();
    await expect(page).toHaveURL(/view=board/);
    await page.keyboard.press('2');
    await expect(byTestId(page, 'deadlines-timeline')).toBeVisible();
    await page.keyboard.press('1');
    await expect(byTestId(page, 'radar-feed')).toBeVisible();

    await expectNoSeriousA11y(page, testInfo, 'radar-feed');
  });

  test('drawer by URL: breakdown, explain, prev/next, Esc', async ({ page }, testInfo) => {
    await open(page, 'radar');
    await waitForRows(page, 3);
    const ids = await rows(page).evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute('data-listing-id')!));

    await page.goto(`/radar/${ids[0]}`);
    const drawer = byTestId(page, 'listing-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('listing-drawer-title')).not.toHaveText(/Loading/);
    await expect(drawer.getByTestId('drawer-fit-breakdown')).toBeVisible();
    await expect(drawer.getByTestId('drawer-fit-bar').first()).toBeAttached();
    await expect(drawer.getByTestId('drawer-why-chip').first()).toBeVisible();
    await expect(drawer.getByTestId('drawer-apply')).toBeVisible();

    // Next listing (drawer scope): j, or → on desktop.
    await drawer.getByTestId('listing-drawer-title').focus();
    await page.keyboard.press('j');
    await expect(page).toHaveURL(new RegExp(`/radar/${ids[1]}`));
    await page.keyboard.press('k');
    await expect(page).toHaveURL(new RegExp(`/radar/${ids[0]}`));

    await expectNoSeriousA11y(page, testInfo, 'radar-drawer');

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/radar(\?|$)/);
  });

  test('dark mode renders the feed and drawer accessibly', async ({ page, api }, testInfo) => {
    api.state.settings.appearance = { ...api.state.settings.appearance, theme: 'dark' };
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('beacon:appearance', JSON.stringify({ theme: 'dark' }));
      } catch {
        /* ignore */
      }
    });
    await open(page, 'radar');
    await waitForRows(page, 3);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await rows(page).first().getByTestId('radar-row-title').click();
    await expect(byTestId(page, 'listing-drawer')).toBeVisible();
    await expectNoSeriousA11y(page, testInfo, 'radar-dark');
  });

  test('phone: swipe right saves with an undo toast', async ({ page, api }) => {
    const width = page.viewportSize()?.width ?? 1280;
    test.skip(!isPhone(width), 'swipe rows are a phone gesture');
    await open(page, 'radar');
    await waitForRows(page, 3);
    const row = rows(page).first();
    const id = (await row.getAttribute('data-listing-id'))!;
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 24, y);
    await page.mouse.down();
    for (let x = 24; x <= box.width * 0.85; x += 24) await page.mouse.move(box.x + x, y);
    await page.mouse.up();
    await expect.poll(() => api.calls('POST', `/v1/listings/${id}/save`).length).toBe(1);
    await expect(page.getByText(/^Saved/).first()).toBeVisible();
  });
});
