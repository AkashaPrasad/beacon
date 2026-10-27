/**
 * Stand-alone runner for the QA specs against the Vite dev server (no build). MSW is on
 * (`VITE_MOCK_API=1`) for `smoke-all.spec.ts`; the page.route specs switch it off per page with
 * `window.__BEACON_E2E__`:
 *
 *   pnpm --filter @kestrel/web exec playwright test --config e2e/utils/playwright.qa.config.ts
 *
 * The main `apps/web/playwright.config.ts` (web-foundation) runs the same specs against the
 * `vite preview` build; this one is for fast local iteration while screens land. Both use the
 * Playwright-side fake API, so neither needs the real API.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.QA_PORT ?? 4180);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: '..',
  testMatch: [
    'smoke-all.spec.ts',
    'edge-cases.spec.ts',
    'a11y.spec.ts',
    'keyboard.spec.ts',
    'offline.spec.ts',
  ],
  outputDir: '../../test-results/qa',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_500 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report/qa' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec vite --port ${PORT} --strictPort`,
        cwd: '../..',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { VITE_API_URL: 'http://localhost:4999', VITE_MOCK_API: '1' },
      },
});
