/**
 * `test` for the QA specs: every test gets a fresh fake API (`api`) installed on its browser
 * context before the first navigation, signed in as the default fixture user, with service
 * workers blocked (so neither MSW nor the PWA worker intercepts requests before `page.route`).
 *
 *   import { test, expect } from './utils/fixtures';
 *   test('…', async ({ page, api }) => { api.state.latencyMs = 300; await open(page, 'radar'); });
 */
import { test as base, expect } from '@playwright/test';

import { loginAs } from './auth';
import { MockApi } from './mock-api';
import { createState, fixtureUsers } from './mock-data';
import { pendingReason, type TestId } from './testids';

export interface QaFixtures {
  api: MockApi;
}

export const test = base.extend<QaFixtures>({
  serviceWorkers: 'block',
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  api: [
    async ({ context }, provide) => {
      const api = new MockApi(createState(fixtureUsers.aarav));
      await api.install(context);
      await loginAs(context, api, fixtureUsers.aarav);
      await provide(api);
    },
    { auto: true },
  ],
});

/**
 * Skip the current test while any of these testids is absent from apps/web/src (the screen has
 * not landed). Once an id exists in source, a missing element on the page is a failure.
 */
export function needs(...ids: TestId[]): void {
  const reason = pendingReason(ids);
  test.skip(reason !== null, reason ?? '');
}

export { expect };
