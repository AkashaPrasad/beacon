/**
 * Viewports used by the QA specs (DESIGN §4 breakpoints: md 768, lg 1024, xl 1280).
 * Projects in playwright.config.ts give the browser engine; specs that need a specific width
 * call `page.setViewportSize(VIEWPORTS.x)` or `test.use({ viewport: VIEWPORTS.x })`.
 */
import { devices, type Page } from '@playwright/test';

export const VIEWPORTS = {
  /** Smallest supported reflow width (WCAG 1.4.10). */
  reflow: { width: 320, height: 640 },
  phone: { width: 375, height: 812 },
  /** iPhone 14 CSS viewport. */
  iphone14: { width: 390, height: 664 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  /** xl: three-pane radar with the push drawer. */
  desktop: { width: 1280, height: 800 },
  wide: { width: 1440, height: 900 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export const MOBILE_DEVICE = devices['iPhone 14'];

export function isMobileWidth(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

/** True when the drawer renders as a modal sheet/dialog (below xl) instead of the push panel. */
export function drawerIsModal(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1280;
}

/** No horizontal page scroll (WCAG 1.4.10 reflow; long company names must not widen the page). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
