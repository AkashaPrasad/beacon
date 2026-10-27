/**
 * Keyboard-only journey (DESIGN §9, §11; USERFLOW §1–§3): sign-in → consent → onboarding →
 * radar triage with j/k/s/h/a → drawer → tracker keyboard drag and drop → settings, with a
 * visible focus indicator at every step, plus the `?` sheet and the ⌘K palette.
 * No `click()` is used after the first page load.
 */
import type { Page } from '@playwright/test';

import { expectFocusVisible } from './utils/a11y';
import { loginAs, mockGoogle } from './utils/auth';
import { needs, test, expect } from './utils/fixtures';
import { fixtureUsers } from './utils/mock-data';
import { byTestId, open } from './utils/routes';
import { activeRow, PALETTE_SHORTCUT, waitForRows } from './utils/ui';

/** Press Tab until `predicate` holds for the focused element (max `limit` presses). */
async function tabTo(
  page: Page,
  predicate: (el: Element) => boolean,
  limit = 40,
  what = 'target',
): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    const active = await page.evaluateHandle(() => document.activeElement ?? document.body);
    const hit = await active.evaluate(predicate);
    await active.dispose();
    if (hit) return;
  }
  throw new Error(`Tab never reached ${what} within ${limit} presses`);
}

const focusedTestId = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
  );

/** Move focus into the radar feed (one tab stop with roving focus). */
async function focusFeed(page: Page): Promise<void> {
  await tabTo(
    page,
    (el) => Boolean(el.closest('[data-testid="radar-feed"]')),
    60,
    'the radar feed',
  );
}

