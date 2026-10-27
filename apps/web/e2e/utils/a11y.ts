/**
 * axe-core runner: WCAG 2.0–2.2 A/AA rules, fails only on `serious` and `critical`
 * violations (SPEC §8: "0 serious/critical"), attaches the full result to the test report and
 * prints a readable summary that names the rule, the WCAG criterion, the selector and the fix.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type Violation = AxeResults['violations'][number];

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;
const BLOCKING = new Set(['serious', 'critical']);

export interface A11yOptions {
  /** Restrict the scan to these selectors (default: whole page). */
  include?: string[];
  /** Exclude third-party or intentionally inert regions. */
  exclude?: string[];
  /** Rule ids to disable, each with a reason recorded in the report. */
  disable?: Record<string, string>;
}

export interface A11yResult {
  blocking: Violation[];
  minor: Violation[];
  report: string;
}

function wcagOf(v: Violation): string {
  const sc = v.tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3'));
  return sc.length
    ? `WCAG ${sc.join(', ')}`
    : v.tags.filter((t) => t.startsWith('wcag')).join(', ');
}

export function formatViolations(violations: readonly Violation[], label = ''): string {
  if (violations.length === 0) return `axe ${label}: no serious or critical violations`;
  const lines = [`axe ${label}: ${violations.length} serious/critical violation(s)`];
  for (const v of violations) {
    lines.push(
      ``,
      `[${v.impact ?? 'unknown'}] ${v.id}: ${v.help} (${wcagOf(v)}), ${v.nodes.length} node(s)`,
      `  ${v.helpUrl}`,
    );
    for (const n of v.nodes.slice(0, 5)) {
      const target = n.target
        .map((t) => (Array.isArray(t) ? t.join(' >>> ') : String(t)))
        .join(' ');
      lines.push(`  - ${target}`);
      const why = (n.failureSummary ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      for (const w of why) lines.push(`      ${w}`);
      if (n.html) lines.push(`      html: ${n.html.slice(0, 160)}`);
    }
    if (v.nodes.length > 5) lines.push(`  … ${v.nodes.length - 5} more`);
  }
  return lines.join('\n');
}

export async function runAxe(
  page: Page,
  testInfo: TestInfo,
  label: string,
  opts: A11yOptions = {},
): Promise<A11yResult> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  for (const sel of opts.include ?? []) builder = builder.include(sel);
  // Toasts animate in and out; the sonner region is checked when a toast is the subject.
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  if (opts.disable) builder = builder.disableRules(Object.keys(opts.disable));
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const minor = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
  const report = formatViolations(blocking, label);
  await testInfo.attach(`axe-${label.replace(/[^a-z0-9-]+/gi, '-')}.json`, {
    body: JSON.stringify(
      {
        url: page.url(),
        disabled: opts.disable ?? {},
        violations: results.violations,
        incomplete: results.incomplete.length,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  if (minor.length) {
    testInfo.annotations.push({
      type: 'axe-minor',
      description: `${label}: ${minor.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`,
    });
  }
  return { blocking, minor, report };
}

/** Assert 0 serious/critical violations; the failure message is the readable report. */
export async function expectNoSeriousA11y(
  page: Page,
  testInfo: TestInfo,
  label: string,
  opts: A11yOptions = {},
): Promise<void> {
  const { blocking, report } = await runAxe(page, testInfo, label, opts);
  expect(blocking.length, report).toBe(0);
}

/**
 * The focused element is not <body>, and shows a visible indicator: an outline, a box-shadow
 * ring, or (inside roving lists) `data-active="true"` with a visible outline on the row.
 */
export async function expectFocusVisible(page: Page, context = ''): Promise<void> {
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement)
      return { ok: false, why: 'focus is on <body>', desc: '' };
    const tid = el.getAttribute('data-testid') ?? '';
    const label = el.getAttribute('aria-label') ?? '';
    const desc = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${tid ? `[data-testid=${tid}]` : ''}${label ? `[aria-label="${label}"]` : ''}`;
    const visible = (node: Element) => {
      const cs = getComputedStyle(node);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const ring = cs.boxShadow !== 'none' && cs.boxShadow !== '';
      return outline || ring;
    };
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0)
      return { ok: false, why: 'focused element has no size', desc };
    if (visible(el)) return { ok: true, why: '', desc };
    // Composite widgets may draw the ring on a wrapper (e.g. input inside an input group).
    const wrapper = el.closest(
      '[data-focus-ring], [data-slot="input-group"], [data-active="true"]',
    );
    if (wrapper && visible(wrapper)) return { ok: true, why: '', desc };
    return { ok: false, why: 'no outline or ring on the focused element', desc };
  });
  expect(
    info.ok,
    `focus not visible ${context ? `(${context})` : ''}: ${info.why} ${info.desc}`,
  ).toBe(true);
}
