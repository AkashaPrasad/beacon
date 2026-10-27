/**
 * Onboarding wizard (USERFLOW §1.3–1.6): resume → preferences → sources → radar, with axe on every
 * step; resume error paths (scanned PDF, wrong type) and the skip path.
 */
import type { Page, TestInfo } from '@playwright/test';

import { expectNoSeriousA11y } from './utils/a11y';
import { loginAs } from './utils/auth';
import { expect, test } from './utils/fixtures';
import { fixtureUsers, resumeScanned, type FixtureUser } from './utils/mock-data';
import { byTestId } from './utils/routes';
import { resumeFile } from './utils/ui';

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


const student: FixtureUser = {
  ...fixtureUsers.newbie,
  id: '0001000000000000000000ob',
  onboardingStep: 'resume',
  aiMode: 'off',
};

test.beforeEach(async ({ context, api, page }) => {
  api.state.profile = null;
  api.state.hasResume = false;
  await loginAs(context, api, student);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('happy path: upload, edit the preview, choose preferences and sources, land on the radar', async ({
  page,
  api,
}, testInfo) => {
  await page.goto('/onboarding/resume');
  const frame = byTestId(page, 'onboarding-page');
  await expect(frame).toHaveAttribute('data-step', 'resume');
  await expect(byTestId(page, 'onboarding-continue')).toBeDisabled();
  await checkA11y(page, testInfo, 'onboarding-resume-empty');

  await byTestId(page, 'resume-file-input').setInputFiles(resumeFile());
  const preview = byTestId(page, 'resume-preview');
  await expect(preview).toHaveAttribute('data-status', 'ready');
  await expect(preview.getByTestId('profile-skill-chip').first()).toBeVisible();

  // Inline edit in the parsed preview: the headline commits on Enter.
  const headline = byTestId(page, 'onboarding-preview-headline');
  await headline.fill('CS undergrad who ships backend side projects');
  await headline.press('Enter');
  await expect(headline).toHaveValue('CS undergrad who ships backend side projects');
  await expect(byTestId(page, 'onboarding-continue')).toBeEnabled();
  await checkA11y(page, testInfo, 'onboarding-resume-parsed');
  await byTestId(page, 'onboarding-continue').click();

  await expect(frame).toHaveAttribute('data-step', 'preferences');
  const patch = api.calls('PATCH', '/v1/profile').at(-1)?.body as { headline?: string };
  expect(patch.headline).toBe('CS undergrad who ships backend side projects');
  const research = page.locator('[data-testid="onboarding-type-card"][data-type="research"]');
  await research.click();
  await expect(research).toHaveAttribute('aria-pressed', 'true');
  await checkA11y(page, testInfo, 'onboarding-preferences');
  await byTestId(page, 'onboarding-continue').click();

  await expect(frame).toHaveAttribute('data-step', 'sources');
  await expect(byTestId(page, 'onboarding-pack-row').first()).toBeVisible();
  await byTestId(page, 'source-add-url').fill('boards.greenhouse.io/stripe');
  const result = byTestId(page, 'source-detect-result');
  await expect(result).toContainText('Detected: Greenhouse board stripe → 142 jobs');
  await byTestId(page, 'source-add-submit').click();
  await expect(byTestId(page, 'onboarding-added-sources')).toBeVisible();
  await expect(result).toHaveCount(0);
  await checkA11y(page, testInfo, 'onboarding-sources');

  await byTestId(page, 'onboarding-continue').click();
  await expect(page).toHaveURL(/\/radar/);
  await expect(byTestId(page, 'radar-page')).toBeVisible();
  expect(api.calls('PATCH', '/v1/me').some((r) => (r.body as { onboardingCompleted?: boolean }).onboardingCompleted)).toBe(true);
});

test('resume errors explain themselves and offer the manual form; skipping reaches the radar', async ({
  page,
  api,
}) => {
  await page.goto('/onboarding/resume');
  await byTestId(page, 'resume-file-input').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a resume'),
  });
  await expect(byTestId(page, 'resume-error')).toContainText('That file is a .png');
  expect(api.calls('POST', '/v1/profile/resume')).toHaveLength(0);

  resumeScanned(api.state);
  await byTestId(page, 'resume-file-input').setInputFiles(resumeFile('scan.pdf'));
  const error = byTestId(page, 'resume-error');
  await expect(error).toContainText(/looks like an image/i);
  await error.getByRole('button', { name: /fill in manually/i }).click();
  await expect(byTestId(page, 'resume-manual-form')).toBeVisible();

  for (const step of ['resume', 'preferences', 'sources'] as const) {
    await expect(byTestId(page, 'onboarding-page')).toHaveAttribute('data-step', step);
    await byTestId(page, 'onboarding-skip').click();
  }
  await expect(byTestId(page, 'radar-page')).toBeVisible();
});
