/**
 * SPEC §8 "Edge cases explicitly required", each asserting the graceful behaviour USERFLOW and
 * DESIGN describe. The fake API (utils/mock-api.ts) produces each condition; the UI must
 * neither crash nor show broken values, and must offer the documented next action.
 */
import type { Page } from '@playwright/test';

import { loginAs } from './utils/auth';
import { needs, test, expect } from './utils/fixtures';
import {
  crawlSourceNearCap,
  duplicateListingAcrossPages,
  duplicateSourceUrl,
  EMOJI_TITLE,
  emojiTitles,
  exhaustCredits,
  fiveThousandMatches,
  fixtureUsers,
  listingPastDeadline,
  listingsWithNoDeadline,
  LONG_COMPANY,
  redirectingSource,
  removeApiKey,
  resumeNonEnglish,
  resumeScanned,
  resumeWithNoSkills,
  setTimezone,
  veryLongCompanyNames,
  wrongAtsToken,
  zeroMatches,
  type FixtureUser,
} from './utils/mock-data';
import { byTestId, open } from './utils/routes';
import {
  BROKEN_VALUE,
  bigPdf,
  chooseOption,
  openDrawerFor,
  resumeFile,
  rowFor,
  rows,
  scoreOf,
  waitForRows,
} from './utils/ui';
import { horizontalOverflow, VIEWPORTS } from './utils/viewports';

const atResumeStep: FixtureUser = {
  ...fixtureUsers.newbie,
  id: '0001000000000000000000aa',
  onboardingStep: 'resume',
  aiMode: 'off',
};

// ── Resume parsing ──────────────────────────────────────────────────────────

