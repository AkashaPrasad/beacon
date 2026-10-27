# Beacon `data-testid` contract

Owner: QA. The Playwright specs in `apps/web/e2e/` select elements by **role and accessible name
first**, and by `data-testid` only for structure that has no stable role or name (page roots,
rows, columns, strips, dialogs that share a role). This file is the contract between the screen
agents and those specs. The registry it is generated from is `apps/web/e2e/utils/testids.ts`.

## Conventions

1. **kebab-case `<feature>-<element>`**: `radar-row`, `listing-drawer-title`, `source-add-url`.
   The feature prefix is the route or component family (`radar`, `listing-drawer`, `tracker`,
   `sources`/`source`, `settings`, `onboarding`, `resume`, `consent`, `auth`, `credit`).
2. **One id per kind of element, never per instance.** Identity and state go in `data-*`
   attributes next to the id:

   | id | attributes the specs read |
   |---|---|
   | `radar-row` | `data-listing-id`, `data-active="true"` on the keyboard cursor row, `data-saved`, `data-hidden`, `data-pending="true"` while a queued (offline) mutation has not synced |
   | `radar-empty` | `data-variant` = `warming-up` \| `below-threshold` \| `filters` \| `none` \| `all-triaged` \| `search` |
   | `onboarding-page` | `data-step` = `resume` \| `preferences` \| `sources` |
   | `onboarding-pack-row` | `data-pack-id` |
   | `tracker-column` | `data-stage` (shared `TRACKER_STAGES`) |
   | `tracker-card` | `data-item-id`, `data-stage` |
   | `source-row` | `data-source-id`, `data-health` (`pending` \| `healthy` \| `degraded` \| `failing`), `data-health-code` (worker `healthCode`, e.g. `paused:credits`) |
   | `listing-drawer-deadline` | `data-deadline-at` (ISO 8601, UTC) and `data-timezone` (IANA zone used for display) |

   Booleans are the strings `"true"` / `"false"` (React renders `data-saved={saved}` that way).
3. **Page roots**: every route renders exactly one `<feature>-page` element (`radar-page`,
   `settings-page`, …) once its data-independent frame is mounted. The specs wait for it
   instead of for network idle.
4. **Do not put testids on shadcn primitives in `components/ui/`.** Put them on the feature
   component that renders the primitive (pass `data-testid` through props).
5. **Never use testids for text assertions.** Copy comes from DESIGN §8 / USERFLOW and the specs
   assert it with `getByText` / `toHaveText` on the element the testid points to.
6. Testids ship in production builds (they are a few bytes and Lighthouse does not mind). Do not
   strip them.
7. Adding an id: add it to `TESTIDS` in `apps/web/e2e/utils/testids.ts` (QA) and use it in the
   screen. Renaming one: tell QA in `docs/SHARED-REQUESTS.md` first.

## How the specs use this file

- `pendingReason(ids)` returns a skip reason **only when an id is not present anywhere in
  `apps/web/src`** (the screen has not landed yet). An id that exists in source but is not on
  the page is a test failure, never a skip.
- The goal before Phase 8 closes is **zero skips**: every id below is `present`.
- Regenerate the table: `node apps/web/e2e/utils/testids.ts` (it scans `apps/web/src` for
  `data-testid="…"`, `testId="…"` and contract ids used as string constants).

## Status (generated)

Owners: `web-foundation` = shell, palette, offline banner, error boundary; `web-onboarding` =
landing, sign-in, consent, wizard; `web-radar` = radar, drawer, deadlines; `web-workspace` =
tracker, sources, alerts, profile, settings. (QA's split; correct it here if the screen agents
divided the work differently.)

