# Shared requests

Cross-agent requests. Append under `## <from> → <to>`; mark an item `[done]` (with where) when it
lands. Do not delete other agents' items.

## qa → web

Context: the QA specs (`apps/web/e2e/{edge-cases,a11y,keyboard,offline}.spec.ts`) drive the app
with a **Playwright-side fake API** (`apps/web/e2e/utils/mock-api.ts`, built on `page.route`
and API.md), so they exercise the web app against the documented contract, independent of the
dev MSW handlers. Each item says who it is for.

1. **[done: `apps/web/playwright.config.ts`, 2026-10-27]** **[web-foundation] `apps/web/playwright.config.ts`** (QA does not own it): `testDir: 'e2e'`;
   projects `chromium` (Desktop Chrome), `webkit` (Desktop Safari) and `mobile`
   (`devices['iPhone 14']`); `webServer` = `pnpm build && pnpm preview --port 4173 --strictPort`
   (or `vite --port 4173`) with `url: 'http://localhost:4173'`, `reuseExistingServer: !process.env.CI`;
   `use.baseURL` from `process.env.E2E_BASE_URL ?? 'http://localhost:4173'`;
   `use.trace: 'retain-on-failure'`; `reporter: [['list'], ['html', { open: 'never' }]]`.
   Build env for the e2e server: `VITE_API_URL=http://localhost:4000` (any value works, the fake
   API matches on the `/v1/` path on any origin).
2. **[done: `src/mocks/browser.ts` `startMockWorker`, `main.tsx` catch]** **[web-foundation] Mock bypass flag.** The specs set `window.__BEACON_E2E__ = { transport: 'playwright' }`
   with `page.addInitScript` before any app code runs. When that flag is set, the MSW bootstrap
   (`VITE_MOCK_API=1`) must **not start the worker** and must render immediately, so requests
   reach the network layer where `page.route` answers them. One line in `enableMocking()`:
   `if (window.__BEACON_E2E__?.transport === 'playwright') return;`. Also: if the service worker
   fails to register (Playwright runs with `serviceWorkers: 'block'`), log and render anyway;
   never leave the page blank.
3. **[done: `src/mocks/state.ts` scenario `returning` is the default (signed in, onboarded)]** **[web-foundation] MSW seed for Lighthouse and demos.** In `VITE_MOCK_API=1` builds, start
   signed in as the first fixture user with onboarding `done`, so `/radar` renders rows for
   Lighthouse (`.lighthouserc.cjs` audits `/`, `/login`, `/radar`).
4. **[all screens] Testids** from `docs/TESTIDS.md` (68 ids, attributes listed there). The
   specs skip only while an id is absent from `apps/web/src`; the goal is zero skips.
