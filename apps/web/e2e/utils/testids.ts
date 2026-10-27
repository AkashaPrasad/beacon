/**
 * The `data-testid` contract between the screen agents and the QA specs.
 *
 * - Ids are kebab-case `<feature>-<element>` (docs/TESTIDS.md).
 * - Repeated elements share one id and carry their identity in `data-*` attributes
 *   (`radar-row` + `data-listing-id`), never in the id itself.
 * - Specs call `missingTestIds([...])` and `test.skip()` only when an id is not yet in
 *   `apps/web/src` at all (the screen has not landed). An id that exists in source but not
 *   on the page is a real failure, never a skip.
 *
 * Run `node apps/web/e2e/utils/testids.ts` to print the status table for docs/TESTIDS.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TestIdOwner = 'web-foundation' | 'web-onboarding' | 'web-radar' | 'web-workspace';

export interface TestIdSpec {
  id: string;
  owner: TestIdOwner;
  /** What the element is, plus the data-attributes the specs read. */
  note: string;
}

export const TESTIDS = [
  // ── Shell (foundation) ────────────────────────────────────────────────────
  {
    id: 'app-shell',
    owner: 'web-foundation',
    note: 'Root of the signed-in layout (top bar + content)',
  },
  {
    id: 'offline-banner',
    owner: 'web-foundation',
    note: 'Top strip, copy #22; rendered only while offline',
  },
  { id: 'command-palette', owner: 'web-foundation', note: 'Palette dialog (⌘K / Ctrl K)' },
  { id: 'command-palette-input', owner: 'web-foundation', note: 'Palette search input' },
  { id: 'shortcuts-sheet', owner: 'web-foundation', note: 'Keyboard shortcut sheet (`?`)' },
  {
    id: 'notifications-bell',
    owner: 'web-foundation',
    note: 'Top-bar bell button; unread count as text',
  },
  { id: 'user-menu', owner: 'web-foundation', note: 'Avatar menu trigger' },
  { id: 'route-error', owner: 'web-foundation', note: 'Route error boundary; has a Retry button' },
  { id: 'not-found-page', owner: 'web-foundation', note: '404 route' },
  { id: 'notifications-page', owner: 'web-foundation', note: 'Notification centre route (`/notifications`)' },
  { id: 'auth-callback-page', owner: 'web-onboarding', note: '`/auth/callback` while the code is exchanged' },

  // ── Landing, sign-in, consent, onboarding ─────────────────────────────────
  { id: 'landing-page', owner: 'web-onboarding', note: 'Public landing root (`/`)' },
  { id: 'login-page', owner: 'web-onboarding', note: 'Sign-in page root (`/login`)' },
  {
    id: 'google-sign-in',
    owner: 'web-onboarding',
    note: '[Continue with Google] (landing and /login)',
  },
  {
    id: 'auth-error',
    owner: 'web-onboarding',
    note: 'Sign-in error / cancelled message with [Try again]',
  },
  { id: 'consent-page', owner: 'web-onboarding', note: 'One-screen consent (USERFLOW §1.2)' },
  {
    id: 'consent-continue',
    owner: 'web-onboarding',
    note: '[Continue]; disabled until a choice is made',
  },
  {
    id: 'onboarding-page',
    owner: 'web-onboarding',
    note: 'Wizard frame; `data-step` = resume | preferences | sources',
  },
  {
    id: 'onboarding-continue',
    owner: 'web-onboarding',
    note: 'Primary [Continue] / [Start my radar]',
  },
  { id: 'onboarding-skip', owner: 'web-onboarding', note: '[Skip for now]' },
  {
    id: 'resume-dropzone',
    owner: 'web-onboarding',
    note: 'Drop zone; contains the `<input type=file>`',
  },
  {
    id: 'resume-file-input',
    owner: 'web-onboarding',
    note: 'The file input itself (may be visually hidden)',
  },
  { id: 'resume-preview', owner: 'web-onboarding', note: 'Parsed preview column' },
  {
    id: 'resume-warning',
    owner: 'web-onboarding',
    note: 'Parser warning line(s), e.g. "No skills section found"',
  },
  {
    id: 'resume-error',
    owner: 'web-onboarding',
    note: 'Upload/parse error (scanned PDF, too large, wrong type)',
  },
  { id: 'resume-manual-form', owner: 'web-onboarding', note: 'Manual fallback form' },
  {
    id: 'resume-gradyear-input',
    owner: 'web-onboarding',
    note: 'Graduation year field (inline required when not parsed)',
  },
  { id: 'resume-skill-input', owner: 'web-onboarding', note: 'Skills combobox input' },
  {
    id: 'onboarding-pack-row',
    owner: 'web-onboarding',
    note: 'Pack row in step 3; `data-pack-id`',
  },

  // ── Radar + drawer ────────────────────────────────────────────────────────
  { id: 'radar-page', owner: 'web-radar', note: 'Radar route root' },
  {
    id: 'radar-feed',
    owner: 'web-radar',
    note: '`role="feed"` container; `aria-busy` while loading',
  },
  {
    id: 'radar-row',
    owner: 'web-radar',
    note: '`article` per listing; `data-listing-id`, `data-active` (cursor), `data-saved`, `data-hidden`, `data-pending` (queued offline)',
  },
  {
    id: 'radar-row-title',
    owner: 'web-radar',
    note: 'Title text inside a row (full title in `title` attr when truncated)',
  },
  {
    id: 'radar-row-company',
    owner: 'web-radar',
    note: 'Company text inside a row (full name in `title` attr when truncated)',
  },
  { id: 'radar-row-score', owner: 'web-radar', note: 'Score ring; number + band as text' },
  {
    id: 'radar-row-deadline',
    owner: 'web-radar',
    note: 'Deadline text: countdown, "Closed", or "Rolling" / "No fixed deadline"',
  },
  { id: 'radar-skeleton', owner: 'web-radar', note: 'Skeleton rows while loading' },
  {
    id: 'radar-empty',
    owner: 'web-radar',
    note: 'Empty state; `data-variant` = warming-up | below-threshold | filters | none | all-triaged | search',
  },
  { id: 'radar-error', owner: 'web-radar', note: 'Full error (copy #5) with [Retry]' },
  {
    id: 'radar-stale-strip',
    owner: 'web-radar',
    note: '"Couldn\'t refresh. Showing results from 10:42. [Retry]"',
  },
  { id: 'radar-total', owner: 'web-radar', note: 'Total fits count (mono), e.g. "5,000"' },
  { id: 'radar-search', owner: 'web-radar', note: 'Search input (`/` focuses it)' },
  { id: 'radar-warming-strip', owner: 'web-radar', note: 'Warming-up strip (USERFLOW §1.7)' },
  {
    id: 'radar-ai-off-note',
    owner: 'web-radar',
    note: 'Copy #19 shown wherever AI output would be (drawer tips)',
  },
  {
    id: 'listing-drawer',
    owner: 'web-radar',
    note: 'Detail drawer (aside at xl, dialog/sheet below)',
  },
  { id: 'listing-drawer-title', owner: 'web-radar', note: 'Drawer title (receives focus on open)' },
  {
    id: 'listing-drawer-apply',
    owner: 'web-radar',
    note: '[Apply ↗]; disabled or labelled "Closed" past the deadline',
  },
  {
    id: 'listing-drawer-deadline',
    owner: 'web-radar',
    note: 'Absolute deadline with time zone; `data-deadline-at` (ISO) and `data-timezone`',
  },
  { id: 'deadlines-page', owner: 'web-radar', note: 'Deadlines timeline root' },
  {
    id: 'deadlines-no-fixed-group',
    owner: 'web-radar',
    note: '"No fixed deadline" group (rolling / unknown)',
  },

  // ── Tracker, sources, alerts, profile, settings ───────────────────────────
  { id: 'tracker-page', owner: 'web-workspace', note: 'Tracker root' },
  { id: 'tracker-column', owner: 'web-workspace', note: 'Kanban column; `data-stage`' },
  {
    id: 'tracker-card',
    owner: 'web-workspace',
    note: 'Kanban card; `data-item-id`, `data-stage`; focusable (Space lifts)',
  },
  { id: 'tracker-empty', owner: 'web-workspace', note: 'Empty tracker (copy #6)' },
  { id: 'sources-page', owner: 'web-workspace', note: 'Sources root' },
  {
    id: 'source-row',
    owner: 'web-workspace',
    note: 'Source table row; `data-source-id`, `data-health`, `data-health-code` (e.g. paused:credits)',
  },
  { id: 'sources-add-button', owner: 'web-workspace', note: '[+ Add source]' },
  { id: 'source-add-dialog', owner: 'web-workspace', note: 'Add-source dialog / sheet' },
  {
    id: 'source-add-url',
    owner: 'web-workspace',
    note: 'URL input inside the dialog (and onboarding step 3)',
  },
  {
    id: 'source-detect-result',
    owner: 'web-workspace',
    note: 'Detection result line (success, crawl fallback or failure)',
  },
  { id: 'source-add-submit', owner: 'web-workspace', note: '[Add source] / [Add anyway]' },
  {
    id: 'credit-meter',
    owner: 'web-workspace',
    note: 'Crawl credit meter, "312 / 500 credits today"',
  },
  {
    id: 'credit-cap-banner',
    owner: 'web-workspace',
    note: 'Copy #18 when the daily cap is reached',
  },
  { id: 'alerts-page', owner: 'web-workspace', note: 'Alerts root' },
  { id: 'profile-page', owner: 'web-workspace', note: 'Profile root' },
  { id: 'settings-page', owner: 'web-workspace', note: 'Settings root (tabs inside)' },
  {
    id: 'settings-ai-key',
    owner: 'web-workspace',
    note: 'Masked saved key (`sk-…3f9a`); absent when no key',
  },
  { id: 'settings-ai-key-remove', owner: 'web-workspace', note: '[Remove] for the saved key' },
  {
    id: 'settings-ai-status',
    owner: 'web-workspace',
    note: 'Current AI mode line (e.g. copy #19 when AI is off)',
  },
  {
    id: 'settings-timezone',
    owner: 'web-workspace',
    note: 'Time zone select / combobox (Notifications tab)',
  },
] as const satisfies readonly TestIdSpec[];

