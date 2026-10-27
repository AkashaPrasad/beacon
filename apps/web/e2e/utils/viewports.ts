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

export interface OverflowReport {
  /** scrollWidth − clientWidth of the document, in CSS px (0 = no horizontal page scroll). */
  overflow: number;
  /** The widest elements that stick out past the right edge, for the failure message. */
  offenders: string[];
}

/**
 * Horizontal overflow with the culprits named: elements whose right edge passes the viewport,
 * ignoring ones inside a horizontally scrollable container (carousels, tables) or clipped by an
 * `overflow: hidden` ancestor, and anything `position: fixed` off-canvas (closed sheets).
 */
export async function overflowReport(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    if (overflow <= 0) return { overflow: 0, offenders: [] };
    const vw = doc.clientWidth;
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return true;
        if (cs.position === 'fixed') return true;
      }
      return false;
    };
    const describe = (el: Element) => {
      const tid = el.getAttribute('data-testid');
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.');
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
      return `${el.tagName.toLowerCase()}${tid ? `[data-testid=${tid}]` : ''}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
    };
    const offenders: { right: number; desc: string }[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      if (getComputedStyle(el).position === 'fixed' || clipped(el)) continue;
      offenders.push({ right: Math.round(r.right), desc: describe(el) });
    }
    offenders.sort((a, b) => b.right - a.right);
    return {
      overflow,
      offenders: offenders.slice(0, 5).map((o) => `${o.desc} (right edge ${o.right}px > ${vw}px)`),
    };
  });
}
