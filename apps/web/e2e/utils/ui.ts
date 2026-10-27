/**
 * Small UI helpers shared by the QA specs: row lookup, drawer, file fixtures, option pickers.
 * Everything here goes through roles or the documented testids (docs/TESTIDS.md).
 */
import { expect, type Locator, type Page } from '@playwright/test';

export const rows = (page: Page): Locator => page.getByTestId('radar-row');

export const rowFor = (page: Page, listingId: string): Locator =>
  page.locator(`[data-testid="radar-row"][data-listing-id="${listingId}"]`);

export const activeRow = (page: Page): Locator =>
  page.locator('[data-testid="radar-row"][data-active="true"]');

export async function waitForRows(page: Page, min = 1): Promise<void> {
  await expect(rows(page).nth(min - 1), `expected at least ${min} radar row(s)`).toBeVisible({
    timeout: 15_000,
  });
}

/** Open the detail drawer for a row by clicking its title (mouse path; keyboard specs use Enter). */
export async function openDrawerFor(page: Page, row: Locator): Promise<Locator> {
  await row.getByTestId('radar-row-title').click();
  const drawer = page.getByTestId('listing-drawer');
  await expect(drawer).toBeVisible();
  return drawer;
}

/** The fit number inside a score ring ("86 Strong fit" → 86). */
export async function scoreOf(row: Locator): Promise<number> {
  const text = (await row.getByTestId('radar-row-score').innerText()).replace(/\s+/g, ' ');
  const m = /\d{1,3}/.exec(text);
  if (!m) throw new Error(`no number in score ring text "${text}"`);
  return Number(m[0]);
}

/** Text that must never reach the screen from bad date/number handling. */
export const BROKEN_VALUE = /\bNaN\b|Invalid Date|undefined|\bnull\b|\[object Object\]/;

// ── Files ───────────────────────────────────────────────────────────────────

/** A tiny but structurally valid one-page PDF with a text layer. */
export function pdfBytes(text = 'Aarav Sharma — B.Tech Computer Science, 2027'): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

export const resumeFile = (name = 'resume.pdf', text?: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: pdfBytes(text),
});

/** A PDF-looking file of `mb` megabytes (header + padding), for size-limit checks. */
export function bigPdf(mb: number) {
  const buf = Buffer.alloc(mb * 1024 * 1024, 0x20);
  buf.write('%PDF-1.4\n', 0, 'latin1');
  return { name: `resume-${mb}mb.pdf`, mimeType: 'application/pdf', buffer: buf };
}

// ── Controls ────────────────────────────────────────────────────────────────

/**
 * Pick an option from a native <select>, a Radix Select, or a combobox, by visible text.
 * Works for the time-zone control whichever primitive the settings screen used.
 */
export async function chooseOption(
  page: Page,
  control: Locator,
  option: string | RegExp,
): Promise<void> {
  const tag = await control.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    const value = await control.evaluate(
      (el, opt) => {
        const re = typeof opt === 'string' ? null : new RegExp(opt.source, opt.flags);
        const o = [...(el as HTMLSelectElement).options].find((x) =>
          re ? re.test(x.text) : x.text.includes(opt as string) || x.value === opt,
        );
        return o?.value ?? null;
      },
      typeof option === 'string' ? option : { source: option.source, flags: option.flags },
    );
    if (!value) throw new Error(`no <option> matching ${String(option)}`);
    await control.selectOption(value);
    return;
  }
  const input = tag === 'input' ? control : control.locator('input').first();
  await control.click();
  if ((await input.count()) > 0 && (await input.isEditable())) {
    await input.fill(typeof option === 'string' ? option : option.source.replace(/\\/g, ''));
  }
  await page.getByRole('option', { name: option }).first().click();
}

/**
 * Ask the app to refetch the way a returning tab does (visibilitychange + focus). Data-layer
 * staleness rules still apply; specs that must see new data use `page.reload()`.
 */
export async function simulateTabReturn(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

/** ⌘K on macOS, Ctrl+K elsewhere (Playwright resolves ControlOrMeta per platform). */
export const PALETTE_SHORTCUT = 'ControlOrMeta+k';
