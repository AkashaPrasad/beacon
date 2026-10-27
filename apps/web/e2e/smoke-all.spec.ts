/**
 * Usability smoke over every route, in mock mode (`VITE_MOCK_API=1`: the app's MSW handlers answer
 * every /v1 call; docs/WEB.md §6), on desktop Chromium and iPhone 14 (WebKit). One test per route
 * (or per flow), so a broken screen fails on its own and never hides the others.
 *
 * At every stop (`checkStop`):
 *   - the page-root `data-testid` is visible;
 *   - no console error, uncaught exception or unhandled rejection; no failed request and no
 *     HTTP ≥ 400 from the mock API or any asset (`utils/watch.ts`);
 *   - phone: no horizontal page scroll (the culprits are named);
 *   - every interactive element has an accessible name (accessibility snapshot);
 *   - keyboard: five Tab presses, and every focused element shows a visible ring.
 * Checks are soft (`expect.soft`): one run reports everything. axe runs in `a11y.spec.ts`.
 *
 * Run:
 *   pnpm --filter @kestrel/web exec playwright test e2e/smoke-all.spec.ts --project=chromium --project=mobile
 *   pnpm --filter @kestrel/web exec playwright test --config e2e/utils/playwright.qa.config.ts e2e/smoke-all.spec.ts --project=chromium --project=mobile
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { tabFocusProblems, unnamedControls } from './utils/a11y';
import { loginAs, MOCK_USER, seedMock, waitForApp, type MockSeed } from './utils/auth';
import { SCREENS, settle, visit, type Screen } from './utils/screens';
import { WEB_SRC } from './utils/testids';
import { resumeFile } from './utils/ui';
import { isMobileWidth, overflowReport } from './utils/viewports';
import { viteOverlay, watchPage, type PageProblems } from './utils/watch';

// MSW runs as a service worker; the default config blocks them for the page.route specs.
test.use({ serviceWorkers: 'allow', actionTimeout: 10_000 });
test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

interface StopOptions {
  /** Element that proves the content (not a skeleton) is there. */
  ready?: Locator;
  /** Skip the Tab walk (e.g. while a modal tour owns focus). */
  keyboard?: boolean;
}

/** One stop of a journey: every check from the header, reported softly under `label`. */
async function checkStop(
  page: Page,
  problems: PageProblems,
  label: string,
  pageId: string | null,
  opts: StopOptions = {},
): Promise<void> {
  await test.step(`check: ${label}`, async () => {
    if (pageId) {
      await expect
        .soft(
          page.getByTestId(pageId).first(),
          `${label}: page root [data-testid=${pageId}] not visible`,
        )
        .toBeVisible({ timeout: 20_000 });
    }
    await settle(page, opts.ready).catch((e: Error) => {
      expect.soft(null, `${label}: ${e.message.split('\n')[0] ?? e.message}`).not.toBeNull();
    });
    const overlay = await viteOverlay(page);
    if (isMobileWidth(page)) {
      const r = await overflowReport(page);
      expect
        .soft(
          r.overflow,
          `${label}: page scrolls sideways by ${r.overflow}px on a phone. Widest: ${r.offenders.join(' | ')}`,
        )
        .toBeLessThanOrEqual(0);
    }
    const unnamed = await unnamedControls(page).catch((e: Error) => [
      `snapshot failed: ${e.message}`,
    ]);
    expect.soft(unnamed, `${label}: interactive elements without an accessible name`).toEqual([]);
    if (opts.keyboard !== false) {
      const focus = await tabFocusProblems(page, 5);
      expect.soft(focus, `${label}: keyboard focus is not visible`).toEqual([]);
    }
    const found = [...(overlay ? [overlay] : []), ...problems.take()];
    expect.soft(found, `${label}: console errors, uncaught errors or failed requests`).toEqual([]);
  });
}

async function start(page: Page, seed: MockSeed): Promise<PageProblems> {
  const problems = await watchPage(page);
  await seedMock(page, seed);
  return problems;
}

/** Open a screen from the table (list screens by URL, detail screens by clicking the first item). */
async function openScreen(page: Page, s: Screen): Promise<void> {
  await visit(page, s.path);
  if (!s.open) return;
  const item = s.open.item(page);
  await expect(item, `${s.name}: no item to open on ${s.path}`).toBeVisible({ timeout: 20_000 });
  await item.click();
  await expect(page).toHaveURL(s.open.url, { timeout: 15_000 });
}

function screen(name: string): Screen {
  const s = SCREENS.find((x) => x.name === name);
  if (!s) throw new Error(`no screen ${name}`);
  return s;
}

