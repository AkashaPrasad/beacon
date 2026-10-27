/**
 * Usability smoke over every screen (Phase B): the app as a student sees it in mock mode
 * (`VITE_MOCK_API=1`, MSW answers every /v1 call; docs/WEB.md §6). Two journeys:
 *
 *  1. first run:  landing → /login → [Continue with Google] (mock) → consent → onboarding
 *                 resume / preferences / sources → radar
 *  2. returning:  radar + detail drawer → deadlines → sources (add + detect) → alerts (create)
 *                 → tracker (move a card) → profile (add a skill) → settings (every tab)
 *                 → notifications
 *
 * At every stop: the page-root testid is visible, axe finds no serious/critical violation, and
 * the page has logged no console error, uncaught exception or unhandled promise rejection.
 * Checks are soft (`expect.soft`), so one run reports every screen instead of stopping at the
 * first problem; each stop is reached by its URL (client-side), so a broken screen does not hide the rest.
 *
 * Run (desktop Chromium + iPhone 14):
 *   pnpm --filter @kestrel/web exec playwright test e2e/smoke-all.spec.ts --project=chromium --project=mobile
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { runAxe } from './utils/a11y';

// MSW runs as a service worker; the default config blocks them for the page.route specs.
test.use({ serviceWorkers: 'allow', actionTimeout: 10_000 });
test.describe.configure({ mode: 'parallel' });

type Scenario = 'returning' | 'new';

interface Problems {
  console: string[];
}

/** Collect console errors, page errors and unhandled rejections from the moment of creation. */
async function watch(page: Page, scenario: Scenario): Promise<Problems> {
  const problems: Problems = { console: [] };
  await page.addInitScript((s) => {
    try {
      // Set the mock scenario once per tab (sign-in later writes beacon:mock:session itself).
      if (!sessionStorage.getItem('qa:smoke-init')) {
        sessionStorage.setItem('qa:smoke-init', '1');
        localStorage.setItem('beacon:mock:user', s);
        localStorage.removeItem('beacon:mock:session');
        if (s === 'returning') localStorage.setItem('beacon:session', 'true');
        else localStorage.removeItem('beacon:session');
      }
    } catch {
      /* storage blocked: defaults apply */
    }
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason as { stack?: string; message?: string } | undefined;
      console.error(`[unhandledrejection] ${r?.stack ?? r?.message ?? String(e.reason)}`);
    });
  }, scenario);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    problems.console.push(
      `console.error ${msg.text().slice(0, 400)}${loc.url ? ` (${loc.url.replace(/^https?:\/\/[^/]+/, '')}:${loc.lineNumber})` : ''}`,
    );
  });
  page.on('pageerror', (err) => {
    problems.console.push(
      `pageerror ${err.name}: ${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}`,
    );
  });
  return problems;
}

/** One stop of the journey: page root visible, axe clean, no new console problems. */
async function checkpoint(
  page: Page,
  testInfo: TestInfo,
  problems: Problems,
  label: string,
  pageId: string | null,
): Promise<void> {
  if (pageId) {
    await expect
      .soft(page.getByTestId(pageId), `${label}: [data-testid=${pageId}] not visible`)
      .toBeVisible({ timeout: 15_000 });
  }
  // Let entrance motion settle (reduced motion makes it near-instant) and lazy chunks load.
  await page.waitForTimeout(400);
  // Dev server only: a module that fails to compile shows Vite's overlay over the whole page.
  const overlay = page.locator('vite-error-overlay');
  if ((await overlay.count()) > 0) {
    const text = await overlay.evaluate(
      (el) => el.shadowRoot?.querySelector('.message')?.textContent ?? '',
    );
    problems.console.push(`vite-error-overlay: ${text.slice(0, 300)}`);
  }
  const { blocking, report } = await runAxe(page, testInfo, `${label}-${testInfo.project.name}`);
  expect.soft(blocking.length, report).toBe(0);
  const found = problems.console.splice(0);
  expect
    .soft(found, `${label}: console errors / uncaught errors / unhandled rejections`)
    .toEqual([]);
}

