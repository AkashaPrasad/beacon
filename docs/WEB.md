# Beacon web app (`apps/web`) — foundation contract

Owner: web-foundation. Screen agents build against this file; keep it truthful. It sits under
`docs/BRIEF.md`, `docs/DESIGN.md` (components, copy), `docs/MOTION.md` (anything that moves),
`docs/USERFLOW.md` (flows) and `docs/API.md` (the HTTP contract). Page-root and element test ids are
in `docs/TESTIDS.md`.

Stack: Vite 8 (rolldown) · React 19 · React Router 7 (data mode) · Tailwind v4 + `@kestrel/ui/tokens.css`
· shadcn/ui (Radix) restyled · Motion 12 (`m.*` + `LazyMotion`) · TanStack Query v5 (IndexedDB persister)
· MSW 2 · vite-plugin-pwa (injectManifest) · Vitest + Testing Library · Playwright + axe.

---

## 1. Commands

```bash
pnpm --filter @kestrel/web dev            # http://localhost:5173 against VITE_API_URL (default http://localhost:4000)
VITE_MOCK_API=1 pnpm --filter @kestrel/web dev   # no backend: MSW answers every /v1 call (§6)
pnpm --filter @kestrel/web build          # tsc + vite build + prerender of / and /login → dist/
pnpm --filter @kestrel/web build:mock     # same, with VITE_MOCK_API=1 (Lighthouse, demos)
pnpm --filter @kestrel/web preview        # serve dist/ on http://localhost:4173
pnpm --filter @kestrel/web lint | typecheck | test
pnpm --filter @kestrel/web test:e2e       # Playwright: builds (mock mode) + previews on :4173 itself
pnpm --filter @kestrel/web exec playwright test e2e/smoke.spec.ts --project=chromium
npx -y @lhci/cli@0.15.1 autorun           # from the repo root, after build:mock (.lighthouserc.cjs)
```

Env (build time, `VITE_*` only; names in `apps/web/.env.example`): `VITE_API_URL`, `VITE_WEB_URL`
(canonical/OG origin, default `https://beacon.spacesdrive.cc`), `VITE_GOOGLE_CLIENT_ID`,
`VITE_VAPID_PUBLIC_KEY`, `VITE_MOCK_API=1`. Locally, `apps/web/.env.local` (git-ignored) is generated
from `secrets.env` (`GOOGLE_CLIENT_ID`, `VAPID_PUBLIC_KEY`). Read env only through `@/lib/env`.

---

## 2. Structure

```
apps/web/
  index.html                 theme bootstrap script (no flash), metas, OG, skip link, #root placeholder
  vite.config.ts             @ alias, `source` conditions for @kestrel/*, PWA, __APP_VERSION__, font preloads
  scripts/prerender.mjs      renders / and /login with react-dom/server into dist/index.html, dist/login.html
  playwright.config.ts       chromium + webkit + iPhone 14 against `vite preview` :4173 (mock build)
  public/                    brand/ (icons, OG), mockServiceWorker.js (MSW; never precached)
  e2e/                       smoke.spec.ts (foundation), <feature>.spec.ts (screens), QA suites + utils/
  src/
    main.tsx                 boot: MSW (mock mode) → router → hydrate (prerendered) or render → SW
    entry-server.tsx         prerender entry (same provider tree as the browser)
    sw.ts                    service worker: precache, network-first navigations, push, notificationclick
    app/                     App (providers), routes, RootLayout, guards, RouteError, boot screens
    api/                     data hooks per resource (§5); screen agents own their <feature>.ts
    components/
      ui/                    shadcn primitives, restyled to tokens (no testids here)
      shell/                 AppShell, TopBar, TabBar, slots, bell, user menu, Me sheet, shortcut sheet…
      command-palette/       registry + lazy palette
      brand/                 BeaconMark, BeaconLockup
      responsive-drawer.tsx  push (xl) / overlay (lg) / sheet (md) / bottom sheet (phone)
      push-soft-ask.tsx      copy #17 soft ask → permission → subscribe → default push rule
    features/<feature>/      one folder per screen (exports `Component`)
    lib/                     api client, env, query client, theme, shortcuts, undo, connectivity, storage…
    mocks/                   MSW: browser.ts, server.ts, state.ts, handlers/{index,foundation,<feature>}.ts
    styles/                  index.css (Tailwind + tokens + interaction utilities), fonts.ts
    test/setup.ts            Vitest setup (jest-dom, jsdom polyfills)
packages/ui/src/             tokens-aware primitives: FitRing, CompanyLogo, DeadlineCountdown, TypeBadge,
                             GhostRiskBadge, Kbd/Shortcut, Skeleton family, EmptyState, PageHeader, motion.ts
```