/** The Back control on a detail page (header Back; on the listing page `drawer-close`). */
function backControl(page: Page): Locator {
  return page
    .getByTestId('drawer-close')
    .or(page.getByRole('link', { name: /^Back to /i }))
    .or(page.getByRole('button', { name: /^Back( to .*)?$/i }))
    .first();
}

/** The Undo action in the newest toast. */
function undoButton(page: Page): Locator {
  return page.locator('[data-sonner-toast]').getByRole('button', { name: /undo/i }).first();
}

/** Vertical scroll of the window and of the nearest scrolling ancestor of `selector`. */
async function scrollOf(page: Page, selector: string): Promise<{ window: number; inner: number }> {
  return page.evaluate((sel) => {
    let inner = 0;
    for (let p = document.querySelector(sel)?.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
        inner = p.scrollTop;
        break;
      }
    }
    return { window: Math.round(window.scrollY), inner: Math.round(inner) };
  }, selector);
}

/** True when some file in apps/web/src matches `pattern` (used to name a piece that has not landed). */
function sourceHas(pattern: RegExp, dir = WEB_SRC): boolean {
  if (!existsSync(dir)) return false;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (sourceHas(pattern, full)) return true;
    } else if (
      /\.tsx?$/.test(name) &&
      !/\.test\.tsx?$/.test(name) &&
      pattern.test(readFileSync(full, 'utf8'))
    ) {
      return true;
    }
  }
  return false;
}

// ── Public pages ────────────────────────────────────────────────────────────────────────────────

test.describe('public', () => {
  for (const name of [
    'landing',
    'features',
    'how-it-works',
    'source-directory',
    'pricing',
    'about',
    'privacy',
    'terms',
    'login',
    'not-found',
  ]) {
    const s = screen(name);
    test(`${s.name} (${s.path})`, async ({ page }) => {
      const problems = await start(page, { scenario: 'signed-out' });
      await page.goto(s.path);
      await checkStop(page, problems, s.name, s.pageId);
      if (s.name === 'not-found') {
        await expect.soft(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect
          .soft(page.getByRole('link', { name: /home|radar|back/i }).first())
          .toBeVisible();
      }
      if (s.name === 'source-directory') {
        const search = page.getByTestId('sources-directory-search');
        await search.fill('stripe');
        await expect.soft(page.getByTestId('sources-directory-list')).toContainText(/stripe/i);
        await checkStop(page, problems, 'source-directory (searched)', s.pageId, {
          keyboard: false,
        });
      }
    });
  }
});

// ── Sign-in ─────────────────────────────────────────────────────────────────────────────────────

test.describe('sign-in', () => {
  test('email + password → radar', async ({ page }) => {
    const problems = await watchPage(page);
    const landed = await loginAs(page, { as: 'returning', via: 'form' });
    expect.soft(landed, 'a returning student lands on the radar').toBe('/radar');
    await checkStop(page, problems, 'radar after email sign-in', 'radar-page', {
      ready: page.getByTestId('radar-card').or(page.getByTestId('radar-row')).first(),
    });
  });

  test('wrong password shows the error, then signs in', async ({ page }) => {
    const problems = await watchPage(page);
    await seedMock(page, { scenario: 'signed-out' });
    await page.goto('/login');
    await waitForApp(page, '[data-testid="email-auth-form"]');
    // MSW answers 401 for a password containing "wrong" (that 401 is the point of this stop).
    problems.allow(/HTTP 401 \(mock API\): POST \/v1\/auth\/login/);
    await page.getByTestId('email-auth-email').fill(MOCK_USER.email);
    await page.getByTestId('email-auth-password').fill('wrong-password');
    await page.getByTestId('email-auth-submit').click();
    await expect.soft(page.getByTestId('email-auth-error')).toBeVisible();
    await expect.soft(page.getByTestId('email-auth-password')).toBeFocused();
    await checkStop(page, problems, 'login error', 'login-page', { keyboard: false });
    await page.getByTestId('email-auth-password').fill(MOCK_USER.password);
    await page.getByTestId('email-auth-submit').click();
    await expect.soft(page).toHaveURL(/\/radar/, { timeout: 20_000 });
  });

  test('Continue with Google (mock) → welcome', async ({ page }) => {
    const problems = await watchPage(page);
    const landed = await loginAs(page, { as: 'new', via: 'google' });
    expect.soft(landed, 'a new student lands on consent').toBe('/welcome');
    await checkStop(page, problems, 'welcome after Google', 'consent-page');
  });

  test('create an account → welcome', async ({ page }) => {
    const problems = await watchPage(page);
    const landed = await loginAs(page, { as: 'new', via: 'register' });
    expect.soft(landed, 'a new account lands on consent').toBe('/welcome');
    await checkStop(page, problems, 'welcome after register', 'consent-page');
  });
});

// ── First run: consent → every onboarding step → customising → radar → tour ─────────────────────

type OnboardingMode = 'answer' | 'skip';

/** Answer (or skip) the current onboarding step. Returns what was done, for the step log. */
async function actOnStep(page: Page, step: string, mode: OnboardingMode): Promise<string> {
  const cont = page.getByTestId('onboarding-continue');
  const skip = page.getByTestId('onboarding-skip');
  if (step === 'resume') {
    if (mode === 'skip' && (await skip.isVisible())) {
      await skip.click();
      return 'skipped';
    }
    const input = page
      .getByTestId('resume-file-input')
      .or(page.locator('input[type=file]'))
      .first();
    await input.setInputFiles(
      resumeFile(
        'aarav-mehta-resume.pdf',
        'Aarav Mehta B.Tech CSE 2027 React Node.js MongoDB TypeScript',
      ),
    );
    // Parsing state, then the parsed preview (or the next step, if the flow advances by itself).
    await expect
      .poll(
        async () =>
          (await page.getByTestId('onboarding-page').getAttribute('data-step')) !== 'resume' ||
          (await cont.isEnabled().catch(() => false)),
        { message: 'resume upload never finished parsing', timeout: 20_000 },
      )
      .toBe(true);
    if ((await page.getByTestId('onboarding-page').getAttribute('data-step')) === 'resume')
      await cont.click();
    return 'uploaded a PDF';
  }
  if (step === 'education') {
    await page.getByTestId('onboarding-degree').first().click();
    await page.getByTestId('onboarding-year').first().click();
    await cont.click();
    return 'selected degree and graduation year';
  }
  if (mode === 'skip' && (await skip.isVisible())) {
    await skip.click();
    return 'skipped';
  }
  if (await cont.isEnabled().catch(() => false)) {
    await cont.click();
    return 'continued';
  }
  // Nothing chosen yet: pick the first option card / chip, or type into the first field.
  const answer = page
    .getByTestId('onboarding-answer')
    .or(page.getByTestId('onboarding-page'))
    .first();
  const option = answer
    .locator(
      '[role=checkbox], [role=radio], button[aria-pressed], [data-testid=onboarding-type-card], [data-testid=onboarding-option], [data-testid=onboarding-chip]',
    )
    .first();
  if (await option.isVisible().catch(() => false)) {
    await option.click();
  } else {
    const field = answer.locator('input:not([type=file]):not([type=hidden]), textarea').first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(step === 'name' ? 'Aarav' : '2027');
    }
  }
  if (await cont.isEnabled().catch(() => false)) {
    await cont.click();
    return 'answered';
  }
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    return 'skipped (could not answer)';
  }
  throw new Error(`onboarding step "${step}": neither Continue nor Skip is usable`);
}