/**
 * First stop: a real page load. Later stops: client-side navigation (history.pushState +
 * popstate, which React Router follows), the way a student moves around the app. It keeps MSW's
 * in-page state (the source just added, the moved card) and avoids WebKit reporting the fetches
 * that a full reload cancels as errors.
 */
async function gotoScreen(page: Page, path: string): Promise<void> {
  if (!/^https?:/.test(page.url())) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    return;
  }
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, path);
  await page.waitForURL((u) => u.pathname === new URL(path, 'http://x').pathname);
}

test.describe('smoke: every screen in mock mode', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('first run: landing → sign-in → consent → onboarding → radar', async ({
    page,
  }, testInfo) => {
    const problems = await watch(page, 'new');

    await test.step('landing', async () => {
      await gotoScreen(page, '/');
      await checkpoint(page, testInfo, problems, 'landing', 'landing-page');
    });

    await test.step('login', async () => {
      await gotoScreen(page, '/login');
      await checkpoint(page, testInfo, problems, 'login', 'login-page');
    });

    await test.step('sign in (mock Google) → consent', async () => {
      await page.getByTestId('google-sign-in').first().click();
      await expect(page).toHaveURL(/\/welcome/, { timeout: 20_000 });
      await checkpoint(page, testInfo, problems, 'consent', 'consent-page');
      await expect(page.getByTestId('consent-continue')).toBeDisabled();
      // "Don't use AI" needs no extra agreement (the Beacon AI option also needs a checkbox).
      await page.getByRole('radio').last().click();
      await expect(page.getByTestId('consent-continue')).toBeEnabled();
      await page.getByTestId('consent-continue').click();
    });

    for (const step of ['resume', 'preferences', 'sources'] as const) {
      await test.step(`onboarding: ${step}`, async () => {
        await expect(page.getByTestId('onboarding-page')).toHaveAttribute('data-step', step, {
          timeout: 15_000,
        });
        await checkpoint(page, testInfo, problems, `onboarding-${step}`, 'onboarding-page');
        const skip = page.getByTestId('onboarding-skip');
        if (step !== 'sources' && (await skip.isVisible())) await skip.click();
        else await page.getByTestId('onboarding-continue').click();
      });
    }

    await test.step('radar after onboarding', async () => {
      await expect(page).toHaveURL(/\/radar/, { timeout: 15_000 });
      await checkpoint(page, testInfo, problems, 'radar-first-run', 'radar-page');
    });
  });

  test('returning user: every signed-in screen', async ({ page }, testInfo) => {
    const problems = await watch(page, 'returning');

    await test.step('radar + detail drawer', async () => {
      await gotoScreen(page, '/radar');
      await expect(page.getByTestId('radar-row').first()).toBeVisible({ timeout: 20_000 });
      await checkpoint(page, testInfo, problems, 'radar', 'radar-page');
      await page.getByTestId('radar-row').first().getByTestId('radar-row-title').click();
      const drawer = page.getByTestId('listing-drawer');
      await expect.soft(drawer, 'clicking a row title opens the drawer').toBeVisible();
      await expect.soft(page.getByTestId('listing-drawer-title')).toBeVisible();
      await checkpoint(page, testInfo, problems, 'radar-drawer', null);
      await page.keyboard.press('Escape');
      await expect.soft(drawer, 'Esc closes the drawer').toBeHidden();
    });

    await test.step('deadlines', async () => {
      await gotoScreen(page, '/deadlines');
      await checkpoint(page, testInfo, problems, 'deadlines', 'deadlines-page');
    });

    await test.step('sources: add + detect', async () => {
      await gotoScreen(page, '/sources');
      await checkpoint(page, testInfo, problems, 'sources', 'sources-page');
      await page.getByTestId('sources-add-button').click();
      const dialog = page.getByTestId('source-add-dialog');
      await expect(dialog).toBeVisible();
      await dialog
        .getByTestId('source-add-url')
        .fill(`https://boards.greenhouse.io/qasmoke${testInfo.project.name}`);
      await expect(dialog.getByTestId('source-detect-result')).toBeVisible({ timeout: 15_000 });
      await checkpoint(page, testInfo, problems, 'sources-add-dialog', null);
      await dialog.getByTestId('source-add-submit').click();
      await expect.soft(dialog, 'the dialog closes after adding').toBeHidden({ timeout: 10_000 });
      // The table is virtualised, so look for the row itself rather than counting rows.
      await expect
        .soft(
          page.getByTestId('source-row').filter({ hasText: /qasmoke/i }),
          'the new source appears in the table',
        )
        .toHaveCount(1, { timeout: 10_000 });
      expect.soft(problems.console.splice(0), 'sources add: console errors').toEqual([]);
    });

    await test.step('alerts: create a rule', async () => {
      await gotoScreen(page, '/alerts');
      await checkpoint(page, testInfo, problems, 'alerts', 'alerts-page');
      const rules = page.getByTestId('alerts-rule');
      const before = await rules.count();
      await page.getByTestId('alerts-new').click();
      const dialog = page.getByRole('dialog', { name: 'New alert rule' });
      await expect(dialog).toBeVisible();
      // The builder starts from a valid default rule (fit ≥ 80, in-app); give it a name and save.
      await dialog.getByTestId('alerts-name').fill('QA smoke alert');
      await checkpoint(page, testInfo, problems, 'alerts-builder', null);
      await dialog.getByTestId('alerts-save').click();
      await expect.soft(rules, 'the new rule is listed').toHaveCount(before + 1, {
        timeout: 10_000,
      });
      await expect.soft(rules.filter({ hasText: 'QA smoke alert' })).toHaveCount(1);
      expect.soft(problems.console.splice(0), 'alerts create: console errors').toEqual([]);
    });

    await test.step('tracker: move a card (Move to… menu)', async () => {
      await gotoScreen(page, '/tracker');
      await checkpoint(page, testInfo, problems, 'tracker', 'tracker-page');
      const card = page.locator('[data-testid="tracker-card"][data-stage="saved"]').first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      const id = (await card.getAttribute('data-item-id')) ?? '';
      await card.focus();
      await page.keyboard.press('m');
      await page.getByRole('menuitem', { name: /^Applied/ }).click();
      await expect
        .soft(page.locator(`[data-testid="tracker-card"][data-item-id="${id}"]`))
        .toHaveAttribute('data-stage', 'applied', { timeout: 10_000 });
      expect.soft(problems.console.splice(0), 'tracker move: console errors').toEqual([]);
    });

    await test.step('profile: add a skill', async () => {
      await gotoScreen(page, '/profile');
      await checkpoint(page, testInfo, problems, 'profile', 'profile-page');
      const input = page.getByPlaceholder(/^Add (another|a) skill/).first();
      await input.fill('Elixir');
      await input.press('Enter');
      await expect
        .soft(page.getByTestId('profile-skill-chip').filter({ hasText: 'Elixir' }))
        .toHaveCount(1, { timeout: 10_000 });
      expect.soft(problems.console.splice(0), 'profile edit: console errors').toEqual([]);
    });

    for (const tab of ['appearance', 'ai', 'notifications', 'privacy'] as const) {
      await test.step(`settings: ${tab}`, async () => {
        if (tab === 'appearance') await gotoScreen(page, '/settings/appearance');
        else await page.getByTestId(`settings-tab-${tab}`).click();
        await expect.soft(page).toHaveURL(new RegExp(`/settings/${tab}`));
        await checkpoint(page, testInfo, problems, `settings-${tab}`, 'settings-page');
      });
    }

    await test.step('notifications', async () => {
      await gotoScreen(page, '/notifications');
      await checkpoint(page, testInfo, problems, 'notifications', 'notifications-page');
    });
  });
});