---

## 3. Routes

React Router 7 data mode (`createBrowserRouter(routes)` in `src/app/routes.tsx`). Every signed-in
screen is a lazy chunk whose module exports a named **`Component`** (React Router's `lazy` convention)
and declares `handle: { title }` (document title "Radar · Beacon", mobile top-bar title). Each route
renders exactly one page-root testid once its data-independent frame mounts.

| Path                                                        | Page root testid                | Access                                                                          | Module                                                |
| ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/`                                                         | `landing-page`                  | public (signed-in → `/radar` or the next onboarding step)                       | `features/landing/LandingScreen` (eager, prerendered) |
| `/login`                                                    | `login-page`                    | public (`?next=` safe path, `?error=cancelled\|failed\|expired` → `auth-error`) | `features/auth/LoginScreen` (eager, prerendered)      |
| `/auth/callback`                                            | `auth-callback-page`            | public                                                                          | `features/auth/AuthCallbackScreen`                    |
| `/welcome`                                                  | `consent-page`                  | user                                                                            | `features/auth/WelcomeScreen`                         |
| `/onboarding`                                               | — (redirects to the saved step) | user                                                                            | `app/guards` `OnboardingIndex`                        |
| `/onboarding/:step` (`resume\|preferences\|sources`)        | `onboarding-page` (`data-step`) | user + consent                                                                  | `features/onboarding/OnboardingScreen`                |
| `/radar/:listingId?`                                        | `radar-page`                    | user + onboarded, in AppShell (`app-shell`)                                     | `features/radar/RadarScreen`                          |
| `/deadlines`                                                | `deadlines-page`                | ″                                                                               | `features/deadlines/DeadlinesScreen`                  |
| `/tracker`                                                  | `tracker-page`                  | ″                                                                               | `features/tracker/TrackerScreen`                      |
| `/sources` (`?add=1` opens the dialog)                      | `sources-page`                  | ″                                                                               | `features/sources/SourcesScreen`                      |
| `/alerts`                                                   | `alerts-page`                   | ″                                                                               | `features/alerts/AlertsScreen`                        |
| `/profile`                                                  | `profile-page`                  | ″                                                                               | `features/profile/ProfileScreen`                      |
| `/settings` → `/settings/appearance`                        | —                               | ″                                                                               | redirect                                              |
| `/settings/:tab` (`appearance\|ai\|notifications\|privacy`) | `settings-page`                 | ″                                                                               | `features/settings/SettingsScreen`                    |
| `/notifications`                                            | `notifications-page`            | ″                                                                               | `features/notifications/NotificationsScreen`          |
| `*`                                                         | `not-found-page`                | public                                                                          | `features/not-found/NotFoundScreen`                   |

**How auth state is decided** (`src/app/guards.tsx`, `src/api/me.ts`):

- The session cookie (`beacon_session`) is httpOnly, so the app asks `GET /v1/me` (`auth: 'optional'`):
  **200 → signed in** (`MeResponse`), **401 → signed out** (`data === null`, never a redirect loop).
- `RequireAuth`: pending → `ShellSkeleton` (shell geometry, no jump); 401 → `/login?next=<path+search>`;
  network/5xx with no cache → `FullPageError` with Retry.
- `RequireOnboarded`: no consent (or step `consent`) → `/welcome`; unfinished → `/onboarding/<step>`.
  `RequireConsent` guards the onboarding steps.
- `PublicOnly` (`/`, `/login`): calls `/v1/me` **only when the session hint is set**
  (`localStorage['beacon:session']`, written after a successful `/v1/me` or sign-in), so anonymous
  visitors never cause a 401. Signed-in visitors go to `nextPathFor(me)` (or a safe `next`).
- Any 401 from a signed-in request (outside `/`, `/login`, `/auth/*`) clears `me`, the hint and sends
  the user to `/login?next=…` (`src/app/auth-redirect.ts`).

**Sign-in** (USERFLOW §1.1, API §3, redirect auth-code flow, no popup): `GoogleSignInButton`
(`data-testid="google-sign-in"`) creates a random `state` (sessionStorage, 10 min, carries `next`) →
navigates to Google (GIS code client in redirect mode when the library has loaded on hover/focus, else
the identical URL built by `googleAuthUrl`) → Google → `/auth/callback?code&state` → state checked →
`POST /v1/auth/google { code, redirectUri: <origin>/auth/callback }` → `/v1/me` → `nextPathFor(me)`.
Cancelled → `/login?error=cancelled`; bad state → `expired`; API failure → `failed`. Logout:
`useLogout()` → `POST /v1/auth/logout`, clears memory + IndexedDB caches, toast "Signed out."

---

## 4. Shell and plug-in points

`components/shell/AppShell.tsx` (route element for every signed-in screen except onboarding):
top bar (brand, text nav with sliding underline, **topbar slot**, search → palette, bell, avatar menu)
· optional left **rail** (≥ lg, collapsible to icons with `[`, persisted) · `main#main` on `surface`
(view-transition name `main`) · optional right **drawer** column (≥ xl, push) · mobile tab bar
(Radar · Deadlines · Tracker · Alerts · Me; safe areas; Me opens a sheet) · offline banner
(`offline-banner`, copy #22) · `?` sheet · palette host · appearance sync.

```tsx
import { ShellSlot } from '@/components/shell/slots';
<ShellSlot name="topbar"><FitThreshold /><ViewSwitch /></ShellSlot>   // ≥ lg, right of the nav
<ShellSlot name="rail"><FilterRail /></ShellSlot>                      // the rail appears only while filled
<ShellSlot name="drawer"><ListingDrawer /></ShellSlot>                 // the xl push column
```

Slot content is portalled, so it keeps the screen's context. For a detail panel that adapts per
breakpoint use `ResponsiveDrawer` (`components/responsive-drawer.tsx`: xl push via the drawer slot →
lg overlay → md sheet → phone Vaul bottom sheet, snap 0.6/1; `contentKey` crossfades instead of
re-sliding; `Esc` closes; focus to title).

Page anatomy: `PageHeader` from `@kestrel/ui` (serif h1 + mono meta + toolbar children + actions).
Loading: `ListSkeleton` / `CardSkeleton` / `TableSkeleton` (appear after 150 ms, role=status).
Empty: `EmptyState` (`variant="page"` for full-page). Errors inside a screen: inline strip with Retry;
uncaught render/loader errors hit the route's `RouteError` (`route-error`, Retry re-mounts the route,
a stale chunk after a deploy reloads).

Motion: the root provides `LazyMotion features={domAnimation} strict` + `MotionConfig` (reduced
motion from Settings or the OS). The AppShell upgrades to `domMax` lazily (`layout`, `layoutId`,
drag) — so `layout` works inside the shell, **not** on public pages. Use `m.*` only and the constants
in `@kestrel/ui` (`springs`, `tweens`, `variants`, `press`, `layoutIds`, `stagger`…); CSS utilities
`press`, `press-icon`, `press-card`, `lift`, `skeleton-shimmer`, `shake`, `focus-ring(-inset)`.
Route changes: `<NavLink viewTransition>` / `navigate(to, { viewTransition: true })`.

Theme: `useTheme()` → `{ appearance, resolvedTheme, reducedMotion, setAppearance, toggleTheme }`.
Appearance (`theme | accent | density | fontSize | motion`) lives in `localStorage['beacon:appearance']`
(read by the inline script in index.html before first paint) and is synced to `PATCH /v1/settings`
(debounced 400 ms) by `AppearanceSync`; the server value is applied once per session. Public pages call
`useBrandAccent()` (always signal amber). Theme flips crossfade via a View Transition.

---

## 5. Data layer

`@/lib/api` — `api.get/post/put/patch/delete<T>(path, body?, { query, signal, timeoutMs, auth })`:
`credentials: 'include'`; `X-Requested-With: beacon` on mutations only (GETs stay preflight-free);
`{ error: { code, message, details, issues } }` → `ApiError` (`status`, `code`, `requestId`,
`retryAfterSeconds`, `isTransient`); network → `NETWORK` (and a `/healthz` probe feeding the offline
banner), timeout (15 s default) → `TIMEOUT`, abort → `ABORTED`; 401 → sign-in redirect unless
`auth: 'optional'`; ISO date-times are revived into `Date`s (date-only strings stay strings).
`errorMessage(error)` gives the human copy.

`@/lib/query-client` — staleTime 30 s, gcTime 24 h, transient-only retries (max 2), persisted to
IndexedDB (`beacon:query-cache`, structured clone keeps Dates; buster = app version; opt out per query
with `meta: { persist: false }`). Mutations use `networkMode: 'online'`: optimistic `onMutate` runs at
once, the request pauses offline and resumes in order on reconnect (and after a reload restore). Sign-out
wipes memory + IndexedDB.

Keys: `queryKeys` (`src/api/keys.ts`) — add yours there. Base hooks (all re-exported from `@/api`):

| Hook                                                                                      | Endpoint                                                         | Notes                                                                                                              |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `useMe()`, `fetchMe()`, `isOnboarded`, `nextPathFor`                                      | `GET /v1/me`                                                     | `null` = signed out                                                                                                |
| `useUpdateMe()`                                                                           | `PATCH /v1/me`                                                   | sets the `me` cache                                                                                                |
| `useGoogleSignIn()`, `useLogout()`                                                        | `POST /v1/auth/google`, `/logout`                                |                                                                                                                    |
| `useSettings()`, `useUpdateSettings()`                                                    | `GET/PATCH /v1/settings`                                         | optimistic merge, rollback on error                                                                                |
| `useTestAiKey()`, `useUpdateWeights()` (+ settings-screen extras)                         | §10                                                              | weights invalidate the feed                                                                                        |
| `useFeed(filters)`                                                                        | `GET /v1/feed`                                                   | infinite, cursor, `keepPreviousData`; rows `pages.flatMap(p => p.items)`                                           |
| `useFeedSummary()`                                                                        | `GET /v1/feed/summary`                                           |                                                                                                                    |
| `feedKeys`, `findFeedItem(qc, id)`, `patchFeedItem(qc, id, fn)`, `patchListingEverywhere` | —                                                                | optimistic helpers across every cached feed list                                                                   |
| `usePushSubscription()`                                                                   | `/v1/push/*`                                                     | `{ support, isSubscribed, subscribe, unsubscribe }`; **never prompts by itself** (call `subscribe()` from a click) |
| `usePushSubscriptions()`                                                                  | `GET /v1/push/subscriptions`                                     |                                                                                                                    |
| feature hooks                                                                             | `api/{listings,sources,tracker,alerts,notifications,profile}.ts` | owned by the screen agents                                                                                         |

Optimistic action with undo (DESIGN §8 rule 6):

```ts
import { withUndo } from '@/lib/undo';
withUndo({
  message: `Hidden “${title}”.`,
  run: () => hide.mutateAsync(id),
  undo: () => unhide.mutateAsync(id),
});
// 6 s toast with [Undo]; `u` and ⌘Z / Ctrl Z call undoLast(); a failed run turns into an error toast with Retry.
```

Toasts: `import { toast } from 'sonner'` — 5 s default, 6 s undo, errors `{ duration: 8000 }` with a
Retry action; max 3 visible; bottom-right (desktop) / above the tab bar (phone); no `richColors`.

---

## 6. Mock API (MSW)

`VITE_MOCK_API=1` starts MSW in the browser before the app renders (`src/mocks/browser.ts`); Vitest
uses the same handlers through `src/mocks/server.ts` (call `server.listen()` in the suite; see
`src/app/guards.test.tsx`). `src/mocks/handlers/index.ts` lists them in order: the foundation guard
(CSRF on mutations, 401 when signed out; falls through) → platform, auth, `/v1/me`, push
(`handlers/foundation.ts`) → feature modules `handlers/<feature>.ts` (each exports `<feature>Handlers`
and `reset<Feature>Mock()`; add new modules to both lists in `index.ts`). Shared cross-resource state
(session, user, onboarding, settings, profile, notifications, tracker/alerts for the export, push) is in
`src/mocks/state.ts`. `/v1/me` reads settings and the unread count through the feature handlers, so it
always agrees with them.

Bypass for Playwright: `window.__BEACON_E2E__ = { transport: 'playwright' }` (init script) keeps the
worker off so `page.route` answers; if the worker cannot register, the app logs and renders anyway.

Scenario switches (`localStorage`, then reload; most are read per request):

| Key                                                                  | Values (default first)                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beacon:mock:user`                                                   | `returning` (signed in, onboarded) · `new` (signed out → sign-in lands on consent) · `consent` (signed in, no consent) · `signed-out`                                                                      |
| `beacon:mock:session`                                                | `1` / `0` (sign-in/out write it)                                                                                                                                                                           |
| `beacon:mock:radar`                                                  | `default` (≥ 60 listings incl. no deadline, rolling, past deadline, due in hours, emoji title, 300-char company, ghost, hard-fail, unpaid) · `large` (5,000) · `warming` · `empty` · `error` · `returning` |
| `beacon:mock:warmMs`, `beacon:mock:latency`, `beacon:mock:explainMs` | numbers (ms)                                                                                                                                                                                               |
| `beacon:mock:ai`                                                     | `off` → explain answers `source: 'deterministic'`                                                                                                                                                          |
| `beacon:mock:settings`                                               | `default` · `byok` (key ••••3f9a) · `ai-off`                                                                                                                                                               |
| `beacon:mock:profile`                                                | `full` · `empty`; resume file names: `scanned`, `corrupt`, `nograd`, `noskills`, `refined`                                                                                                                 |
| `beacon:mock:notifications`                                          | `default` (16, 5 unread) · `empty` · `error`                                                                                                                                                               |
| `beacon:mock:sources` / `beacon:mock:credits`                        | `default` · `empty` / `cloud` · `warning` · `selfhosted` · `paused`                                                                                                                                        |
| `beacon:mock:tracker`, `beacon:mock:alerts`                          | `default` · `empty`                                                                                                                                                                                        |

Sign-in in mock mode is simulated (no Google): the button goes straight to
`/auth/callback?code=mock-google-code`.

---

## 7. Global UX

- **Command palette** (`⌘K` / `Ctrl K`, `/`; lazy chunk): Listings (fuzzy over cached feed rows),
  Recent, Go to, Actions, Views, Settings. Contribute items while mounted:
  ```ts
  import { useCommandItems } from '@/components/command-palette/registry';
  useCommandItems(
    () => [
      {
        id: 'radar.view.list',
        group: 'Views',
        label: 'List view',
        shortcut: '1',
        perform: () => setView('list'),
      },
    ],
    [setView],
  );
  ```
  `openPalette(query?)`, `closePalette()`; `rememberRecentListing({ id, title, company })` when a
  detail opens.
- **Shortcuts** (`@/lib/shortcuts`): `useShortcut(keys, handler, { description, group, scope, allowInInput, allowInDialog, enabled })`
  and `useShortcutScope('radar')` while a screen is mounted (screen scopes beat global). Combos `mod+k`,
  sequences `g r` (≤ 1 s apart); single keys never fire in text fields and can be switched off in
  Settings (`shortcuts.setSingleKeyEnabled(false)`, WCAG 2.1.4). Described shortcuts show in the `?`
  sheet, grouped. Globals: `g r/d/t/s/a/p`, `g ,`, `?`, `u`, `mod+z`, `mod+k`, `/`, `[` (rail).
  Render hints with `<Shortcut keys="g r" />` and expose `aria-keyshortcuts={ariaKeyShortcuts(keys)}`.
- **Back restores your place** (UX restructure v2 §1.1, `@/lib/list-memory`): every list that opens a full page
  calls `rememberOpened(listKey, id, { name: scrollEl })` when a row opens (rows stay real `<a href>`), and
  `useListMemory(listKey, { ready, scrollers: { name: ref }, focus: (id) => selector })` once its rows render. On a
  POP within 30 min it restores the inner scroll offsets, focuses the row (`preventScroll`) and flashes a 600 ms
  selection highlight (none under reduced motion); any other arrival starts at the top. Window scroll is the router's
  `<ScrollRestoration>`. Detail pages go back with `useBackNavigation(parent)` (or `DetailPageHeader`). Keys in use:
  `sources`, `pack:<id>`, `alerts`, `tracker` (radar/deadlines: pick `radar`, `deadlines`). `cssEscape(id)` builds
  selectors safely.
- **Offline**: `useIsOffline()` (`navigator.onLine` + `/healthz` probe after a network failure) drives
  `offline-banner`; mutations queue (above).
- **Push**: soft ask only (`<PushSoftAsk />`, in the notification centre; screens may render it under
  the first saved row). [Turn on] → permission → subscribe → creates "Strong fits, any type" (push +
  in-app, fit ≥ 80) unless an enabled push rule exists. The worker's push payload `url`
  (`/radar?listing=<id>`) is mapped to `/radar/<id>`; clicking a notification focuses an open tab and
  soft-navigates it.
- **PWA**: `manifest.webmanifest` (start `/radar`, standalone, amber icons incl. maskable), `sw.js`
  registered in production (never in mock mode); an update shows "A new version of Beacon is ready.
  [Reload]".

---

## 8. Public pages, prerendering, performance

`/` and `/login` are rendered at build time (`scripts/prerender.mjs` via Vite's SSR loader and
`src/entry-server.tsx`) and hydrated, so the headline paints before JS. Rules for anything rendered
there: no `window`/`document`/storage access during render (effects only); client-only UI waits for
`useHydrated()` (`@/lib/use-hydrated`). index.html's inline script discards prerendered markup on any
other path (SPA fallback), so an app route never flashes the landing page. Fonts: latin Geist and
Instrument Serif woff2 are preloaded; metric-matched fallbacks keep CLS at 0.

<!-- web-metrics:begin -->

Measured numbers (bundle sizes, Lighthouse) are recorded at the end of this file.
<!-- web-metrics:end -->

---

## 9. Tests

- Vitest (jsdom, `src/**/*.test.{ts,tsx}`, setup `src/test/setup.ts`): foundation suites cover the API
  client (`lib/api.test.ts`), theme + the no-flash bootstrap (`lib/theme/theme.test.tsx`), shortcuts
  (`lib/shortcuts.test.ts`), undo (`lib/undo.test.ts`), push deep links, and the guards with MSW
  (`app/guards.test.tsx`). `packages/ui` covers `FitRing` a11y and `EmptyState`.
- Playwright (`e2e/`): `smoke.spec.ts` (prerender, hydration without console errors, axe on `/`,
  `/login`, `/welcome`, the redirect sign-in flow, cancelled/forged callbacks, 404, reduced motion);
  screen agents' `<feature>.spec.ts`; QA's `edge-cases`, `a11y`, `keyboard`, `offline` with the fake API
  in `e2e/utils`. Projects: chromium, webkit, mobile (iPhone 14).