/** From `/welcome`, accept consent and walk the whole sequence to `/radar`. Returns the step log. */
async function walkFirstRun(
  page: Page,
  problems: PageProblems,
  mode: OnboardingMode,
): Promise<string[]> {
  const log: string[] = [];
  await test.step('consent', async () => {
    await checkStop(page, problems, 'welcome (consent)', 'consent-page');
    await expect.soft(page.getByTestId('consent-continue')).toBeDisabled();
    // "Don't use AI" needs no extra agreement.
    await page.getByRole('radio', { name: /^Don.t use AI/ }).click();
    await expect(page.getByTestId('consent-continue')).toBeEnabled();
    await page.getByTestId('consent-continue').click();
    log.push('consent: no AI');
  });

  const root = page.getByTestId('onboarding-page');
  let previous = '';
  for (let i = 0; i < 30; i++) {
    await expect
      .poll(
        async () => {
          const path = new URL(page.url()).pathname;
          if (path === '/radar') return 'radar';
          if (
            await page
              .getByTestId('onboarding-customising')
              .isVisible()
              .catch(() => false)
          )
            return 'customising';
          const step = await root.getAttribute('data-step', { timeout: 500 }).catch(() => null);
          return step && step !== previous ? step : 'waiting';
        },
        { message: `onboarding stuck after "${previous || 'consent'}"`, timeout: 25_000 },
      )
      .not.toBe('waiting');
    const path = new URL(page.url()).pathname;
    if (path === '/radar') break;
    if (
      await page
        .getByTestId('onboarding-customising')
        .isVisible()
        .catch(() => false)
    ) {
      await checkStop(page, problems, 'onboarding: customising', 'onboarding-customising', {
        keyboard: false,
      });
      log.push('customising');
      await expect(page, '"Customising your radar" never handed over to the radar').toHaveURL(
        /\/radar/,
        {
          timeout: 20_000,
        },
      );
      break;
    }
    const step = (await root.getAttribute('data-step')) ?? '?';
    await test.step(`onboarding: ${step}`, async () => {
      await checkStop(page, problems, `onboarding: ${step}`, 'onboarding-page');
      log.push(`${step}: ${await actOnStep(page, step, mode)}`);
    });
    previous = step;
  }
  await expect(page).toHaveURL(/\/radar/, { timeout: 20_000 });
  return log;
}

