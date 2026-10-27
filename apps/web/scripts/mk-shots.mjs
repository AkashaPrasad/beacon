// Scrolls the public home page and captures viewport screenshots at fixed offsets (design review).
import { chromium } from '@playwright/test';

const base = process.env.BASE ?? 'http://localhost:5199';
const out = process.env.OUT ?? '../../docs/ux-audit/marketing';
const browser = await chromium.launch();
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: 'light' });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const stops = [0, 0.12, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  for (const s of stops) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: 'instant' }),
      Math.round((total - h) * s),
    );
    await page.waitForTimeout(900);
    await page.screenshot({
      path: `${out}/home-${name}-${String(Math.round(s * 100)).padStart(3, '0')}.png`,
    });
  }
  await page.close();
}
await browser.close();
