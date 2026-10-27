/** Settings (DESIGN §10.6): tab routing, appearance, bring-your-own-key, notifications, privacy; axe per tab. */
import type { Page, TestInfo } from '@playwright/test';

import { expectNoSeriousA11y } from './utils/a11y';
import { expect, test } from './utils/fixtures';
import { byTestId } from './utils/routes';

/**
 * Two shell controls (web-foundation) fail WCAG 2.5.3 label-in-name today: the search button and the
 * avatar menu. They are reported in docs/SHARED-REQUESTS.md; these specs check this screen's own UI.
 */
const SHELL_PENDING = { exclude: ['[data-testid="global-search"]', '[data-testid="user-menu"]'] };
const checkA11y = async (page: Page, info: TestInfo, label: string) => {
  // Let the 1.5 s "Saved" caption fade out first: axe reads mid-fade text as low contrast.
  await expect(page.getByTestId('settings-saved')).toHaveCount(0, { timeout: 4000 });
  await page.waitForTimeout(300);
  await expectNoSeriousA11y(page, info, label, SHELL_PENDING);
};


const KEY = 'sk-test-0000-secret-9b2f';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('tabs route, appearance applies, a key is saved without ever being shown, toggles save', async ({
  page,
  api,
}, testInfo) => {
  await page.goto('/settings');
  const root = byTestId(page, 'settings-page');
  await expect(root).toHaveAttribute('data-tab', 'appearance');
  await checkA11y(page, testInfo, 'settings-appearance');

  // Theme applies on the same frame and syncs to the account (debounced).
  await page.locator('[data-testid="settings-theme-option"][data-value="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => api.state.settings.appearance.theme).toBe('dark');

  // AI & keys: bring your own key.
  await byTestId(page, 'settings-tab-ai').click();
  await expect(page).toHaveURL(/\/settings\/ai$/);
  await expect(root).toHaveAttribute('data-tab', 'ai');
  await expect(byTestId(page, 'settings-ai-status')).toBeVisible();
  await byTestId(page, 'settings-ai-choice-byok').click();
  const input = byTestId(page, 'settings-ai-key-input');
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill(KEY);
  await byTestId(page, 'settings-ai-test').click();
  await expect(byTestId(page, 'settings-ai-test-result')).toContainText('Works');
  await byTestId(page, 'settings-ai-save').click();
  await expect(byTestId(page, 'settings-ai-key')).toContainText('••••9b2f');
  await expect(page.locator('body')).not.toContainText(KEY);
  const put = api.calls('PUT', '/v1/settings/ai')[0]!.body as { apiKey: string; provider: string };
  expect(put).toMatchObject({ apiKey: KEY, provider: 'openai' });
  await checkA11y(page, testInfo, 'settings-ai');

  // Notifications: switches and the time zone save on change.
  await byTestId(page, 'settings-tab-notifications').click();
  await expect(root).toHaveAttribute('data-tab', 'notifications');
  await byTestId(page, 'settings-inapp').click();
  await expect.poll(() => api.state.settings.notifications.inapp).toBe(false);
  await byTestId(page, 'settings-timezone').selectOption('America/New_York');
  await expect.poll(() => api.state.settings.notifications.timezone).toBe('America/New_York');
  await expect(byTestId(page, 'settings-push-state')).toBeVisible();
  await checkA11y(page, testInfo, 'settings-notifications');

  // Privacy: export downloads a JSON file; delete needs DELETE typed.
  await byTestId(page, 'settings-tab-privacy').click();
  await expect(root).toHaveAttribute('data-tab', 'privacy');
  const download = page.waitForEvent('download');
  await byTestId(page, 'settings-export').click();
  expect((await download).suggestedFilename()).toMatch(/^beacon-export-\d{4}-\d{2}-\d{2}\.json$/);
  await byTestId(page, 'settings-delete-account').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(byTestId(page, 'settings-delete-confirm')).toBeDisabled();
  await checkA11y(page, testInfo, 'settings-privacy-dialog');
  await byTestId(page, 'settings-delete-confirm-input').fill('DELETE');
  await expect(byTestId(page, 'settings-delete-confirm')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await checkA11y(page, testInfo, 'settings-privacy');
});