test.describe('first run', () => {
  test('welcome → every step (resume PDF) → customising → radar', async ({ page }, testInfo) => {
    const problems = await watchPage(page);
    await loginAs(page, { as: 'new', via: 'register' });
    const log = await walkFirstRun(page, problems, 'answer');
    testInfo.annotations.push({ type: 'onboarding steps', description: log.join(' → ') });
    await checkStop(page, problems, 'radar after onboarding', 'radar-page', { keyboard: false });
    // Onboarding hands over to the spotlight tour on the first radar visit.
    if (sourceHas(/<SpotlightTour\b/)) {
      await expect
        .soft(page.getByTestId('tour'), 'the first-run tour starts on /radar')
        .toBeVisible({
          timeout: 15_000,
        });
    }
  });

  test('skip every optional step', async ({ page }, testInfo) => {
    const problems = await watchPage(page);
    await loginAs(page, { as: 'new', via: 'register' });
    const log = await walkFirstRun(page, problems, 'skip');
    testInfo.annotations.push({ type: 'onboarding steps', description: log.join(' → ') });
    await checkStop(page, problems, 'radar after skipping', 'radar-page', { keyboard: false });
  });

  test('spotlight tour: Next through every stop, Back, Skip', async ({ page }) => {
    const problems = await start(page, {
      scenario: 'returning',
      storage: { [`beacon:tour:${MOCK_USER.id}`]: JSON.stringify('pending') },
    });
    await page.goto('/radar');
    const tour = page.getByTestId('tour');
    await expect(tour, 'a pending tour starts on /radar').toBeVisible({ timeout: 20_000 });
    await checkStop(page, problems, 'tour: first stop', 'tour-card', { keyboard: false });
    const next = page.getByTestId('tour-next');
    const position = page.getByTestId('tour-position');
    const stops: string[] = [];
    for (let i = 0; i < 15 && (await tour.isVisible()); i++) {
      stops.push(
        `${(await tour.getAttribute('data-stop')) ?? '?'} (${(await position.textContent())?.trim() ?? ''})`,
      );
      if (i === 1) {
        await page.getByTestId('tour-back').click();
        await expect.soft(position, 'Back returns to the first stop').toHaveText(/^1\b/);
        await next.click();
      }
      await next.click();
    }
    expect.soft(stops.length, `tour stops: ${stops.join(' → ')}`).toBeGreaterThanOrEqual(3);
    await expect.soft(tour, 'Done closes the tour').toBeHidden();
    await checkStop(page, problems, 'radar after the tour', 'radar-page', { keyboard: false });
    // Replay from the user menu, then Skip.
    if (isMobileWidth(page)) {
      await visit(page, '/me');
      await page.getByRole('button', { name: /show me around/i }).click();
    } else {
      await page.getByTestId('user-menu').click();
      await page.getByRole('menuitem', { name: /show me around/i }).click();
    }
    await expect.soft(tour, '"Show me around" replays the tour').toBeVisible({ timeout: 10_000 });
    await page.getByTestId('tour-skip').click();
    await expect.soft(tour, 'Skip closes the tour').toBeHidden();
    expect.soft(problems.take(), 'tour: console errors or failed requests').toEqual([]);
  });
});

// ── Radar ───────────────────────────────────────────────────────────────────────────────────────