test.describe('resume upload edge cases', () => {
  test.beforeEach(async ({ context, api }) => {
    api.state.profile = null;
    api.state.hasResume = false;
    await loginAs(context, api, atResumeStep);
  });

  test('resume with no skills section: warns and asks for skills before continuing', async ({
    page,
    api,
  }) => {
    needs(
      'onboarding-page',
      'resume-file-input',
      'resume-warning',
      'resume-skill-input',
      'onboarding-continue',
    );
    resumeWithNoSkills(api.state);
    await page.goto('/onboarding/resume');
    await expect(byTestId(page, 'onboarding-page')).toHaveAttribute('data-step', 'resume');
    await byTestId(page, 'resume-file-input').setInputFiles(resumeFile());
    await expect(byTestId(page, 'resume-warning')).toContainText(/skills/i);
    await expect(byTestId(page, 'onboarding-continue')).toBeDisabled();
    const skill = byTestId(page, 'resume-skill-input');
    await skill.fill('TypeScript');
    await skill.press('Enter');
    await expect(byTestId(page, 'onboarding-continue')).toBeEnabled();
    await expect(page.locator('body')).not.toContainText(BROKEN_VALUE);
  });

  test('non-English resume: no crash, grad year asked inline, manual path offered', async ({
    page,
    api,
  }) => {
    needs(
      'onboarding-page',
      'resume-file-input',
      'resume-gradyear-input',
      'resume-warning',
      'onboarding-continue',
    );
    resumeNonEnglish(api.state);
    await page.goto('/onboarding/resume');
    await byTestId(page, 'resume-file-input').setInputFiles(
      resumeFile('resume-hi.pdf', 'Vidyarthi'),
    );
    await expect(byTestId(page, 'resume-warning')).toBeVisible();
    await expect(byTestId(page, 'resume-gradyear-input')).toBeVisible();
    await expect(page.getByText(/couldn.t find it/i)).toBeVisible();
    await expect(byTestId(page, 'onboarding-continue')).toBeDisabled();
    await expect(
      page
        .getByRole('button', { name: /fill (it )?in manually/i })
        .or(page.getByRole('link', { name: /fill (it )?in manually/i }))
        .first(),
    ).toBeVisible();
  });

  test('scanned PDF: explains why and offers the manual form', async ({ page, api }) => {
    needs('onboarding-page', 'resume-file-input', 'resume-error');
    resumeScanned(api.state);
    await page.goto('/onboarding/resume');
    await byTestId(page, 'resume-file-input').setInputFiles(resumeFile('scan.pdf'));
    await expect(byTestId(page, 'resume-error')).toContainText(/looks like an image/i);
    await expect(
      byTestId(page, 'resume-error').getByRole('button', { name: /fill in manually/i }),
    ).toBeVisible();
  });

  test('20 MB resume is rejected with the size rule, without a stack trace', async ({
    page,
    api,
  }) => {
    needs('onboarding-page', 'resume-file-input', 'resume-error');
    await page.goto('/onboarding/resume');
    await byTestId(page, 'resume-file-input').setInputFiles(bigPdf(20));
    await expect(byTestId(page, 'resume-error')).toContainText(/5 MB/);
    // The client rejects before uploading; if it did upload, the API's 413 must still be handled.
    const uploads = api.calls('POST', '/v1/profile/resume');
    expect(uploads.every((r) => r.status === 413)).toBe(true);
    await expect(page.locator('body')).not.toContainText(/at \w+ \(|TypeError|stack/i);
  });
});

// ── Radar listings ──────────────────────────────────────────────────────────

test.describe('radar listing edge cases', () => {
  test('listing with no deadline shows Rolling / No fixed deadline, never a broken date', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-row', 'radar-row-deadline');
    const { rolling, unknown } = listingsWithNoDeadline(api.state);
    await open(page, 'radar');
    await waitForRows(page);
    await expect(rowFor(page, rolling.id).getByTestId('radar-row-deadline')).toHaveText(/rolling/i);
    await expect(rowFor(page, unknown.id).getByTestId('radar-row-deadline')).toHaveText(
      /no (fixed )?deadline/i,
    );
    await expect(byTestId(page, 'radar-feed')).not.toContainText(BROKEN_VALUE);
  });

  test('rolling listings sit in the "No fixed deadline" group on the timeline', async ({
    page,
    api,
  }) => {
    needs('deadlines-page', 'deadlines-no-fixed-group');
    const { rolling } = listingsWithNoDeadline(api.state);
    await open(page, 'deadlines');
    await expect(byTestId(page, 'deadlines-no-fixed-group')).toContainText(rolling.title);
  });

  test('deadline in the past reads "Closed", is capped, and cannot be applied to', async ({
    page,
    api,
  }) => {
    needs(
      'radar-page',
      'radar-row',
      'radar-row-deadline',
      'radar-row-score',
      'listing-drawer',
      'listing-drawer-apply',
    );
    const closed = listingPastDeadline(api.state);
    await open(page, 'radar');
    const row = rowFor(page, closed.id);
    await expect(row.getByTestId('radar-row-deadline')).toHaveText(/closed/i);
    await expect(row.getByTestId('radar-row-deadline')).not.toHaveText(/-\s?\d|ago/);
    expect(await scoreOf(row)).toBeLessThanOrEqual(20);
    const drawer = await openDrawerFor(page, row);
    const apply = drawer.getByTestId('listing-drawer-apply');
    const disabled =
      (await apply.isDisabled()) || (await apply.getAttribute('aria-disabled')) === 'true';
    const labelled = /closed/i.test(await apply.innerText());
    expect(
      disabled || labelled,
      'apply must be disabled or labelled Closed past the deadline',
    ).toBe(true);
  });

  test('duplicate listing across pages (URL differs by tracking params) renders once', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-feed', 'radar-row');
    duplicateListingAcrossPages(api.state);
    await open(page, 'radar');
    await waitForRows(page);
    const feed = byTestId(page, 'radar-feed');
    for (
      let i = 0;
      i < 12 && api.calls('GET', '/v1/feed').filter((r) => r.query.cursor).length === 0;
      i++
    ) {
      await feed.evaluate((el) => {
        const scroller = el.scrollHeight > el.clientHeight ? el : document.scrollingElement!;
        scroller.scrollTop = scroller.scrollHeight;
      });
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(250);
    }
    const second = api.calls('GET', '/v1/feed').find((r) => r.query.cursor);
    expect(second, 'scrolling to the end must request the next page').toBeTruthy();
    // The repeated item is the last one of the previous page: count every id that occurs twice.
    await page.waitForTimeout(300);
    const ids = await rows(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-listing-id')),
    );
    const dupes = ids.filter((id, i) => id && ids.indexOf(id) !== i);
    expect(dupes, `duplicate rows for ${dupes.join(', ')}`).toEqual([]);
  });

  test('very long company names truncate without horizontal scroll (phone and desktop)', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-row', 'radar-row-company');
    const long = veryLongCompanyNames(api.state);
    for (const vp of [VIEWPORTS.phone, VIEWPORTS.desktop]) {
      await page.setViewportSize(vp);
      await open(page, 'radar');
      const row = rowFor(page, long.id);
      await expect(row).toBeVisible();
      expect(
        await horizontalOverflow(page),
        `horizontal scroll at ${vp.width}px`,
      ).toBeLessThanOrEqual(1);
      const box = await row.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      const company = row.getByTestId('radar-row-company');
      const fullName =
        (await company.getAttribute('title')) ??
        (await company.getAttribute('aria-label')) ??
        (await company.textContent());
      expect(
        fullName?.replace(/\s+/g, ' ').trim(),
        'full company name kept for tooltips / screen readers',
      ).toBe(LONG_COMPANY);
    }
  });

  test('emoji in titles render intact in the row and the drawer', async ({ page, api }) => {
    needs('radar-page', 'radar-row', 'radar-row-title', 'listing-drawer-title');
    const emoji = emojiTitles(api.state);
    await open(page, 'radar');
    const row = rowFor(page, emoji.id);
    await expect(row.getByTestId('radar-row-title')).toHaveText(EMOJI_TITLE);
    await expect(page.getByRole('article', { name: EMOJI_TITLE })).toBeVisible();
    const drawer = await openDrawerFor(page, row);
    await expect(drawer.getByTestId('listing-drawer-title')).toHaveText(EMOJI_TITLE);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('0 matches: an empty state with a next action, no skeleton left behind', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-empty', 'radar-skeleton');
    zeroMatches(api.state);
    await open(page, 'radar');
    const empty = byTestId(page, 'radar-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toHaveAttribute(
      'data-variant',
      /^(none|below-threshold|filters|all-triaged)$/,
    );
    await expect(empty.getByRole('button').or(empty.getByRole('link')).first()).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(byTestId(page, 'radar-skeleton')).toHaveCount(0);
  });

  test('5,000 matches: total shown, list virtualised, paging and j/k keep working', async ({
    page,
    api,
  }) => {
    needs('radar-page', 'radar-feed', 'radar-row', 'radar-total');
    fiveThousandMatches(api.state);
    await open(page, 'radar');
    await waitForRows(page);
    await expect(byTestId(page, 'radar-total')).toContainText(/5,000/);
    expect(await rows(page).count(), 'virtualised: fewer than 100 rows mounted').toBeLessThan(100);
    const feed = byTestId(page, 'radar-feed');
    for (let i = 0; i < 6; i++) {
      await feed.evaluate((el) => {
        const scroller = el.scrollHeight > el.clientHeight ? el : document.scrollingElement!;
        scroller.scrollTop = scroller.scrollHeight;
      });
      await page.mouse.wheel(0, 6000);
      await page.waitForTimeout(200);
    }
    await expect
      .poll(() => api.calls('GET', '/v1/feed').filter((r) => r.query.cursor).length)
      .toBeGreaterThan(0);
    expect(await rows(page).count(), 'still virtualised after paging').toBeLessThan(150);
    expect(api.calls('GET', '/v1/feed').every((r) => r.status === 200)).toBe(true);
  });
});