export type TestId = (typeof TESTIDS)[number]['id'];

const here = dirname(fileURLToPath(import.meta.url));
/** apps/web/src */
export const WEB_SRC = join(here, '..', '..', 'src');

const ID_LITERAL = /data-testid\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`$]+)["'`]\s*\})/g;
// Components that forward a `testId` / `data-testid` prop: testId="radar-row" or testId: 'radar-row'.
const PROP_LITERAL = /\btest[Ii]d\s*[=:]\s*(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`$]+)["'`]\s*\})/g;
// Spreads such as {...tid('radar-row')} or testIds.radarRow = 'radar-row'.
const KEBAB_STRING = /["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["'`]/g;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

let cache: Map<string, string[]> | undefined;

/** Every testid literal found in apps/web/src, mapped to the files that use it. */
export function scanSourceTestIds(srcDir: string = WEB_SRC): Map<string, string[]> {
  if (cache && srcDir === WEB_SRC) return cache;
  const known = new Set<string>(TESTIDS.map((t) => t.id));
  const found = new Map<string, string[]>();
  const add = (id: string | undefined, file: string) => {
    if (!id) return;
    const rel = relative(srcDir, file);
    const files = found.get(id) ?? [];
    if (!files.includes(rel)) files.push(rel);
    found.set(id, files);
  };
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(ID_LITERAL)) add(m[1] ?? m[2] ?? m[3], file);
    for (const m of text.matchAll(PROP_LITERAL)) add(m[1] ?? m[2] ?? m[3], file);
    // Contract ids that appear as plain strings (constants maps, helper calls) also count.
    for (const m of text.matchAll(KEBAB_STRING)) if (m[1] && known.has(m[1])) add(m[1], file);
  }
  if (srcDir === WEB_SRC) cache = found;
  return found;
}