test.describe('radar', () => {
  test('filters, search, Tune, open a listing, Back restores the list', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/radar');
    const rows = page.getByTestId('radar-card').or(page.getByTestId('radar-row'));
    await checkStop(page, problems, 'radar', 'radar-page', { ready: rows.first() });
    const total = page.getByTestId('radar-total');
    const before = (await total.textContent())?.trim() ?? '';

    await test.step('filter by type', async () => {
      if (!isMobileWidth(page) && (await page.getByTestId('radar-filter-rail').isVisible())) {
        await page
          .getByTestId('radar-filter-rail')
          .getByRole('checkbox', { name: /^Hackathon/ })
          .click();
      } else {
        await page.getByTestId('radar-filters-button').click();
        const sheet = page.getByRole('dialog').last();
        await expect(sheet).toBeVisible();
        await checkStop(page, problems, 'radar filter sheet', null, { keyboard: false });
        await sheet.getByRole('checkbox', { name: /^Hackathon/ }).click();
        await page.keyboard.press('Escape');
      }
      await expect.soft(page, 'the type filter is in the URL').toHaveURL(/hackathon/i);
      await expect.soft(total, 'the count changes with the filter').not.toHaveText(before);
      await expect.soft(rows.first()).toBeVisible();
    });

    await test.step('search', async () => {
      await visit(page, '/radar');
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });
      const search = page.getByTestId('radar-search').filter({ visible: true }).first();
      await search.fill('intern');
      await expect.soft(page, 'the query is in the URL').toHaveURL(/q=intern/i, { timeout: 5_000 });
      await expect
        .soft(
          rows.first().or(page.getByTestId('radar-empty')),
          'search shows rows or the search empty state',
        )
        .toBeVisible();
      await search.fill('zzzz-no-such-listing');
      await expect
        .soft(page.getByTestId('radar-empty'), 'a search with no hits shows the empty state')
        .toBeVisible();
      await checkStop(page, problems, 'radar search: no results', 'radar-page', {
        keyboard: false,
      });
      await visit(page, '/radar');
    });

    await test.step('Tune', async () => {
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('radar-tune').filter({ visible: true }).first().click();
      const threshold = page
        .getByTestId('radar-fit-threshold')
        .or(page.getByRole('slider', { name: /fit/i }))
        .first();
      await expect.soft(threshold, 'Tune shows the fit threshold').toBeVisible();
      await expect
        .soft(
          page
            .getByTestId('radar-sort')
            .or(page.getByRole('radiogroup', { name: /sort/i }))
            .first(),
        )
        .toBeVisible();
      await checkStop(page, problems, 'radar Tune popover', null, { keyboard: false });
      await page.keyboard.press('Escape');
      await expect.soft(threshold, 'Esc closes Tune').toBeHidden();
    });

    await test.step('open a listing (full page) and come back', async () => {
      // A below-fold card makes the restoration meaningful without synthetic wheel inertia.
      await expect(rows.nth(12)).toBeVisible({ timeout: 15_000 });
      const target = rows.nth(12);
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const id = await target.getAttribute('data-listing-id');
      const scrolled = await scrollOf(
        page,
        '[data-testid="radar-grid"], [data-testid="radar-feed"]',
      );
      await target.click();
      await expect(page).toHaveURL(new RegExp(`/radar/${id ?? ''}`), { timeout: 15_000 });
      await checkStop(page, problems, 'listing page', 'listing-page', {
        ready: page.getByTestId('listing-drawer-title').first(),
      });
      await expect
        .soft(page.getByTestId('drawer-apply').first(), 'the listing page has Apply')
        .toBeVisible();
      await backControl(page).click();
      await expect(page).toHaveURL(/\/radar\/?(\?|$)/, { timeout: 10_000 });
      await expect(rows.first()).toBeVisible();
      await page.waitForTimeout(400);
      const after = await scrollOf(page, '[data-testid="radar-grid"], [data-testid="radar-feed"]');
      expect
        .soft(
          Math.abs(after.window - scrolled.window) + Math.abs(after.inner - scrolled.inner),
          `Back restores the list scroll (before ${JSON.stringify(scrolled)}, after ${JSON.stringify(after)})`,
        )
        .toBeLessThanOrEqual(80);
      await expect
        .soft(page.locator(`[data-listing-id="${id ?? ''}"]`), 'the opened row is on screen again')
        .toBeInViewport();
      await checkStop(page, problems, 'radar after Back', 'radar-page', { keyboard: false });
    });
  });
});

// ── Deadlines ───────────────────────────────────────────────────────────────────────────────────

test.describe('deadlines', () => {
  test('weeks, paging, open a deadline', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/deadlines');
    const pill = page.getByTestId('deadlines-pill').first();
    await checkStop(page, problems, 'deadlines', 'deadlines-page', { ready: pill });
    const next = page.getByTestId('deadlines-next-week');
    if (await next.isVisible()) {
      await next.click();
      await page.getByTestId('deadlines-prev-week').click();
    }
    await pill.click();
    await expect
      .soft(page, 'a deadline opens its listing page')
      .toHaveURL(/\/radar\/[^/]+/, { timeout: 10_000 });
    await checkStop(page, problems, 'listing from deadlines', 'listing-page', { keyboard: false });
    await backControl(page).click();
    await expect.soft(page).toHaveURL(/\/deadlines/);
  });
});