// ── Sources ─────────────────────────────────────────────────────────────────

test.describe('source edge cases', () => {
  async function openAddDialog(page: Page) {
    await open(page, 'sources');
    await byTestId(page, 'sources-add-button').click();
    await expect(byTestId(page, 'source-add-dialog')).toBeVisible();
  }

  test('duplicate source URL with different params: "Already added", no second row', async ({
    page,
    api,
  }) => {
    needs(
      'sources-page',
      'sources-add-button',
      'source-add-dialog',
      'source-add-url',
      'source-add-submit',
      'source-row',
    );
    const url = duplicateSourceUrl(api.state);
    await openAddDialog(page);
    const before = await byTestId(page, 'source-row').count();
    await byTestId(page, 'source-add-url').fill(url);
    await expect(byTestId(page, 'source-detect-result')).toBeVisible();
    await byTestId(page, 'source-add-submit').click();
    await expect(page.getByText(/already added/i).first()).toBeVisible();
    expect(api.calls('POST', '/v1/sources').map((r) => r.status)).toContain(409);
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'source-row')).toHaveCount(before);
  });

  test('redirecting source URL: shows where it resolves and adds it', async ({ page, api }) => {
    needs(
      'sources-page',
      'sources-add-button',
      'source-add-url',
      'source-detect-result',
      'source-add-submit',
      'source-row',
    );
    const { input } = redirectingSource(api.state);
    await openAddDialog(page);
    await byTestId(page, 'source-add-url').fill(input);
    const result = byTestId(page, 'source-detect-result');
    await expect(result).toContainText(/greenhouse/i);
    await expect(result).toContainText(/acmedev|redirects to/i);
    await byTestId(page, 'source-add-submit').click();
    await expect
      .poll(() => api.calls('POST', '/v1/sources').filter((r) => r.status === 201).length)
      .toBe(1);
    await expect(byTestId(page, 'source-row').first()).toContainText(/acme/i);
  });

  test('wrong ATS board token: a clear failure and no silent add', async ({ page, api }) => {
    needs(
      'sources-page',
      'sources-add-button',
      'source-add-url',
      'source-detect-result',
      'source-add-submit',
    );
    const input = wrongAtsToken(api.state);
    await openAddDialog(page);
    await byTestId(page, 'source-add-url').fill(input);
    await expect(byTestId(page, 'source-detect-result')).toContainText(
      /no greenhouse board|couldn.t find/i,
    );
    const submit = byTestId(page, 'source-add-submit');
    const blocked = (await submit.isDisabled()) || /anyway/i.test(await submit.innerText());
    expect(blocked, 'submit must be disabled or an explicit "Add anyway"').toBe(true);
    expect(api.calls('POST', '/v1/sources')).toHaveLength(0);
  });

  test('Firecrawl quota exhausted mid-run: cap banner, paused source, radar keeps working', async ({
    page,
    api,
  }) => {
    needs(
      'sources-page',
      'credit-meter',
      'credit-cap-banner',
      'source-row',
      'radar-page',
      'radar-row',
    );
    const src = crawlSourceNearCap(api.state);
    await open(page, 'sources');
    await expect(byTestId(page, 'credit-meter')).toContainText(/497\s*\/\s*500/);
    await expect(byTestId(page, 'credit-cap-banner')).toHaveCount(0);

    exhaustCredits(api.state); // the worker hit the cap while this tab was open
    await page.reload();
    await expect(byTestId(page, 'credit-cap-banner')).toContainText(/crawl budget is used up/i);
    await expect(byTestId(page, 'credit-meter')).toContainText(/500\s*\/\s*500/);
    const row = page.locator(`[data-testid="source-row"][data-source-id="${src.id}"]`);
    await expect(row).toHaveAttribute('data-health-code', 'paused:credits');
    await expect(row).toContainText(/paused/i);

    await open(page, 'radar');
    await waitForRows(page); // shared packs keep updating
  });
});

