/**
 * Alerts (DESIGN §6.1 rule builder, USERFLOW §2 push soft ask, §6 empty state): the happy path —
 * empty state → [Create this rule] → soft ask (never on load; the browser prompt only from a click;
 * Home Screen guidance on iPhone) → edit a bracket → save → the card appears → [Send test] toast —
 * plus axe on /alerts (list and builder, light and dark). Runs against the QA Playwright-side fake
 * API (`./utils/mock-api`), so it needs no backend and no MSW worker.
 */
import type { Page } from '@playwright/test';

import type { AlertRule } from '@kestrel/shared';

import { expectNoSeriousA11y } from './utils/a11y';
import { expect, test } from './utils/fixtures';
import type { MockApi } from './utils/mock-api';
import { hexId } from './utils/mock-data';
import { open } from './utils/routes';

const tid = (page: Page, id: string) => page.getByTestId(id);
const cards = (page: Page) => page.getByTestId('alerts-rule');

function seedRule(api: MockApi, patch: Partial<AlertRule> = {}): AlertRule {
  const at = new Date(Date.now() - 5 * 3_600_000);
  const rule: AlertRule = {
    id: hexId(0x55, api.state.alerts.length + 90),
    userId: api.state.session?.id ?? hexId(1, 1),
    name: 'Strong fit internships',
    enabled: true,
    conditions: { minFit: 80, types: ['internship'], maxDeadlineDays: null, locations: [], remote: 'any', keywords: [] },
    channels: ['push', 'inapp'],
    cadence: 'instant',
    digestTime: '08:00',
    digestDay: 1,
    quietHours: null,
    timezone: 'Asia/Kolkata',
    lastTriggeredAt: at,
    createdAt: at,
    updatedAt: at,
    ...patch,
  };
  api.state.alerts.push(rule);
  return rule;
}

/**
 * Web push without a push service: `Notification.requestPermission` grants and counts its calls, and
 * the service-worker registration hands out a fake PushManager subscription.
 */
async function stubPush(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __pushAsks: number };
    w.__pushAsks = 0;
    let state: NotificationPermission = 'default';
    let current: unknown = null;
    const sub = {
      endpoint: 'https://push.example.test/e2e',
      expirationTime: null,
      toJSON: () => ({ endpoint: 'https://push.example.test/e2e', expirationTime: null, keys: { p256dh: 'p256', auth: 'auth' } }),
      unsubscribe: () => Promise.resolve(true),
    };
    const reg = {
      pushManager: { getSubscription: () => Promise.resolve(current), subscribe: () => Promise.resolve((current = sub)) },
    };
    if (typeof Notification !== 'undefined') {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state });
      Notification.requestPermission = () => {
        w.__pushAsks += 1;
        state = 'granted';
        return Promise.resolve(state);
      };
    }
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve(reg) });
      navigator.serviceWorker.getRegistration = () => Promise.resolve(reg as unknown as ServiceWorkerRegistration);
    }
  });
}

const pushAsks = (page: Page) => page.evaluate(() => (window as unknown as { __pushAsks?: number }).__pushAsks ?? 0);

