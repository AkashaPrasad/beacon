/**
 * End-to-end tests (Playwright) against the production build served by `vite preview` on :4173.
 *
 *   pnpm --filter @kestrel/web test:e2e                 # builds (mock mode) + previews automatically
 *   E2E_BASE_URL=https://beacon.spacesdrive.cc pnpm --filter @kestrel/web test:e2e   # any deployed build
 *
 * The build is made with `VITE_MOCK_API=1`, so pages work without a backend (MSW), but every spec in
 * e2e/ brings a Playwright-side fake API (`page.route`) and sets `window.__BEACON_E2E__`, which keeps
 * MSW off; service workers are blocked so nothing intercepts requests before `page.route`.
 * Projects: Desktop Chrome, Desktop Safari, iPhone 14 (WebKit).
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_500 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // No `tsc` here: type errors are the lint/typecheck gate's job, not a reason to skip e2e.
        command: `pnpm exec vite build && node scripts/prerender.mjs && pnpm exec vite preview --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          VITE_MOCK_API: '1',
          // Any value works: the fake API matches `/v1/` on any origin.
          VITE_API_URL: 'http://localhost:4000',
          VITE_GOOGLE_CLIENT_ID: 'e2e-client-id.apps.googleusercontent.com',
          VITE_WEB_URL: baseURL,
        },
      },
});