/** Contract ids from `ids` that are not present anywhere in apps/web/src yet. */
export function missingTestIds(ids: readonly TestId[]): TestId[] {
  const found = scanSourceTestIds();
  return ids.filter((id) => !found.has(id));
}

/** Skip reason for `test.skip(cond, reason)`, or null when every id exists in source. */
export function pendingReason(ids: readonly TestId[]): string | null {
  const missing = missingTestIds(ids);
  if (missing.length === 0) return null;
  const owners = [...new Set(missing.map((id) => TESTIDS.find((t) => t.id === id)?.owner))].join(
    ', ',
  );
  return `pending: data-testid ${missing.join(', ')} not in apps/web/src yet (owner: ${owners}; see docs/TESTIDS.md)`;
}

function markdownReport(): string {
  const found = scanSourceTestIds();
  const known = new Set<string>(TESTIDS.map((t) => t.id));
  const lines = ['| id | owner | status | where | notes |', '|---|---|---|---|---|'];
  for (const t of TESTIDS) {
    const files = found.get(t.id);
    lines.push(
      `| \`${t.id}\` | ${t.owner} | ${files ? 'present' : '**missing**'} | ${files ? files.map((f) => `\`${f}\``).join('<br>') : '–'} | ${t.note} |`,
    );
  }
  const extra = [...found.keys()].filter((id) => !known.has(id)).sort();
  lines.push(
    '',
    `Other ids found in source (not used by the QA specs): ${extra.length ? extra.map((id) => `\`${id}\``).join(', ') : 'none'}.`,
  );
  const present = TESTIDS.filter((t) => found.has(t.id)).length;
  lines.push('', `Contract coverage: **${present} / ${TESTIDS.length}** present.`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(markdownReport());
}