<!-- testids:begin -->
| id | owner | status | where | notes |
|---|---|---|---|---|
| `app-shell` | web-foundation | present | `components/shell/AppShell.tsx` | Root of the signed-in layout (top bar + content) |
| `offline-banner` | web-foundation | present | `components/shell/OfflineBanner.tsx` | Top strip, copy #22; rendered only while offline |
| `command-palette` | web-foundation | present | `components/command-palette/CommandPalette.tsx` | Palette dialog (⌘K / Ctrl K) |
| `command-palette-input` | web-foundation | present | `components/command-palette/CommandPalette.tsx` | Palette search input |
| `shortcuts-sheet` | web-foundation | present | `components/shell/ShortcutsSheet.tsx` | Keyboard shortcut sheet (`?`) |
| `notifications-bell` | web-foundation | present | `components/shell/NotificationBell.tsx` | Top-bar bell button; unread count as text |
| `user-menu` | web-foundation | present | `components/shell/UserMenu.tsx` | Avatar menu trigger |
| `route-error` | web-foundation | present | `app/RouteError.tsx` | Route error boundary; has a Retry button |
| `not-found-page` | web-foundation | present | `features/not-found/NotFoundScreen.tsx` | 404 route |
| `landing-page` | web-onboarding | **missing** | – | Public landing root (`/`) |
| `login-page` | web-onboarding | present | `features/auth/LoginScreen.tsx` | Sign-in page root (`/login`) |
| `google-sign-in` | web-onboarding | **missing** | – | [Continue with Google] (landing and /login) |
| `auth-error` | web-onboarding | **missing** | – | Sign-in error / cancelled message with [Try again] |
| `consent-page` | web-onboarding | present | `features/auth/WelcomeScreen.tsx` | One-screen consent (USERFLOW §1.2) |
| `consent-continue` | web-onboarding | present | `features/auth/WelcomeScreen.tsx` | [Continue]; disabled until a choice is made |
| `onboarding-page` | web-onboarding | present | `features/onboarding/OnboardingScreen.tsx`<br>`features/onboarding/components/OnboardingFrame.tsx` | Wizard frame; `data-step` = resume | preferences | sources |
| `onboarding-continue` | web-onboarding | present | `features/onboarding/components/OnboardingFrame.tsx` | Primary [Continue] / [Start my radar] |
| `onboarding-skip` | web-onboarding | present | `features/onboarding/components/OnboardingFrame.tsx` | [Skip for now] |
| `resume-dropzone` | web-onboarding | present | `features/onboarding/components/ResumeDropzone.tsx` | Drop zone; contains the `<input type=file>` |
| `resume-file-input` | web-onboarding | present | `features/onboarding/components/ResumeDropzone.tsx`<br>`features/onboarding/components/ResumeStep.tsx` | The file input itself (may be visually hidden) |
| `resume-preview` | web-onboarding | present | `features/onboarding/components/ParsedPreview.tsx` | Parsed preview column |
| `resume-warning` | web-onboarding | present | `features/onboarding/components/ParsedPreview.tsx` | Parser warning line(s), e.g. "No skills section found" |
| `resume-error` | web-onboarding | present | `features/onboarding/components/ResumeStep.tsx` | Upload/parse error (scanned PDF, too large, wrong type) |
| `resume-manual-form` | web-onboarding | present | `features/onboarding/components/ManualProfileForm.tsx` | Manual fallback form |
| `resume-gradyear-input` | web-onboarding | present | `features/onboarding/components/ManualProfileForm.tsx`<br>`features/onboarding/components/ParsedPreview.tsx` | Graduation year field (inline required when not parsed) |
| `resume-skill-input` | web-onboarding | present | `features/onboarding/components/ResumeStep.tsx`<br>`features/profile/components/SkillEditor.tsx` | Skills combobox input |
| `onboarding-pack-row` | web-onboarding | present | `features/onboarding/components/SourcesStep.tsx` | Pack row in step 3; `data-pack-id` |
| `radar-page` | web-radar | present | `features/radar/RadarScreen.tsx` | Radar route root |
| `radar-feed` | web-radar | present | `features/radar/components/RadarFeed.tsx` | `role="feed"` container; `aria-busy` while loading |
| `radar-row` | web-radar | present | `features/radar/components/RadarRow.tsx` | `article` per listing; `data-listing-id`, `data-active` (cursor), `data-saved`, `data-hidden`, `data-pending` (queued offline) |
| `radar-row-title` | web-radar | present | `features/radar/components/RadarRow.tsx` | Title text inside a row (full title in `title` attr when truncated) |
| `radar-row-company` | web-radar | present | `features/radar/components/RadarRow.tsx` | Company text inside a row (full name in `title` attr when truncated) |
| `radar-row-score` | web-radar | present | `features/radar/components/RadarRow.tsx` | Score ring; number + band as text |
| `radar-row-deadline` | web-radar | present | `features/radar/components/RadarRow.tsx` | Deadline text: countdown, "Closed", or "Rolling" / "No fixed deadline" |
| `radar-skeleton` | web-radar | present | `features/radar/components/FeedStates.tsx` | Skeleton rows while loading |
| `radar-empty` | web-radar | present | `features/radar/components/FeedStates.tsx` | Empty state; `data-variant` = warming-up | below-threshold | filters | none | all-triaged | search |
| `radar-error` | web-radar | present | `features/radar/components/FeedStates.tsx` | Full error (copy #5) with [Retry] |
| `radar-stale-strip` | web-radar | present | `features/radar/components/FeedStates.tsx` | "Couldn't refresh. Showing results from 10:42. [Retry]" |
| `radar-total` | web-radar | present | `features/radar/components/RadarToolbar.tsx` | Total fits count (mono), e.g. "5,000" |
| `radar-search` | web-radar | present | `features/radar/components/RadarToolbar.tsx` | Search input (`/` focuses it) |
| `radar-warming-strip` | web-radar | present | `features/radar/components/FeedStates.tsx` | Warming-up strip (USERFLOW §1.7) |
| `radar-ai-off-note` | web-radar | **missing** | – | Copy #19 shown wherever AI output would be (drawer tips) |
| `listing-drawer` | web-radar | **missing** | – | Detail drawer (aside at xl, dialog/sheet below) |
| `listing-drawer-title` | web-radar | **missing** | – | Drawer title (receives focus on open) |
| `listing-drawer-apply` | web-radar | **missing** | – | [Apply ↗]; disabled or labelled "Closed" past the deadline |
| `listing-drawer-deadline` | web-radar | **missing** | – | Absolute deadline with time zone; `data-deadline-at` (ISO) and `data-timezone` |
| `deadlines-page` | web-radar | present | `features/deadlines/DeadlinesScreen.tsx` | Deadlines timeline root |
| `deadlines-no-fixed-group` | web-radar | **missing** | – | "No fixed deadline" group (rolling / unknown) |
| `tracker-page` | web-workspace | present | `features/tracker/TrackerScreen.tsx` | Tracker root |
| `tracker-column` | web-workspace | **missing** | – | Kanban column; `data-stage` |
| `tracker-card` | web-workspace | **missing** | – | Kanban card; `data-item-id`, `data-stage`; focusable (Space lifts) |
| `tracker-empty` | web-workspace | **missing** | – | Empty tracker (copy #6) |
| `sources-page` | web-workspace | present | `features/sources/SourcesScreen.tsx` | Sources root |
| `source-row` | web-workspace | present | `features/sources/components/SourcesTable.tsx` | Source table row; `data-source-id`, `data-health`, `data-health-code` (e.g. paused:credits) |
| `sources-add-button` | web-workspace | **missing** | – | [+ Add source] |
| `source-add-dialog` | web-workspace | present | `features/sources/components/AddSourceDialog.tsx` | Add-source dialog / sheet |
| `source-add-url` | web-workspace | present | `features/onboarding/components/SourceUrlDetector.tsx`<br>`features/sources/components/AddSourceDialog.tsx` | URL input inside the dialog (and onboarding step 3) |
| `source-detect-result` | web-workspace | present | `features/onboarding/components/SourceUrlDetector.tsx`<br>`features/sources/components/DetectPanel.tsx` | Detection result line (success, crawl fallback or failure) |
| `source-add-submit` | web-workspace | present | `features/onboarding/components/SourceUrlDetector.tsx`<br>`features/sources/components/AddSourceDialog.tsx` | [Add source] / [Add anyway] |
| `credit-meter` | web-workspace | present | `features/sources/components/CreditMeter.tsx` | Crawl credit meter, "312 / 500 credits today" |
| `credit-cap-banner` | web-workspace | **missing** | – | Copy #18 when the daily cap is reached |
| `alerts-page` | web-workspace | present | `features/alerts/AlertsScreen.tsx` | Alerts root |
| `profile-page` | web-workspace | present | `features/profile/ProfileScreen.tsx` | Profile root |
| `settings-page` | web-workspace | present | `features/settings/SettingsScreen.tsx` | Settings root (tabs inside) |
| `settings-ai-key` | web-workspace | **missing** | – | Masked saved key (`sk-…3f9a`); absent when no key |
| `settings-ai-key-remove` | web-workspace | **missing** | – | [Remove] for the saved key |
| `settings-ai-status` | web-workspace | **missing** | – | Current AI mode line (e.g. copy #19 when AI is off) |
| `settings-timezone` | web-workspace | **missing** | – | Time zone select / combobox (Notifications tab) |

Other ids found in source (not used by the QA specs): `auth-callback-page`, `global-search`, `google-sign-in`, `notifications-page`, `onboarding-actions`, `onboarding-added-sources`, `onboarding-back`, `onboarding-manual-link`, `onboarding-meta`, `onboarding-own-url`, `onboarding-pack-list`, `onboarding-packs-error`, `onboarding-packs-loading`, `onboarding-pref-gradyear`, `onboarding-preferences-error`, `onboarding-preferences-form`, `onboarding-preferences-loading`, `onboarding-preview-headline`, `onboarding-preview-skills`, `onboarding-resume-cancel`, `onboarding-resume-choose`, `onboarding-resume-file`, `onboarding-resume-replace`, `onboarding-resume-retry`, `onboarding-role-input`, `onboarding-sources-empty`, `onboarding-step-${step}`, `onboarding-type-card`, `onboarding-upload-instead`, `profile-skill-chip`, `profile-skill-proficiency`, `profile-skill-remove`, `push-soft-ask`, `radar-card`, `radar-card-hide`, `radar-card-save`, `radar-card-track`, `radar-empty-clear`, `radar-empty-lower`, `radar-error-retry`, `radar-filter-rail`, `radar-filter-saved`, `radar-filter-stipend`, `radar-fit-threshold`, `radar-new-pill`, `radar-save-view`, `radar-sort`, `radar-summary`, `radar-summary-show-new`, `radar-swipe`, `radar-warming-up`, `resume-error-manual`, `resume-preview-empty`, `sources-add-url`, `sources-credit-meter`, `sources-detect-result`, `sources-pack-detail`, `sources-row`, `sources-table`, `theme-menu`, `theme-toggle`.

Contract coverage: **50 / 68** present.
<!-- testids:end -->