// ── Sources ─────────────────────────────────────────────────────────────────────────────────────

test.describe('sources', () => {
  test('list, add with live detect, source page, packs, pack page', async ({ page }, testInfo) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/sources');
    await checkStop(page, problems, 'sources', 'sources-page', {
      ready: page.getByTestId('source-row').first(),
    });

    await test.step('add a source (live detect)', async () => {
      const form = page.getByTestId('source-add-dialog');
      await expect(form).toBeVisible();
      const slug = `qasmoke${testInfo.project.name}`;
      await form.getByTestId('source-add-url').fill(`https://boards.greenhouse.io/${slug}`);
      await expect
        .soft(
          page
            .getByTestId('source-detect-result')
            .or(page.getByTestId('sources-detect-result'))
            .first(),
          'detection result appears while typing',
        )
        .toBeVisible({ timeout: 15_000 });
      await checkStop(page, problems, 'sources add (detected)', null, { keyboard: false });
      await form.getByTestId('source-add-submit').click();
      await expect
        .soft(form.getByTestId('source-add-url'), 'the form is ready for another source')
        .toHaveValue('', { timeout: 10_000 });
      await expect
        .soft(
          page.getByTestId('source-row').filter({ hasText: new RegExp(slug, 'i') }),
          'the new source is listed',
        )
        .toHaveCount(1, { timeout: 10_000 });
    });

    await test.step('source page', async () => {
      await openScreen(page, screen('source'));
      await checkStop(page, problems, 'source page', 'source-page');
      await expect.soft(page.getByTestId('source-health')).toBeVisible();
      await backControl(page).click();
      await expect.soft(page).toHaveURL(/\/sources\/?$/);
    });

    await test.step('packs tab and a pack page', async () => {
      await page.getByTestId('sources-tab-packs').click();
      await expect.soft(page).toHaveURL(/\/sources\/packs/);
      await checkStop(page, problems, 'sources: packs', 'sources-page', { keyboard: false });
      await page.locator('a[href^="/sources/packs/"]').first().click();
      await expect(page).toHaveURL(/\/sources\/packs\/[^/]+$/);
      await checkStop(page, problems, 'pack page', 'pack-page', {
        ready: page.getByTestId('pack-source').first(),
      });
      await backControl(page).click();
      await expect.soft(page).toHaveURL(/\/sources\/packs\/?$/);
    });
  });
});

// ── Alerts ──────────────────────────────────────────────────────────────────────────────────────

test.describe('alerts', () => {
  test('list, build a rule on /alerts/new, save, send a test, edit page', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/alerts');
    const rules = page.getByTestId('alerts-rule');
    await checkStop(page, problems, 'alerts', 'alerts-page', { ready: rules.first() });
    const count = await rules.count();

    await test.step('new rule', async () => {
      await page.getByTestId('alerts-new').click();
      await expect(page).toHaveURL(/\/alerts\/new/);
      await checkStop(page, problems, 'alert editor (new)', 'alert-editor-page');
      // Build: add a Type condition (Hackathon).
      await page.getByTestId('alerts-add-condition').click();
      const typeOption = page
        .getByRole('option', { name: /^Type/ })
        .or(page.getByRole('menuitem', { name: /^Type/ }))
        .first();
      await expect.soft(typeOption, 'the condition picker lists Type').toBeVisible();
      if (await typeOption.isVisible()) {
        await typeOption.click();
        const hackathon = page
          .getByRole('option', { name: /Hackathon/ })
          .or(page.getByRole('menuitemcheckbox', { name: /Hackathon/ }))
          .or(page.getByRole('checkbox', { name: /Hackathon/ }))
          .first();
        await hackathon.click();
        await page.keyboard.press('Escape');
        await expect
          .soft(
            page.getByTestId('alerts-plain-preview'),
            'the plain-language preview mentions the type',
          )
          .toContainText(/hackathon/i);
      }
      await page.getByTestId('alerts-more-options').click();
      await page.getByTestId('alerts-name').fill('QA smoke: hackathons');
      await page.getByTestId('alerts-save').click();
      await expect
        .soft(page, 'saving returns to the list')
        .toHaveURL(/\/alerts\/?$/, { timeout: 10_000 });
      await expect
        .soft(rules, 'the new rule is listed')
        .toHaveCount(count + 1, { timeout: 10_000 });
      await expect.soft(rules.filter({ hasText: 'QA smoke: hackathons' })).toHaveCount(1);
      await checkStop(page, problems, 'alerts after save', 'alerts-page', { keyboard: false });
    });

    await test.step('send a test', async () => {
      await rules
        .first()
        .getByRole('button', { name: /^More for / })
        .click();
      await page.getByTestId('alerts-test').click();
      await expect
        .soft(page.locator('[data-sonner-toast]').first(), 'a test confirmation toast')
        .toBeVisible({ timeout: 10_000 });
      expect.soft(problems.take(), 'alerts test: console errors or failed requests').toEqual([]);
    });

    await test.step('edit page', async () => {
      await openScreen(page, screen('alert-edit'));
      await checkStop(page, problems, 'alert editor (edit)', 'alert-editor-page');
      await backControl(page).click();
      await expect.soft(page).toHaveURL(/\/alerts\/?$/);
    });
  });
});