// ── Settings and session ────────────────────────────────────────────────────

test.describe('settings edge cases', () => {
  test('user removes their own API key mid-session: key gone, AI falls back', async ({
    page,
    context,
    api,
  }) => {
    needs('settings-page', 'settings-ai-key', 'settings-ai-key-remove', 'settings-ai-status');
    await loginAs(context, api, fixtureUsers.byok);
    await page.goto('/settings/ai');
    await expect(byTestId(page, 'settings-page')).toHaveAttribute('data-tab', 'ai');
    await expect(byTestId(page, 'settings-ai-key')).toContainText('3f9a');
    await byTestId(page, 'settings-ai-key-remove').click();
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: /remove/i });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect.poll(() => api.calls('DELETE', '/v1/settings/ai/key').length).toBe(1);
    await expect(byTestId(page, 'settings-ai-key')).toHaveCount(0);
    await expect(byTestId(page, 'settings-ai-status')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(BROKEN_VALUE);
  });

  test('key removed in another tab: the drawer degrades to rules-only output', async ({
    page,
    context,
    api,
  }) => {
    needs('radar-page', 'radar-row', 'listing-drawer', 'radar-ai-off-note');
    await loginAs(context, api, fixtureUsers.byok);
    await open(page, 'radar');
    await waitForRows(page);
    removeApiKey(api.state);
    const drawer = await openDrawerFor(page, rows(page).first());
    await expect(drawer.getByTestId('radar-ai-off-note')).toBeVisible();
    await expect(drawer).not.toContainText(/tailoring tip/i);
  });

  test('time-zone change re-renders absolute deadlines in the new zone, same instant', async ({
    page,
    api,
  }) => {
    needs(
      'radar-page',
      'radar-row',
      'listing-drawer-deadline',
      'settings-page',
      'settings-timezone',
    );
    setTimezone(api.state, 'Asia/Kolkata');
    await open(page, 'radar');
    await waitForRows(page);
    let drawer = await openDrawerFor(page, rows(page).first());
    const deadline = drawer.getByTestId('listing-drawer-deadline');
    await expect(deadline).toHaveAttribute('data-timezone', 'Asia/Kolkata');
    await expect(deadline).toContainText(/IST|GMT\+5:30|India/);
    const instant = await deadline.getAttribute('data-deadline-at');

    await page.goto('/settings/notifications');
    await expect(byTestId(page, 'settings-page')).toHaveAttribute('data-tab', 'notifications');
    await chooseOption(page, byTestId(page, 'settings-timezone'), /New York/);
    await expect.poll(() => api.state.settings.notifications.timezone).toBe('America/New_York');

    await open(page, 'radar');
    drawer = await openDrawerFor(page, rows(page).first());
    await expect(drawer.getByTestId('listing-drawer-deadline')).toHaveAttribute(
      'data-timezone',
      'America/New_York',
    );
    await expect(drawer.getByTestId('listing-drawer-deadline')).toContainText(
      /E[SD]T|ET\b|GMT-[45]|New York/,
    );
    await expect(drawer.getByTestId('listing-drawer-deadline')).toHaveAttribute(
      'data-deadline-at',
      instant!,
    );
  });
});

