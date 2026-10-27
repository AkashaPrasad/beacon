/** Profile (DESIGN §6.1): inline edit with optimistic save + undo, skills, recruiter preview, axe. */
import type { Page, TestInfo } from '@playwright/test';

import { expectNoSeriousA11y } from './utils/a11y';
import { expect, test } from './utils/fixtures';
import { byTestId, open } from './utils/routes';

/**
 * Two shell controls (web-foundation) fail WCAG 2.5.3 label-in-name today: the search button and the
 * avatar menu. They are reported in docs/SHARED-REQUESTS.md; these specs check this screen's own UI.
 */
const SHELL_PENDING = { exclude: ['[data-testid="global-search"]', '[data-testid="user-menu"]'] };
const checkA11y = async (page: Page, info: TestInfo, label: string) => {
  // Let entrance fades finish (reduced motion keeps opacity crossfades): axe reads mid-fade text as low contrast.
  await page.waitForTimeout(300);
  await expectNoSeriousA11y(page, info, label, SHELL_PENDING);
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('edit the headline inline, undo it, remove a skill, preview what recruiters see', async ({
  page,
  api,
}, testInfo) => {
  await open(page, 'profile');
  const headline = byTestId(page, 'profile-headline');
  await expect(headline).toBeVisible();
  const before = await headline.inputValue();
  await checkA11y(page, testInfo, 'profile-edit');

  await headline.fill('Backend-leaning CS ’27, Go and Postgres');
  await headline.press('Enter');
  await expect.poll(() => api.calls('PATCH', '/v1/profile').length).toBe(1);
  expect((api.calls('PATCH', '/v1/profile')[0]!.body as { headline: string }).headline).toBe(
    'Backend-leaning CS ’27, Go and Postgres',
  );

  // The undo toast restores the previous headline (a second PATCH with the old value).
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => api.calls('PATCH', '/v1/profile').length).toBe(2);
  await expect(headline).toHaveValue(before);

  const chips = byTestId(page, 'profile-skill-chip');
  const count = await chips.count();
  const name = await chips.first().getAttribute('data-skill');
  await chips.first().getByTestId('profile-skill-remove').click();
  await expect(chips).toHaveCount(count - 1);
  await expect(page.getByText(`Removed ${name ?? ''}.`)).toBeVisible();

  await byTestId(page, 'profile-view-preview').click();
  await expect(byTestId(page, 'profile-recruiter-preview')).toBeVisible();
  await expect(byTestId(page, 'profile-editor')).toHaveCount(0);
  await checkA11y(page, testInfo, 'profile-preview');
});