// ── Tracker ─────────────────────────────────────────────────────────────────────────────────────

test.describe('tracker', () => {
  test('drag a card to Applied, undo, open the item page', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/tracker');
    const saved = page.locator('[data-testid="tracker-card"][data-stage="saved"]');
    await checkStop(page, problems, 'tracker', 'tracker-page', { ready: saved.first() });
    const card = saved.first();
    const id = (await card.getAttribute('data-item-id')) ?? '';
    const byId = page.locator(`[data-testid="tracker-card"][data-item-id="${id ?? ''}"]`);

    await test.step('keyboard drag: Space, →, Space', async () => {
      await card.focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await expect
        .soft(byId, 'the card moved to Applied')
        .toHaveAttribute('data-stage', 'applied', { timeout: 10_000 });
      await expect
        .soft(page.getByTestId('tracker-announcer'), 'the move is announced')
        .toContainText(/applied/i);
    });

    await test.step('undo', async () => {
      await undoButton(page).click();
      await expect
        .soft(byId, 'Undo puts the card back in Saved')
        .toHaveAttribute('data-stage', 'saved', { timeout: 10_000 });
    });

    if (!isMobileWidth(page)) {
      await test.step('mouse drag to Applied', async () => {
        const target = page
          .getByTestId('tracker-column')
          .filter({ has: page.getByRole('heading', { name: 'Applied' }) })
          .first();
        const from = await byId.boundingBox();
        const to = await target.boundingBox();
        if (from && to) {
          await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
          await page.mouse.down();
          await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, {
            steps: 4,
          });
          await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
          await page.mouse.up();
          await expect
            .soft(byId, 'mouse drag moves the card to Applied')
            .toHaveAttribute('data-stage', 'applied', { timeout: 10_000 });
        }
      });
    }

    await test.step('item page', async () => {
      await expect(page.getByTestId('tracker-board')).not.toHaveAttribute('data-dragging', /.+/);
      await visit(page, '/tracker');
      await page.getByTestId('tracker-card').first().click();
      await expect(page).toHaveURL(/\/tracker\/[^/]+$/);
      await checkStop(page, problems, 'tracker item page', 'tracker-item-page', {
        ready: page.getByTestId('tracker-item-stage'),
      });
      await backControl(page).click();
      await expect.soft(page).toHaveURL(/\/tracker\/?$/);
    });
  });
});

// ── Profile ─────────────────────────────────────────────────────────────────────────────────────

test.describe('profile', () => {
  test('edit a skill and undo, rename and undo', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/profile');
    const chips = page.getByTestId('profile-skill-chip');
    await checkStop(page, problems, 'profile', 'profile-page', { ready: chips.first() });

    await test.step('add a skill', async () => {
      const input = page.getByTestId('profile-skill-input');
      await input.fill('Elixir');
      await input.press('Enter');
      await expect
        .soft(chips.filter({ hasText: 'Elixir' }), 'the new skill chip appears')
        .toHaveCount(1);
    });

    await test.step('remove a skill and undo', async () => {
      await page.getByRole('button', { name: 'Remove Docker' }).click();
      await expect.soft(chips.filter({ hasText: /^Docker/ }), 'the chip is removed').toHaveCount(0);
      await undoButton(page).click();
      await expect
        .soft(chips.filter({ hasText: /Docker/ }), 'Undo brings the chip back')
        .toHaveCount(1);
    });

    await test.step('rename and undo', async () => {
      const name = page.getByRole('textbox', { name: 'Your name' });
      await name.fill('Aarav M.');
      await name.press('Enter');
      await name.blur();
      await expect
        .soft(page.locator('[data-sonner-toast]').filter({ hasText: /name/i }).first())
        .toBeVisible();
      await page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Name updated.' })
        .getByRole('button', { name: 'Undo' })
        .click();
      await expect.soft(name, 'Undo restores the name').toHaveValue(MOCK_USER.name);
    });
    await checkStop(page, problems, 'profile after edits', 'profile-page', { keyboard: false });
  });
});

