// Screenshot the redesign reference screens (dark + light, desktop + phone) against the mock-API dev server.
//   node e2e/utils/redesign-shots.mjs http://localhost:5199 ../../docs/ux-audit/redesign
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5199';
const out = resolve(process.argv[3] ?? '../../docs/ux-audit/redesign');
mkdirSync(out, { recursive: true });

const ROUTES = [
  ['login', '/login', false],
  ['welcome', '/welcome', true],
  ['radar', '/radar', true],
  ['radar-list', '/radar?view=list', true],
  ['listing', '/radar/lst_01_fullstack_intern', true],
  ['deadlines', '/deadlines', true],
  ['admin', '/admin', true],
  ['me', '/me', true],
];
const VIEWPORTS = [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['phone', { ...devices['iPhone 14'] }],
];
const browser = await chromium.launch();
for (const [vpName, vp] of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...vp, colorScheme: theme });
    await ctx.addInitScript((t) => {
      localStorage.setItem('beacon:mock:session', '1');
      localStorage.setItem('beacon:mock:user', 'admin');
      localStorage.setItem('beacon:mock:onboarding', 'done');
      localStorage.setItem(
        'beacon:appearance',
        JSON.stringify({
          theme: t,
          accent: 'cobalt',
          density: 'comfortable',
          fontSize: 'md',
          motion: 'system',
        }),
      );
    }, theme);
    const page = await ctx.newPage();
    for (const [name, path, needsAuth] of ROUTES) {
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate((t) => {
          const el = document.documentElement;
          el.classList.toggle('dark', t === 'dark');
          el.classList.toggle('light', t === 'light');
          el.setAttribute('data-theme', t);
        }, theme);
        await page.waitForTimeout(900);
        const file = `${out}/${name}-${vpName}-${theme}.png`;
        await page.screenshot({ path: file, fullPage: name !== 'radar' });
        console.log(
          'ok ',
          file.replace(out + '/', ''),
          page.url().replace(base, ''),
          needsAuth ? '' : '(public)',
        );
      } catch (e) {
        console.log('ERR', name, vpName, theme, String(e).split('\n')[0]);
      }
    }
    await ctx.close();
  }
}
await browser.close();
