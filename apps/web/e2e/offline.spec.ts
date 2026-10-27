/**
 * Offline and degraded-network behaviour (USERFLOW §5.4, DESIGN copy #5 and #22):
 * - the offline strip appears and disappears with connectivity;
 * - actions taken offline apply optimistically, show a pending marker, and replay in order;
 * - a failed refresh keeps the cached rows with "Couldn't refresh…";
 * - with no cache, the full error offers Retry;
 * - slow networks show skeletons that resolve into rows.
 *
 * The PWA offline shell (service worker precache) is not covered here: the e2e server is a
 * `VITE_MOCK_API=1` build, where the only worker is MSW's. See docs/TESTING.md (gaps).
 */
import { needs, test, expect } from './utils/fixtures';
import { failNext } from './utils/mock-data';
import { goOffline, goOnline, supportsCdp, throttle } from './utils/network';
import { byTestId, open } from './utils/routes';
import { activeRow, rows, waitForRows } from './utils/ui';

test.describe('offline banner', () => {
  test('appears when the connection drops and disappears when it returns', async ({
    page,
    context,
    api,
  }) => {
    needs('radar-page', 'offline-banner', 'radar-row');
    await open(page, 'radar');
    await waitForRows(page);
    await expect(byTestId(page, 'offline-banner')).toHaveCount(0);

    await goOffline(context, api);
    const banner = byTestId(page, 'offline-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("You're offline. Changes will sync when you're back.");
    await expect(rows(page).first(), 'cached rows stay visible offline').toBeVisible();

    await goOnline(context, api);
    await expect(banner).toBeHidden({ timeout: 20_000 });
  });

  test('the API going away (browser still online) also shows the strip after a failed request', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'offline-banner', 'radar-row');
    await open(page, 'radar');
    await waitForRows(page);
    api.offline = true; // requests fail at the network layer; navigator.onLine stays true
    await rows(page).first().getByRole('button', { name: /save/i }).first().click();
    await expect(byTestId(page, 'offline-banner')).toBeVisible({ timeout: 15_000 });
    api.offline = false;
  });
});

test.describe('queued optimistic actions', () => {
  test('save while offline: applied at once, marked pending, synced on reconnect', async ({
    page,
    context,
    api,
  }) => {
    needs('radar-page', 'radar-feed', 'radar-row', 'offline-banner');
    await open(page, 'radar');
    await waitForRows(page, 2);
    const row = rows(page).first();
    const id = (await row.getAttribute('data-listing-id'))!;

    await goOffline(context, api);
    await expect(byTestId(page, 'offline-banner')).toBeVisible();
    await row.getByRole('button', { name: /save/i }).first().click();
    await expect(row).toHaveAttribute('data-saved', 'true');
    await expect(row).toHaveAttribute('data-pending', 'true');
    expect(api.calls('POST', `/v1/listings/${id}/save`)).toHaveLength(0);

    await goOnline(context, api);
    await expect
      .poll(() => api.calls('POST', `/v1/listings/${id}/save`).length, { timeout: 20_000 })
      .toBe(1);
    await expect(row).not.toHaveAttribute('data-pending', 'true');
    await expect(row).toHaveAttribute('data-saved', 'true');
  });

  test('several offline actions replay in the order they were made', async ({
    page,
    context,
    api,
  }) => {
    needs('radar-page', 'radar-feed', 'radar-row');
    await open(page, 'radar');
    await waitForRows(page, 3);
    const ids = await rows(page).evaluateAll((els) =>
      els.slice(0, 2).map((e) => e.getAttribute('data-listing-id')!),
    );

    await goOffline(context, api);
    await rows(page).nth(0).getByRole('button', { name: /save/i }).first().click();
    await rows(page).nth(1).getByRole('button', { name: /save/i }).first().click();
    await goOnline(context, api);

    await expect
      .poll(() => api.calls('POST', /\/v1\/listings\/.+\/save$/).length, { timeout: 20_000 })
      .toBe(2);
    const order = api.calls('POST', /\/v1\/listings\/.+\/save$/).map((r) => r.path.split('/')[3]);
    expect(order).toEqual(ids);
  });

  test('keyboard save offline behaves the same as the button', async ({ page, context, api }) => {
    needs('radar-page', 'radar-feed', 'radar-row');
    await open(page, 'radar');
    await waitForRows(page);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      if (
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-testid="radar-feed"]')),
        )
      )
        break;
    }
    await page.keyboard.press('j');
    const id = (await activeRow(page).getAttribute('data-listing-id'))!;
    await goOffline(context, api);
    await page.keyboard.press('s');
    await expect(activeRow(page)).toHaveAttribute('data-pending', 'true');
    await goOnline(context, api);
    await expect
      .poll(() => api.calls('POST', `/v1/listings/${id}/save`).length, { timeout: 20_000 })
      .toBe(1);
  });
});

test.describe('errors and slow networks', () => {
  test('a failed refresh keeps cached rows with "Couldn\'t refresh" and Retry', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-row', 'radar-stale-strip');
    await open(page, 'radar');
    await waitForRows(page);
    failNext(api.state, 'GET /v1/feed', 500, 10);
    await page.reload();
    const strip = byTestId(page, 'radar-stale-strip');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    await expect(strip).toContainText(/Couldn.t refresh/);
    await expect(rows(page).first()).toBeVisible();
    api.state.failures.clear();
    await strip.getByRole('button', { name: /retry/i }).click();
    await expect(strip).toBeHidden({ timeout: 10_000 });
  });

  test('no cache and the feed fails: full error with Retry that recovers', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-error', 'radar-row');
    failNext(api.state, 'GET /v1/feed', 503, 10);
    await open(page, 'radar');
    const error = byTestId(page, 'radar-error');
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText(/Couldn.t load your radar/);
    await expect(error).not.toContainText(/stack|TypeError|at \w+ \(/);
    api.state.failures.clear();
    await error.getByRole('button', { name: /retry/i }).click();
    await waitForRows(page);
  });

  test('slow 3G: skeletons first, then rows (no blank screen)', async ({
    page,
    api,
    browserName,
  }) => {
    needs('radar-page', 'radar-skeleton', 'radar-row');
    api.state.latencyMs = 1500;
    const restore =
      browserName === 'chromium' && supportsCdp(page) ? await throttle(page, 'fast3g') : null;
    await page.goto('/radar');
    await expect(byTestId(page, 'radar-skeleton').first()).toBeVisible({ timeout: 30_000 });
    await waitForRows(page);
    await expect(byTestId(page, 'radar-skeleton')).toHaveCount(0);
    await restore?.();
  });
});
