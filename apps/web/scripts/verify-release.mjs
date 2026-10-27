/** Run against the mock server: node scripts/verify-release.mjs http://127.0.0.1:4180 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import AxeBuilder from '@axe-core/playwright';
import { chromium, webkit, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4180';
const out = resolve(process.argv[3] ?? '../../.impeccable/review');
await mkdir(out, { recursive: true });
const allRoutes = [
  '/radar',
  '/radar?view=list',
  '/radar/lst_01_fullstack_intern',
  '/deadlines',
  '/sources',
  '/sources/packs',
  '/alerts',
  '/alerts/new',
  '/tracker',
  '/profile',
  '/settings/appearance',
  '/settings/ai',
  '/settings/notifications',
  '/settings/privacy',
  '/notifications',
  '/admin',
  '/me',
];
const routes = process.env.RELEASE_ROUTES ? process.env.RELEASE_ROUTES.split(',') : allRoutes;
const results = [];
for (const [name, engine, device] of [
  ['desktop', chromium, { viewport: { width: 1440, height: 900 } }],
  ['mobile', webkit, devices['iPhone 14']],
]) {
  const browser = await engine.launch();
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      ...device,
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    await context.addInitScript((theme) => {
      localStorage.setItem('beacon:mock:session', '1');
      localStorage.setItem('beacon:mock:user', 'admin');
      localStorage.setItem('beacon:mock:onboarding', 'done');
      localStorage.setItem(
        'beacon:appearance',
        JSON.stringify({
          theme,
          accent: 'amber',
          motion: 'reduced',
          density: 'comfortable',
          fontSize: 'md',
        }),
      );
    }, theme);
    const page = await context.newPage();
    for (const route of routes) {
      const errors = [];
      const onError = (error) => errors.push(error.message);
      page.on('pageerror', onError);
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - innerWidth),
      );
      const failures = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        }));
      const result = { device: name, theme, route, overflow, errors, violations: failures };
      results.push(result);
      console.log(
        failures.length || overflow || errors.length ? 'FAIL' : 'PASS',
        name,
        theme,
        route,
        JSON.stringify({ overflow, errors, violations: failures }),
      );
      if (['/radar', '/sources', '/tracker', '/settings/appearance'].includes(route)) {
        const file =
          route === '/radar' && theme === 'light'
            ? `${name}.png`
            : `${route.slice(1).replaceAll('/', '-')}-${name}-${theme}.png`;
        await page.screenshot({ path: resolve(out, file) });
      }
      page.off('pageerror', onError);
    }
    await context.close();
  }
  await browser.close();
}
await writeFile(resolve(out, 'accessibility.json'), JSON.stringify(results, null, 2));
if (results.some((r) => r.overflow || r.errors.length || r.violations.length)) process.exitCode = 1;