// ── Settings ────────────────────────────────────────────────────────────────────────────────────

test.describe('settings', () => {
  test('appearance: theme and density apply at once', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/settings/appearance');
    await checkStop(page, problems, 'settings: appearance', 'settings-page');
    const html = page.locator('html');
    await page.locator('[data-testid="settings-theme-option"][data-value="dark"]').click();
    await expect.soft(html, 'Dark applies at once').toHaveAttribute('data-theme', 'dark');
    await checkStop(page, problems, 'settings: appearance (dark)', 'settings-page', {
      keyboard: false,
    });
    await page.locator('[data-testid="settings-theme-option"][data-value="light"]').click();
    await expect.soft(html).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('settings-density').getByRole('radio', { name: 'Compact' }).click();
    await expect
      .soft(html, 'Compact density applies at once')
      .toHaveAttribute('data-density', 'compact');
    await page.getByTestId('settings-density').getByRole('radio', { name: 'Comfortable' }).click();
    await expect.soft(html).toHaveAttribute('data-density', 'comfortable');
  });

  test('AI & keys: a saved key shows only its last four characters', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/settings/ai');
    await checkStop(page, problems, 'settings: AI', 'settings-page');
    await page.getByRole('radio', { name: /^Your own key/ }).click();
    const key = ['sk', 'qa', 'smoke', '0123456789abcdef', 'WXYZ'].join('-');
    const input = page.getByTestId('settings-ai-key-input');
    await expect(input).toBeVisible();
    await input.fill(key);
    await page.getByTestId('settings-ai-save').click();
    const stored = page.getByTestId('settings-ai-key');
    await expect
      .soft(stored, 'the stored key line shows the last four')
      .toContainText('WXYZ', { timeout: 10_000 });
    const html = await page.content();
    expect.soft(html.includes(key), 'the full key is not left anywhere in the page').toBe(false);
    expect.soft(html.includes(key.slice(0, -4)), 'no prefix of the key is shown').toBe(false);
    await checkStop(page, problems, 'settings: AI (key saved)', 'settings-page', {
      keyboard: false,
    });
  });

  test('notifications tab', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/settings/notifications');
    await checkStop(page, problems, 'settings: notifications', 'settings-page');
    await expect.soft(page.getByTestId('settings-timezone')).toBeVisible();
    await expect.soft(page.getByTestId('settings-reminders')).toBeVisible();
  });

  test('privacy & data: export downloads JSON', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/settings/privacy');
    await checkStop(page, problems, 'settings: privacy', 'settings-page');
    const download = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByTestId('settings-export').click();
    const file = await download;
    expect
      .soft(file.suggestedFilename(), 'the export is a dated JSON file')
      .toMatch(/^beacon-export-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await file.path();
    const body = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect
      .soft(Object.keys(body), 'the export has the profile and settings')
      .toEqual(expect.arrayContaining(['profile', 'settings']));
    expect.soft(problems.take(), 'export: console errors or failed requests').toEqual([]);
  });
});

// ── Notifications, admin ────────────────────────────────────────────────────────────────────────

test.describe('notifications', () => {
  test('grouped list, mark all read, a click navigates', async ({ page }) => {
    const problems = await start(page, { scenario: 'returning' });
    await page.goto('/notifications');
    const items = page.getByTestId('notifications-item');
    await checkStop(page, problems, 'notifications', 'notifications-page', {
      ready: items.first(),
    });
    await page.getByTestId('notifications-mark-all').click();
    await expect
      .soft(page.getByTestId('notifications-unread-dot'), 'no unread dots after Mark all read')
      .toHaveCount(0);
    await items.first().getByRole('link').first().or(items.first()).first().click();
    await expect
      .soft(page, 'a notification opens what it is about')
      .not.toHaveURL(/\/notifications\/?$/);
    expect.soft(problems.take(), 'notifications: console errors or failed requests').toEqual([]);
  });
});

test.describe('admin', () => {
  test('ops dashboard (admin account, signed in with email)', async ({ page }) => {
    const problems = await watchPage(page);
    await loginAs(page, { as: 'admin', via: 'form', next: '/admin' });
    await visit(page, '/admin');
    await checkStop(page, problems, 'admin', 'admin-page', {
      ready: page.getByTestId('admin-queues'),
    });
    await expect.soft(page.getByTestId('admin-runs')).toBeVisible();
  });
});
