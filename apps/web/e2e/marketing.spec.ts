/**
 * Public site: every page renders (prerendered + hydrated) without console errors, nav and footer
 * links resolve, the source directory searches, and axe finds no serious/critical violations.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', testId: 'landing-page', title: /Every opportunity that fits you/ },
  { path: '/features', testId: 'features-page', title: /Features · Beacon/ },
  { path: '/how-it-works', testId: 'how-it-works-page', title: /How it works · Beacon/ },
  { path: '/packs', testId: 'sources-directory-page', title: /Sources · Beacon/ },
  { path: '/pricing', testId: 'pricing-page', title: /Pricing · Beacon/ },
  { path: '/about', testId: 'about-page', title: /About · Beacon/ },
  { path: '/privacy', testId: 'privacy-page', title: /Privacy · Beacon/ },
  { path: '/terms', testId: 'terms-page', title: /Terms · Beacon/ },
  { path: '/this-page-does-not-exist', testId: 'not-found-page', title: /Beacon/ },
] as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Favicon lookups for fictional `.example` domains and blocked service workers are expected here.
    if (/favicon|s2\/favicons|service worker|ServiceWorker|WebGL/i.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

for (const p of PAGES) {
  test(`${p.path} renders, is titled and passes axe`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      (window as unknown as { __BEACON_E2E__: boolean }).__BEACON_E2E__ = true;
    });
    await page.goto(p.path);
    await expect(page.getByTestId(p.testId)).toBeVisible();
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator('#main')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('canvas')
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('nav and footer links resolve', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const internal = await page
    .locator('footer a')
    .evaluateAll((as) =>
      as.map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/')),
    );
  expect(internal.length).toBeGreaterThan(5);
  for (const href of internal) {
    const res = await page.request.get(href);
    expect(res.status(), href).toBeLessThan(400);
  }
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const label of ['Features', 'How it works', 'Sources', 'Pricing', 'About']) {
    const link = nav.getByRole('link', { name: label });
    if (await link.isVisible()) {
      await link.click();
      await expect(page.locator('#main')).toBeVisible();
      await expect(page).not.toHaveURL(/\/$/);
      await page.goto('/');
    }
  }
});

test('home: hero CTAs and proof strip are present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hero-cta')).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: /See how it works/ })).toHaveAttribute(
    'href',
    '#how',
  );
  await expect(page.getByText('sources watched')).toBeVisible();
  await expect(page.getByTestId('finale-cta')).toBeAttached();
});

test('source directory searches and filters', async ({ page }) => {
  await page.goto('/packs');
  const search = page.getByTestId('sources-directory-search');
  await search.fill('razorpay');
  await expect(page.getByTestId('sources-directory-list')).toContainText(/Razorpay/i);
  await search.fill('zzzz-no-such-source');
  await expect(page.getByText('Nothing matches that yet.')).toBeVisible();
  await search.fill('');
  await page.getByRole('button', { name: /Hackathons — India/ }).click();
  await expect(page.getByText(/of \d+ sources/)).toBeVisible();
});

test('mobile menu opens and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone project only');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.locator('#mk-menu').getByRole('link', { name: 'Pricing' }).click();
  await expect(page.getByTestId('pricing-page')).toBeVisible();
});