5. **[done (foundation part): `offline-banner` in AppShell, `lib/query-client.ts` mutations `networkMode: 'online'` + `resumePausedMutations()` after restore; `data-pending` on rows is web-radar's, see foundation → screens #3]** **[web-foundation] Offline behaviour** (USERFLOW §5.4): `offline-banner` with copy #22
   rendered from `navigator.onLine` + `online`/`offline` events; TanStack Query mutations
   paused while offline (`networkMode: 'online'` default) and resumed in order on reconnect
   (`queryClient.resumePausedMutations()`); rows with a paused mutation get `data-pending="true"`
   plus an sr-only "Waiting to sync".
6. **[web-radar] Feed robustness**: de-duplicate feed items by `listing.id` across pages (the
   same listing can appear in two pages when ranks shift); virtualised list keeps < 100 rows
   in the DOM at 5,000 items; `radar-total` shows `total` with `toLocaleString('en-IN')`
   (5,000 → "5,000"); a `null` `deadlineAt` renders "Rolling" (`deadlineKind: 'rolling'`) or
   "No fixed deadline" (`'unknown'`), never "NaN"/"Invalid Date"; a past `deadlineAt` renders
   "Closed" and the drawer's apply button is disabled or labelled "Closed".
7. **[web-radar] Long text**: titles and company names truncate with an ellipsis and keep the
   full text in a `title` attribute (or tooltip); a 300-character company name must not cause
   horizontal scroll at 375 px.
8. **[web-workspace] Source edge cases**: show `DetectResult.finalUrl` when it differs from the
   typed URL ("Redirects to jobs.acme.dev/careers"); `valid: false` (wrong board token) shows a
   failure line and does not add the source silently; `409 CONFLICT` on add shows "Already
   added" and links to `details.existingId`; a source with `healthCode: 'paused:credits'`
   shows a paused state, and `credit-cap-banner` shows copy #18 when
   `cloudUsedToday >= cap`.
9. **[web-workspace] Settings, AI key removal**: after [Remove] (`DELETE /v1/settings/ai/key`)
   the masked key disappears, `settings-ai-status` reflects the fallback from the consent
   choice, and the drawer explain section shows `radar-ai-off-note` (copy #19) when
   `aiEnabled` is false or the API returns `source: 'deterministic'`.
10. **[web-workspace] Time zone**: absolute times (drawer deadline, notification times) render
    in `settings.notifications.timezone` (fallback: browser zone) with the zone abbreviation,
    and re-render without reload after the setting changes.
11. **[done: `docs/WEB.md` §3 routes, §6 mock switches, §3 auth state]** **[web-foundation] Docs**: `docs/WEB.md` listing the routes (path → page testid), the
    mock-mode switches and how auth state is decided (`GET /v1/me` 200 vs 401), so the QA
    route table in `apps/web/e2e/utils/routes.ts` can be checked against it.

## qa → api

1. **[done: `src/services/serialize.ts`]** **`SourceDTO.healthCode`** (worker writes `healthCode`, e.g. `paused:credits`; see
   `apps/worker/src/models/source.ts`). The UI needs it to show a paused source distinctly from
   a failing one. Please expose it (nullable) in `GET /v1/sources` and `/v1/sources/:id`.
2. **Memory sample for the soak test**: `GET /healthz?mem=1` → `{ ok, mem: { rss, heapUsed,
   heapTotal, external } }` (bytes, `process.memoryUsage()`), or a `/metrics` route. Public is
   fine if it reveals nothing else; otherwise require `Authorization: Bearer` with an admin user.
   `scripts/load-test.mjs --soak` samples it every 10 s.
3. **A way to mint a local token for load and contract tests**: e.g.
   `pnpm --filter @kestrel/api run dev:token -- --email load@beacon.test` (creates or reuses a
   user in the dev DB and prints a JWT for `Authorization: Bearer`). Never available when
   `NODE_ENV=production`.
4. **[done: verified by `scripts/security-check.sh`, `HttpOnly; SameSite=Lax; Path=/`]** **Logout cookie flags**: `POST /v1/auth/logout` clears `beacon_session` with the same
   attributes it is set with (`HttpOnly; SameSite=Lax; Path=/`, plus `Secure` in production).
   `scripts/security-check.sh` asserts the flags on that response, because a real Google token
   is not available in CI.
5. **API does not boot under Node ESM** (2026-10-27 19:20, blocks `pnpm --filter @kestrel/api dev`,
   `node dist/index.js` and the Docker image; Vitest hides it because it interops CJS):
   `src/models/{user,profile,listing,source,settings,activity}.ts` do
   `import { model, models, Schema } from 'mongoose'`, and mongoose 9's ESM entry has no named
   export `models` (`node --input-type=module -e "import * as m from 'mongoose'; console.log('models' in m)"`
   → `false`). Boot dies with `SyntaxError: The requested module 'mongoose' does not provide an
   export named 'models'`. Fix: `import mongoose, { model, Schema } from 'mongoose'` and
   `mongoose.models['User'] ?? model(...)`. Please add a boot smoke test (e.g. CI step
   `node dist/index.js` + `curl /healthz`) so it cannot regress. QA ran the API for load,
   security and contract checks through a scratch ESM resolve hook that re-exports `models`.
6. **`GET /v1/feed` collapses under concurrency** (load test 2026-10-27, local API + docker
   mongo 8, 2,000 match docs for one user; `docs/TESTING.md` "Load"). One request: ~110 ms per
   page plus ~100 ms more on the first page for `total`. Throughput then *falls* with concurrency:
   1 conn 4.5 req/s (p95 234 ms), 4 conns 4 req/s (p95 1,036 ms), 10 conns 2 req/s (p95 3,569 ms),
   50 conns 12 responses in 30 s and the rest timed out; mongod sat at ~850 % CPU and a single
   request after the run took 21 s while the backlog drained. SPEC target: p95 < 300 ms at 50.
   Cause (`src/services/feed.ts` `getFeed`): the pipeline `$lookup`s **every** match of the user
   into `listings` (plus the interactions lookup) *before* `$sort`/`$limit`, and runs the whole
   thing a second time for `total`. Suggested fix: have the worker denormalise the filter/sort
   fields onto `matches` (`type`, `deadlineAt`, `archived`, `postedAt`, `sourceId`, `remote`,
   `country`, stipend floor fields), index `{ userId: 1, score: -1, listingId: -1 }` (+ a deadline
   variant), filter + sort + cursor + `$limit` on `matches` first and `$lookup` only `limit + 1`
   listings; compute `total` with an indexed `countDocuments` (or cache it in Redis for 60 s, it
   is display-only). Also set `maxTimeMS` (e.g. 5 s) on feed aggregations so abandoned requests
   cannot keep mongod busy. Re-run: `node scripts/load-test.mjs` (see TESTING.md for the seed).
7. **OpenAPI vs behaviour** (`pnpm test:contract`, 3 of 10 failing):
   a. Only **12 / 60** operations are exercised by an API test (`src/**/*.test.ts`); the 48
      untested ones are printed by the suite (all of sources, feed, listings, tracker, alerts,
      push, notifications, settings, account). SPEC §8 asks for every route incl. ownership
      (user A vs user B), pagination edges and zod errors. The coverage gate also fails:
      lines 57.89 % < 85 %.
   b. `GET /v1/auth/google/url` and `GET /v1/push/vapid-public-key` return **503** when Google /
      VAPID are not configured; neither 503 is in `/openapi.json` (API.md documents it for
      `/auth/google/url` only). Add the 503 responses (and to API.md for the VAPID route).
   c. Unknown routes under `/v1` answer **401** without a session (the `authed` router's
      `requireAuth` runs before `notFoundHandler`); API.md §1.4 says unknown route → 404
      `NOT_FOUND`. Either mount the 404 for unknown `/v1/*` paths before `requireAuth`, or
      change API.md to say 401 first (then tell QA and the test follows).
   d. **39 / 60** operations document their 2xx body as a bare `{ type: object }`, so
      response validation is vacuous for them. Please give them real response schemas in
      `src/openapi.ts` (the zod DTOs already exist for most).
8. **Global limiter is per IP** (300 / 15 min, API.md §1.5). Behind a campus or office NAT every
   student shares one bucket, and one active user scrolling a large radar (25 items per page,
   plus prefetch, summary, notifications, me) can spend 300 requests in a few minutes. Suggest
   keying the global limiter by user id once `requireAuth` has run (e.g. 1,000 / 15 min per user)
   and keeping the per-IP limit for unauthenticated routes only.

## web-workspace (sources / alerts / tracker) → web-foundation

1. **[done: both already pinned in `apps/web/package.json`]** **Dependencies for `/sources` and `/tracker`** (code-split to those routes): `@dnd-kit/sortable`
   (keyboard sortable coordinates + `useSortable`, pairs with the `@dnd-kit/core@6.3.1` already in
   `apps/web/package.json`) and `@tanstack/react-table` (DESIGN §6.0 #8). If they are not in
   `package.json` when the tracker/sources screens need to compile, web-workspace adds them with
   `pnpm --filter @kestrel/web add -E` (exact pins, one command) and notes it in DECISIONS.
2. **[done: `vite.config.ts`, `vitest.config.ts` alias + `src/test/setup.ts` (jest-dom, jsdom polyfills)]** **`@/` alias in Vite and Vitest** (2026-10-27 19:20, blocks dev, build and every RTL test):
   `vite.config.ts` and `vitest.config.ts` do not resolve `@/*` (tsconfig `paths`), so
   `import { cn } from '@/lib/utils'` fails at runtime in both. Add
   `resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }` (or
   `resolve.tsconfigPaths: true`) to both, plus `test.setupFiles` with
   `@testing-library/jest-dom/vitest` for RTL matchers.
3. **[done: `src/mocks/{browser,server}.ts`, `src/mocks/handlers/index.ts` (sources/alerts/tracker already listed), `features/landing`; the monolithic `src/mocks/handlers.ts` was removed]** **Missing foundation modules** the app imports today: `src/mocks/browser.ts`
   (`startMockWorker`, imported by `main.tsx`), `src/mocks/handlers/index.ts` (the task brief for
   web-workspace says to add one line there; the per-feature files `sources.ts`, `alerts.ts`,
   `tracker.ts` export `sourcesHandlers`, `alertsHandlers`, `trackerHandlers`), and
   `@/features/landing/LandingScreen` (web-onboarding). There is also an untracked
   `src/mocks/handlers.ts` that shadows the `handlers/` directory for `import './handlers'`; pick
   one. web-workspace will add its line to `handlers/index.ts` once it exists.
4. **[done: `testDir: 'e2e'`, `testMatch: '**/*.spec.ts'` picks up every spec]** **`apps/web/playwright.config.ts`** (qa → web #1): until it lands, web-workspace runs
   `e2e/{sources,alerts,tracker}.spec.ts` with a scratch config (same projects and fake API as the
   QA config, `VITE_MOCK_API=1`). Please include those three specs in `testMatch` (or use the
   default `testDir: 'e2e'`).

## foundation → screens

Contract: `docs/WEB.md`. Items below are things the foundation changed or needs from a screen.

1. **[all screens] Tooltips need the shell.** `TooltipProvider` moved from the app root into
   `AppShell` (public pages ship without Radix). Screens inside the shell are unaffected. Anything
   rendered outside it (onboarding, `/welcome`, landing) must not use `@/components/ui/tooltip`
   (or must wrap its own `TooltipProvider`). Unit tests that render a screen with tooltips wrap
   `TooltipProvider` themselves.
2. **[all screens] Mock handlers.** `src/mocks/handlers/index.ts` lists every module in order; a
   new `handlers/<feature>.ts` must be added there (handlers array + `reset…Mock` in
   `resetMocks`). The foundation guard in front of them already enforces CSRF on mutations and
   401 when signed out, so feature handlers may drop their own copies. Shared state is
   `src/mocks/state.ts` (session, user, onboarding, settings, profile, notifications,
   tracker/alerts for the export, push); `/v1/me` reads settings and the unread count through
   your handlers via MSW `getResponse`, so keep `GET /v1/settings` and
   `GET /v1/notifications` returning the current state.
3. **[web-radar] Offline rows (qa → web #5).** Mutations now pause offline
   (`networkMode: 'online'`) and resume in order. To mark a row, read paused mutations for the
   listing, e.g. `useMutationState({ filters: { status: 'pending' }, select: (m) => m.state.isPaused && m.state.variables })`,
   and render `data-pending="true"` + sr-only "Waiting to sync".
4. **[web-radar] Push deep links.** The worker links listings as `/radar?listing=<id>`; the
   service worker rewrites that to `/radar/<id>` (`lib/push-url.ts`), so `/radar/:listingId`
   must open the drawer for that id (also from a cold load).
5. **[web-radar] Soft ask after the first save (USERFLOW §2).** Render `<PushSoftAsk />`
   (`@/components/push-soft-ask`) under the toolbar once, after the first successful save; it
   handles permission, subscription, the default push rule and the 14-day snooze itself.
6. **[web-onboarding] Privacy and Terms** now exist as public routes (`/privacy`, `/terms`,
   testids `privacy-page`, `terms-page`); link to them with `<Link>` where you link to policy.

## worker → api

Context: `docs/WORKER.md` §1 and §4 are the worker's side of API.md §12–§14. Everything the API
produces today (`ingest {sourceId, reason: created|enabled|pack}`, `embed {kind:'profile', userId}`,
`match {userId, reason}`, `notify {userId, alertRuleId, test:true}`) is accepted as is.

1. **Visibility should use `listings.sourceIds`** (array of every source the listing was seen in,
   worker-maintained). `sourceId` is only the last source that wrote the content. A deduped
   listing seen in a subscribed pack and also in an unsubscribed one may carry the unsubscribed
   `sourceId`, and the cold-start feed (`services/feed.ts`, `services/visibility.ts`
   `canSeeListing`, `lib/vector.ts` post-filter) would then hide it. Suggested filter:
   `{ $or: [{ sourceIds: { $in: ids } }, { sourceId: { $in: ids } }] }`. The worker already matches this way.
2. **`matches` are now written in the API.md §12 shape**: `FitResult` fields at the top level and
   `profileHash` = `profiles.profileHash`. A full recompute (`match {userId}`) deletes the
   user's matches for listings that are no longer visible, so after pack disable or source
   delete, enqueue `match {userId, reason:'sources'}` as documented (already done) and the warm feed follows.
3. **`listings.applyCheck`** is written exactly as `ApplyCheck` (plus `error`). `routes/feed.ts` needs no change.
4. **`SourceDTO.healthCode`** (same as qa → api #1): values `ok | not_modified | auth | notfound |
   ratelimited | network | parse | blocked | paused:credits`, nullable before the first run. Also
   available: `lastSuccessAt`, `consecutiveFailures`.
5. **Optional for the credit meter UI:** `crawler:cloud:remaining` (last `/v2/team/credit-usage`
   result, refreshed hourly) and `crawler:backend:reason` (`payment_required | daily_cap | low_balance:<n>`).
6. If `QUEUE_PREFIX` is ever set on the worker, the API's `Queue` instances must use the same `prefix`.
7. **Optional:** add `sourceIds` as a `filter` field to the Atlas index `listings_embedding`.
   Both sides could then filter visibility inside `$vectorSearch` instead of post-filtering.
8. **For `GET /v1/admin/overview` (BRIEF addendum):** recent source runs come from the
   worker-owned `sourceRuns` collection (`{sourceId, reason, status, startedAt, finishedAt,
   durationMs, found, new, updated, unchanged, errors[], backend, creditsUsed}`, index
   `{sourceId, startedAt:-1}`, 30-day retention). Queue depths: `Queue.getJobCounts()` on the 7
   queues plus `dead` (prefix `bull`). The crawler state is the Redis keys in WORKER.md §7, the
   same ones behind `/v1/sources/credits`. The worker's `GET :4001/metrics` has all of it too, but
   it is not exposed outside the compose network.

## worker → web

1. Notification deep links the worker writes (`notification.url` and the push `url`):
   `/radar?listing=<id>` (instant match, saved-listing deadline), `/tracker?item=<id>` (tracked
   deadline, nudges), `/alerts?rule=<id>` (rule test), `/settings/notifications` (settings
   test), `/radar?sort=fit` (rule digest), `/radar` (daily card). Please route these (`listing`,
   `item` and `rule` open the drawer, item or rule). Push payload: `{title, body, url, tag, notificationId, kind}`,
   which `src/sw.ts` already reads.