test('create a rule from the sentence → card appears → Send test toast', async ({ page, api, isMobile }) => {
  await stubPush(page);
  await open(page, 'alerts');
  await expect(tid(page, 'alerts-empty')).toContainText('No alert rules.');
  expect(await pushAsks(page), 'never asks for permission on load').toBe(0);

  await page.getByRole('button', { name: 'Create this rule' }).click();
  const dialog = page.getByRole('dialog', { name: 'New alert rule' });
  await expect(dialog).toBeVisible();
  await expect(tid(page, 'alerts-cond-type')).toHaveText(/type is Internship/);
  await expect(tid(page, 'alerts-channel-push')).toHaveAttribute('aria-pressed', 'true');

  if (isMobile) {
    // iPhone Safari outside the Home Screen app: guidance instead of a prompt (USERFLOW §2).
    await expect(tid(page, 'alerts-ios-install')).toContainText('add Beacon to your Home Screen');
    await expect(tid(page, 'push-soft-ask')).toHaveCount(0);
  } else {
    await expect(tid(page, 'push-soft-ask')).toBeVisible();
    expect(await pushAsks(page)).toBe(0);
    await tid(page, 'alerts-push-allow').click();
    await expect(dialog.getByText('Push is on in this browser.')).toBeVisible();
    expect(await pushAsks(page)).toBe(1);
    await expect.poll(() => api.calls('POST', '/v1/push/subscriptions').length).toBe(1);
  }

  // Edit one bracket: fit 80 → 70; the name follows the sentence.
  await tid(page, 'alerts-cond-fit').click();
  await page.getByRole('radio', { name: '70 or more' }).click();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'alerts-cond-fit')).toHaveText(/fit ≥ 70/);
  await expect(tid(page, 'alerts-name')).toHaveValue('Good fit internships');

  await tid(page, 'alerts-save').click();
  await expect(dialog).toBeHidden();
  await expect(cards(page)).toHaveCount(1);
  const card = cards(page).first();
  await expect(card).toContainText('Good fit internships');
  await expect(card).toContainText('fit ≥ 70');
  expect(api.calls('POST', '/v1/alerts')[0]?.body).toMatchObject({
    name: 'Good fit internships',
    enabled: true,
    conditions: { minFit: 70, types: ['internship'], maxDeadlineDays: null, locations: [], remote: 'any', keywords: [] },
    channels: ['push', 'inapp'],
    cadence: 'instant',
    timezone: 'Asia/Kolkata',
  });

  await expect(card).not.toHaveAttribute('data-pending', 'true');
  await card.getByTestId('alerts-test').click();
  await expect(page.getByText(/^Test sent/)).toBeVisible();
  const id = (await card.getAttribute('data-rule-id')) ?? '';
  expect(api.calls('POST', `/v1/alerts/${id}/test`)).toHaveLength(1);
});

test('axe on /alerts: list and builder, light and dark', async ({ page, api }, testInfo) => {
  seedRule(api);
  seedRule(api, { name: 'Hackathons closing soon', enabled: false, cadence: 'weekly', channels: ['inapp'] });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await open(page, 'alerts');
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // The shell (top bar, tab bar) is covered by a11y.spec.ts; this scans what /alerts owns.
  await expectNoSeriousA11y(page, testInfo, 'alerts light', { include: ['[data-testid="alerts-page"]'] });

  await tid(page, 'alerts-new').click();
  await expect(page.getByRole('dialog', { name: 'New alert rule' })).toBeVisible();
  await page.waitForTimeout(250);
  await expectNoSeriousA11y(page, testInfo, 'alerts builder light', { include: ['[data-testid="alerts-builder"]'] });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New alert rule' })).toBeHidden();

  // KNOWN (web-foundation): `cn()` (tailwind-merge without Beacon's font-size scale) drops
  // `text-accent-fg` from every primary <Button> because `text-body` / `text-small` look like colours,
  // so primary labels inherit `fg` (1.3:1 on amber in dark). Excluded here until packages/ui/src/cn.ts
  // extends tailwind-merge; a11y.spec.ts still scans the whole page in dark.
  const primaryButtons = '[data-slot="button"][data-variant="primary"]';
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(300);
  await expectNoSeriousA11y(page, testInfo, 'alerts dark', {
    include: ['[data-testid="alerts-page"]'],
    exclude: [primaryButtons],
  });
  await tid(page, 'alerts-new').click();
  await expect(page.getByRole('dialog', { name: 'New alert rule' })).toBeVisible();
  await page.waitForTimeout(250);
  await expectNoSeriousA11y(page, testInfo, 'alerts builder dark', {
    include: ['[data-testid="alerts-builder"]'],
    exclude: [primaryButtons],
  });
});
