/**
 * Stand-alone runner for the QA suites, independent of other agents' servers and builds.
 *
 *   # Vite dev server on :4180, MSW on, HMR off (fast loop while screens land):
 *   pnpm --filter @kestrel/web exec playwright test --config e2e/utils/playwright.qa.config.ts \
 *     e2e/smoke-all.spec.ts e2e/a11y.spec.ts --project=chromium --project=mobile
 *
 *   # Production mock build (`VITE_MOCK_API=1 vite build` + prerender), copied to a private
 *   # folder and served by `vite preview` on :4181, so a concurrent build cannot swap chunks
 *   # under a running test:
 *   QA_PREVIEW=1 pnpm --filter @kestrel/web exec playwright test --config e2e/utils/playwright.qa.config.ts …
 *
 * The main `apps/web/playwright.config.ts` (web-foundation) runs the same specs against its own
 * `vite preview` on :4173. `smoke-all` and `a11y` use the app's MSW mock (service workers allowed
 * per spec); the older QA specs bring the Playwright-side fake API (`e2e/utils/mock-api.ts`).
 */
import { defineConfig, devices } from '@playwright/test';

const preview = process.env.QA_PREVIEW === '1';
const PORT = Number(process.env.QA_PORT ?? (preview ? 4181 : 4180));
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const QA_DIST = 'node_modules/.cache/beacon-qa-dist';

const env = {
  VITE_MOCK_API: '1',
  VITE_API_URL: 'http://localhost:4999',
  VITE_GOOGLE_CLIENT_ID: 'e2e-client-id.apps.googleusercontent.com',
  VITE_WEB_URL: baseURL,
};

export default defineConfig({
  testDir: '..',
  testMatch: [
    'smoke-all.spec.ts',
    'a11y.spec.ts',
    'edge-cases.spec.ts',
    'keyboard.spec.ts',
    'offline.spec.ts',
  ],
  outputDir: '../../test-results/qa',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.QA_WORKERS ?? 4),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '../../test-results/qa/results.json' }],
    ['html', { open: 'never', outputFolder: '../../playwright-report/qa' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
    : preview
      ? {
          command: [
            'pnpm exec vite build',
            'node scripts/prerender.mjs',
            `rm -rf ${QA_DIST}`,
            `mkdir -p ${QA_DIST}`,
            `cp -R dist/. ${QA_DIST}/`,
            `pnpm exec vite preview --outDir ${QA_DIST} --port ${PORT} --strictPort`,
          ].join(' && '),
          cwd: '../..',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 300_000,
          stdout: 'ignore',
          stderr: 'pipe',
          env,
        }
      : {
          command: `pnpm exec vite --config e2e/utils/vite.qa.config.ts --port ${PORT} --strictPort`,
          cwd: '../..',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          env,
        },
});