test.describe('device time zone differs from the account setting', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('deadlines follow the account time zone, not the laptop clock', async ({ page, api }) => {
    needs('radar-page', 'radar-row', 'listing-drawer-deadline');
    setTimezone(api.state, 'Asia/Kolkata');
    await open(page, 'radar');
    await waitForRows(page);
    const drawer = await openDrawerFor(page, rows(page).first());
    await expect(drawer.getByTestId('listing-drawer-deadline')).toHaveAttribute(
      'data-timezone',
      'Asia/Kolkata',
    );
  });
});

// ── Two tabs ────────────────────────────────────────────────────────────────

test.describe('two browser tabs updating the tracker', () => {
  test('a move in tab A shows up in tab B after it regains focus', async ({
    page,
    context,
    api,
  }) => {
    needs('tracker-page', 'tracker-column', 'tracker-card');
    const pageB = await context.newPage();
    await open(page, 'tracker');
    await open(pageB, 'tracker');
    const item = api.state.tracker.find((t) => t.stage === 'saved')!;
    const cardA = page.locator(`[data-testid="tracker-card"][data-item-id="${item.id}"]`);
    await page.bringToFront();
    await cardA.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => api.calls('POST', `/v1/tracker/${item.id}/move`).length).toBe(1);
    expect(api.state.tracker.find((t) => t.id === item.id)!.stage).toBe('applied');

    await pageB.bringToFront();
    await pageB.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    const cardB = pageB.locator(`[data-testid="tracker-card"][data-item-id="${item.id}"]`);
    await expect(cardB).toHaveAttribute('data-stage', 'applied', { timeout: 10_000 });
    await pageB.close();
  });
});