test.describe('keyboard-only journey', () => {
  test('landing → Google (mocked) → consent → onboarding → radar', async ({
    page,
    context,
    api,
  }) => {
    needs(
      'landing-page',
      'auth-google-button',
      'consent-page',
      'consent-continue',
      'onboarding-page',
      'onboarding-skip',
      'radar-page',
    );
    api.state.session = null;
    api.state.googleLogin = { user: fixtureUsers.newbie, isNew: true };
    api.state.profile = null;
    await mockGoogle(context, fixtureUsers.newbie);
    await open(page, 'landing');

    await tabTo(
      page,
      (el) => el.getAttribute('data-testid') === 'auth-google-button',
      40,
      '[Continue with Google]',
    );
    await expectFocusVisible(page, 'Continue with Google');
    await page.keyboard.press('Enter');
    await expect(byTestId(page, 'consent-page')).toBeVisible({ timeout: 15_000 });
    expect(api.calls('POST', '/v1/auth/google')).toHaveLength(1);

    // Consent: radios by arrow keys, nothing preselected, Enter continues.
    await tabTo(
      page,
      (el) => el.getAttribute('role') === 'radio' || (el as HTMLInputElement).type === 'radio',
      30,
      'the first AI choice',
    );
    await expectFocusVisible(page, 'consent radio');
    await expect(byTestId(page, 'consent-continue')).toBeDisabled();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // "Don't use AI"
    await page.keyboard.press('Space');
    await tabTo(
      page,
      (el) => el.getAttribute('data-testid') === 'consent-continue',
      20,
      '[Continue]',
    );
    await expectFocusVisible(page, 'consent continue');
    await page.keyboard.press('Enter');
    await expect.poll(() => api.calls('PATCH', '/v1/me').length).toBeGreaterThan(0);

    // Three steps, each skipped from the keyboard.
    for (const step of ['resume', 'preferences', 'sources'] as const) {
      await expect(byTestId(page, 'onboarding-page')).toHaveAttribute('data-step', step, {
        timeout: 10_000,
      });
      await tabTo(
        page,
        (el) =>
          el.getAttribute('data-testid') === 'onboarding-skip' ||
          el.getAttribute('data-testid') === 'onboarding-continue',
        60,
        `a step-${step} action`,
      );
      await expectFocusVisible(page, `onboarding ${step}`);
      if ((await focusedTestId(page)) !== 'onboarding-skip') {
        await tabTo(
          page,
          (el) => el.getAttribute('data-testid') === 'onboarding-skip',
          20,
          '[Skip for now]',
        );
      }
      await page.keyboard.press('Enter');
    }
    await expect(byTestId(page, 'radar-page')).toBeVisible({ timeout: 15_000 });
  });

  test('radar triage: j/k move, s save, h hide (+undo), a track, Enter drawer, Esc restores focus', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-feed', 'radar-row', 'listing-drawer', 'listing-drawer-title');
    await open(page, 'radar');
    await waitForRows(page, 3);
    await focusFeed(page);
    await expectFocusVisible(page, 'feed');

    await page.keyboard.press('j');
    const first = (await activeRow(page).getAttribute('data-listing-id'))!;
    await page.keyboard.press('j');
    const second = (await activeRow(page).getAttribute('data-listing-id'))!;
    expect(second).not.toBe(first);
    await expectFocusVisible(page, 'after j');
    await page.keyboard.press('k');
    await expect(activeRow(page)).toHaveAttribute('data-listing-id', first);

    // s: optimistic save, persisted via the API.
    await page.keyboard.press('s');
    await expect(activeRow(page)).toHaveAttribute('data-saved', 'true');
    await expect.poll(() => api.calls('POST', `/v1/listings/${first}/save`).length).toBe(1);

    // a: add to tracker as Saved.
    await page.keyboard.press('a');
    await expect.poll(() => api.calls('POST', '/v1/tracker').length).toBe(1);

    // h: hide with an undo toast; u undoes.
    await page.keyboard.press('j');
    const hidden = (await activeRow(page).getAttribute('data-listing-id'))!;
    await page.keyboard.press('h');
    await expect.poll(() => api.calls('POST', `/v1/listings/${hidden}/hide`).length).toBe(1);
    await expect(page.getByText(/^Hidden/).first()).toBeVisible();
    await page.keyboard.press('u');
    await expect.poll(() => api.calls('POST', `/v1/listings/${hidden}/unhide`).length).toBe(1);

    // Enter opens the drawer and moves focus to its title; Esc closes and restores the row.
    const current = await activeRow(page).getAttribute('data-listing-id');
    await page.keyboard.press('Enter');
    await expect(byTestId(page, 'listing-drawer')).toBeVisible();
    await expect(byTestId(page, 'listing-drawer-title')).toBeFocused();
    await expectFocusVisible(page, 'drawer title');
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'listing-drawer')).toBeHidden();
    await expect(activeRow(page)).toHaveAttribute('data-listing-id', current!);
    const focusInFeed = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="radar-feed"]')),
    );
    expect(focusInFeed, 'focus returns to the feed after Esc').toBe(true);
  });

  test('`/` focuses search; single-key shortcuts are inert while typing', async ({ page, api }) => {
    needs('radar-page', 'radar-search', 'radar-row');
    await open(page, 'radar');
    await waitForRows(page);
    await focusFeed(page);
    await page.keyboard.press('/');
    await expect(byTestId(page, 'radar-search')).toBeFocused();
    await expectFocusVisible(page, 'search');
    await page.keyboard.type('shs'); // contains s and h: must not save or hide
    expect(api.calls('POST', /\/v1\/listings\/.+\/(save|hide)$/)).toHaveLength(0);
    await expect(byTestId(page, 'radar-search')).toHaveValue('shs');
  });

  test('`?` opens the shortcut sheet, Esc closes it and restores focus', async ({ page }) => {
    needs('radar-page', 'radar-row', 'shortcuts-sheet');
    await open(page, 'radar');
    await waitForRows(page);
    await focusFeed(page);
    await page.keyboard.press('?');
    const sheet = byTestId(page, 'shortcuts-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/j/i);
    await expect(sheet).toContainText(/⌘K|Ctrl K|Ctrl\+K/i);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    const back = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="radar-feed"]')),
    );
    expect(back).toBe(true);
  });

  test('⌘K palette: opens focused, searches, runs "Go to Tracker" with Enter', async ({ page }) => {
    needs('radar-page', 'command-palette', 'command-palette-input', 'tracker-page');
    await open(page, 'radar');
    await page.keyboard.press(PALETTE_SHORTCUT);
    await expect(byTestId(page, 'command-palette')).toBeVisible();
    await expect(byTestId(page, 'command-palette-input')).toBeFocused();
    await expectFocusVisible(page, 'palette input');
    await page.keyboard.type('tracker');
    await page.keyboard.press('Enter');
    await expect(byTestId(page, 'tracker-page')).toBeVisible();
    await expect(page).toHaveURL(/\/tracker/);
    await page.keyboard.press(PALETTE_SHORTCUT);
    await expect(byTestId(page, 'command-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'command-palette')).toBeHidden();
  });

  test('g-chords navigate: g t → tracker, g s → sources, g , → settings', async ({ page }) => {
    needs('radar-page', 'radar-row', 'tracker-page', 'sources-page', 'settings-page');
    await open(page, 'radar');
    await waitForRows(page);
    await focusFeed(page);
    for (const [key, id] of [
      ['t', 'tracker-page'],
      ['s', 'sources-page'],
      [',', 'settings-page'],
    ] as const) {
      await page.keyboard.press('g');
      await page.keyboard.press(key);
      await expect(byTestId(page, id)).toBeVisible();
    }
  });

  test('tracker: keyboard drag and drop (Space, arrows, Space) moves a card and announces it', async ({
    page,
    api,
  }) => {
    needs('tracker-page', 'tracker-column', 'tracker-card');
    await open(page, 'tracker');
    const item = api.state.tracker.find((t) => t.stage === 'saved')!;
    await tabTo(
      page,
      (el) => el.closest('[data-testid="tracker-card"]') !== null,
      60,
      'a tracker card',
    );
    await expectFocusVisible(page, 'tracker card');
    // Roving focus inside the board: make sure the saved item is the focused one.
    const focusedId = await page.evaluate(() =>
      document.activeElement?.closest('[data-testid="tracker-card"]')?.getAttribute('data-item-id'),
    );
    const id: string = focusedId ?? item.id;
    await page.keyboard.press('Space');
    await expect(page.getByText(/Picked up/i).first()).toBeAttached();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => api.calls('POST', `/v1/tracker/${id}/move`).length).toBe(1);
    const card = page.locator(`[data-testid="tracker-card"][data-item-id="${id}"]`);
    await expect(card).toHaveAttribute('data-stage', 'applied');
    await expect(page.getByText(/Dropped in Applied|Moved to Applied/i).first()).toBeAttached();
    await expectFocusVisible(page, 'after drop');
  });

  test('tracker: "Move to…" (m) is the single-pointer alternative', async ({ page, api }) => {
    needs('tracker-page', 'tracker-card');
    await open(page, 'tracker');
    await tabTo(
      page,
      (el) => el.closest('[data-testid="tracker-card"]') !== null,
      60,
      'a tracker card',
    );
    const id = await page.evaluate(
      () =>
        document.activeElement
          ?.closest('[data-testid="tracker-card"]')
          ?.getAttribute('data-item-id') ?? '',
    );
    await page.keyboard.press('m');
    const menu = page
      .getByRole('menu')
      .or(page.getByRole('dialog'))
      .or(page.getByRole('listbox'))
      .first();
    await expect(menu).toBeVisible();
    await expect(menu.getByText(/^Interview$/).first()).toBeVisible();
    await page.keyboard.type('Interview');
    await page.keyboard.press('Enter');
    await expect.poll(() => api.calls('POST', `/v1/tracker/${id}/move`).length).toBe(1);
  });

  test('settings: tabs and theme by keyboard, focus visible throughout', async ({ page }) => {
    needs('settings-page');
    await open(page, 'settings');
    await tabTo(page, (el) => el.getAttribute('role') === 'tab', 40, 'the settings tabs');
    await expectFocusVisible(page, 'settings tab');
    await tabTo(
      page,
      (el) =>
        /dark/i.test(el.textContent ?? '') ||
        /dark/i.test(el.getAttribute('aria-label') ?? '') ||
        (el as HTMLInputElement).value === 'dark',
      40,
      'the Dark theme option',
    );
    await expectFocusVisible(page, 'theme option');
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Every remaining Tab stop on the page shows focus.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const onBody = await page.evaluate(() => document.activeElement === document.body);
      if (onBody) break;
      await expectFocusVisible(page, `settings tab stop ${i + 1}`);
    }
  });
});

test.describe('returning user lands on the radar with a keyboard-reachable skip link', () => {
  test('skip link jumps to main content', async ({ page, context, api }) => {
    needs('radar-page', 'app-shell');
    await loginAs(context, api, fixtureUsers.aarav);
    await open(page, 'radar');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to/i });
    await expect(skip).toBeFocused();
    await expectFocusVisible(page, 'skip link');
    await page.keyboard.press('Enter');
    const inMain = await page.evaluate(
      () =>
        Boolean(document.activeElement?.closest('main, #main, [role="main"]')) ||
        location.hash === '#main',
    );
    expect(inMain).toBe(true);
  });
});
