/** Notification centre (DESIGN §6.1, USERFLOW §6): day groups, unread dots, mark all read, navigation, empty state, axe. */
import type { Page, TestInfo } from '@playwright/test';

import { expectNoSeriousA11y } from './utils/a11y';
import { expect, test } from './utils/fixtures';
import { daysFromNow, sampleNotification } from './utils/mock-data';
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

test('grouped by day; mark all read clears the dots; an item opens what it is about', async ({
  page,
  api,
}, testInfo) => {
  sampleNotification(api.state, { kind: 'nudge', title: 'No reply from Kaveri Labs in 10 days', body: 'A short follow-up often gets one.', listingId: null, url: '/tracker', createdAt: daysFromNow(-3) });
  sampleNotification(api.state, { kind: 'match', title: 'Good fit: Data Analyst Intern', body: 'Acme Analytics · Fit 72', createdAt: daysFromNow(-1.2), readAt: daysFromNow(-1) });
  sampleNotification(api.state);

  await open(page, 'notifications');
  await expect(byTestId(page, 'notifications-list')).toBeVisible();
  await expect(byTestId(page, 'notifications-day')).toHaveCount(3);
  await expect(byTestId(page, 'notifications-day').first()).toContainText('Today');
  await expect(byTestId(page, 'notifications-unread-dot')).toHaveCount(2);
  await checkA11y(page, testInfo, 'notifications');

  await byTestId(page, 'notifications-mark-all').click();
  await expect(byTestId(page, 'notifications-unread-dot')).toHaveCount(0);
  await expect(byTestId(page, 'notifications-unread-count')).toHaveText('all read');
  expect(api.calls('POST', '/v1/notifications/read')[0]!.body).toEqual({ all: true });

  await page.getByRole('button', { name: /No reply from Kaveri Labs/ }).click();
  await expect(page).toHaveURL(/\/tracker$/);
});

test('empty state per USERFLOW §6', async ({ page, api }, testInfo) => {
  api.state.notifications = [];
  await open(page, 'notifications');
  const empty = byTestId(page, 'notifications-empty');
  await expect(empty).toContainText('All caught up.');
  await expect(empty).toContainText('Deadline reminders and nudges will show up here.');
  await checkA11y(page, testInfo, 'notifications-empty');
});
