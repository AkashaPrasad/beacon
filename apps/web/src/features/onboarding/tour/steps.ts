/**
 * Spotlight tour stops (UX-RESTRUCTURE §3 #10). Each stop names its anchor by `data-tour` first (screens
 * can pin it precisely), then by fallbacks that exist today. The first *visible* match wins; a stop
 * whose anchor isn't on screen is skipped.
 */
export interface TourStop {
  id: string;
  title: string;
  body: string;
  selectors: readonly string[];
}

export const TOUR_STOPS: readonly TourStop[] = [
  {
    id: 'search',
    title: 'Search your radar',
    body: 'Type a company, a role or a skill. Press / to jump here from anywhere on the Radar.',
    selectors: ['[data-tour="search"]', '[data-testid="radar-search"]'],
  },
  {
    id: 'today',
    title: 'Today, at a glance',
    body: 'New fits, deadlines this week and follow-ups due. Tap a chip to filter the list.',
    selectors: ['[data-tour="today"]', '[data-testid="radar-summary"]'],
  },
  {
    id: 'row',
    title: 'One row, one decision',
    body: 'Open a listing for the full page: why it fits, what’s missing, and the deadline.',
    selectors: ['[data-tour="row"]', '[data-testid="radar-row"]', '[data-testid="radar-card"]'],
  },
  {
    id: 'fit',
    title: 'Every score is explained',
    body: 'The ring is how well it fits you. Open the listing to see each part of the score.',
    selectors: [
      '[data-tour="fit"]',
      '[data-testid="radar-row-score"]',
      '[data-testid="radar-card"] [data-vt="ring"]',
    ],
  },
  {
    id: 'actions',
    title: 'Save, hide or track',
    body: 'S saves, H hides, A adds it to your tracker. U undoes the last one.',
    selectors: [
      '[data-tour="row-actions"]',
      '[data-testid="radar-row-actions"]',
      '[data-testid="radar-card-save"]',
      '[data-testid="radar-row"] [aria-label^="Save"]',
    ],
  },
  {
    id: 'deadlines',
    title: 'Never miss a deadline',
    body: 'Everything that closes soon, week by week. Drag one to the tracker when you start.',
    selectors: ['[data-tour="nav-deadlines"]', 'nav[aria-label="Primary"] a[href="/deadlines"]'],
  },
  {
    id: 'tracker',
    title: 'Track every application',
    body: 'Saved, applied, interview, offer. We nudge you when one goes quiet.',
    selectors: ['[data-tour="nav-tracker"]', 'nav[aria-label="Primary"] a[href="/tracker"]'],
  },
  {
    id: 'alerts',
    title: 'Alerts, your way',
    body: 'Push and in-app alerts for strong fits and closing deadlines. No email, no spam.',
    selectors: ['[data-tour="nav-alerts"]', 'nav[aria-label="Primary"] a[href="/alerts"]'],
  },
  {
    id: 'palette',
    title: 'Everything is one key away',
    body: 'Press ⌘K (Ctrl K) to jump anywhere or run any action. Press ? for every shortcut.',
    selectors: ['[data-tour="palette"]', '[data-testid="global-search"]'],
  },
];

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

/** First visible element for a stop, or null. */
export function resolveAnchor(stop: TourStop, root: ParentNode = document): HTMLElement | null {
  for (const selector of stop.selectors) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) if (isVisible(el)) return el;
  }
  return null;
}
