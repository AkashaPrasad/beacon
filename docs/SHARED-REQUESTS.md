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

Findings from the usability smoke (`e2e/smoke-all.spec.ts`, MSW mode, desktop Chromium +
iPhone 14, 2026-10-27 19:48 IST; `docs/TESTING.md` "Usability smoke" has the run log). Both
journeys complete end to end; what fails is axe serious/critical and console errors:

12. **[web-foundation] WCAG 2.5.3 label-in-name on the shell, every signed-in screen**:
    `global-search` shows "Search or jump…" but is named "Search or jump to…" (make the visible
    text a prefix of the name, e.g. `aria-label="Search or jump…"` or drop the aria-label), and
    `user-menu` shows the initials "AS" but is named "Account: Aarav Sharma" (start the name with
    the visible text, e.g. "AS, account menu for Aarav Sharma", or hide the initials from AT and
    keep the name). These two nodes are the only violation on sources, alerts, tracker, profile,
    settings (all four tabs) and notifications.
13. **[design/web-foundation] Contrast of `text-fg-tertiary`**: #7f7872 on #fcfbf9 is 4.2:1 and
    #736c65 on #ebe8e3 (hover row) is 4.23:1, below 4.5:1 for 13–14 px text. It is used for the
    radar row meta line ("Remote · ₹45k/mo · 2d ago · Greenhouse"), "Rolling", `text-deadline-far`
    countdowns and the ghost "low" badge (4.46:1). Radar first run: 59 nodes; deadlines: 15–22.
    Darken the tertiary token (light theme) to ≥ 4.5:1 or move text uses to `fg-secondary`.
14. **[web-onboarding] Landing**: the dimmed demo rows (`opacity-40`, "Data Analyst Intern",
    2.49:1) fail contrast, and 4–6 buttons whose `aria-label` truncates the visible title
    ("Platform Engineering…") fail label-in-name. If the demo is decorative, mark it
    `aria-hidden="true"` + `inert`; otherwise raise the contrast and drop the shortened labels.
15. **[web-radar] Drawer**: `div[aria-label="Loading tips"]` has an aria-label without a role
    (axe aria-prohibited-attr, serious): give it `role="status"` (or drop the label).
    `radar-fit-threshold` and the deadlines pills also fail label-in-name (deadlines: 47 nodes on
    desktop, 13 on phone): start each accessible name with the visible text.
16. **[web-onboarding] Resume step**: the skill proficiency toggle ("MongoDB proficiency: …")
    is below the 24 × 24 px target size with no spacing (WCAG 2.5.8 target-size).
17. **[packages/ui CompanyLogo] Console errors + privacy**: logos load from
    `https://www.google.com/s2/favicons?domain=…` (WebKit: `t3.gstatic.com/faviconV2`), which
    answers 404 for unknown domains, so every radar/sources page logs "Failed to load resource:
    404" (3–5 per screen in the smoke) and every company a student browses is sent to Google.
    Proxy/cache favicons through the API (or ship monograms only) so there are no third-party
    requests and no console errors.
18. **[web-foundation] Security headers for Pages**: there is no `apps/web/public/_headers`, so
    the web origin serves no CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` or
    `frame-ancestors` (`scripts/smoke-prod.sh` FAILs these). Add `_headers` for `/*` with at
    least `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Content-Security-Policy: frame-ancestors 'none'; …` (script/connect sources for the API
    origin, Google sign-in and MSW off in prod), and `Permissions-Policy`.
19. **[web-workspace] Alerts builder, "Type condition" popover**: in Chromium, clicking an option
    (e.g. "Hackathon") inside the popover opened from the New alert rule dialog never lands:
    Playwright reports `<div role="group" cmdk-group-items>` intercepting pointer events on the
    `cmdk-item`. jsdom tests do not hit-test, so `AlertsView.test.tsx` passes. Please check the
    item/group stacking (pointer-events or an overlay inside the nested popover); the smoke now
    saves the default rule instead so it can continue.

## qa → infra

1. **`api-beacon.spacesdrive.cc` fails the TLS handshake at Cloudflare** (2026-10-27 19:51 IST,
   `scripts/smoke-prod.sh`): `curl` → `sslv3 alert handshake failure` (alert 40) while
   `beacon.spacesdrive.cc` gets a valid edge certificate. Universal SSL (Free plan) covers the apex
   and **one** subdomain level (`*.spacesdrive.cc`); `api-beacon.spacesdrive.cc` is two levels
   deep, so no edge certificate exists for it. Options: Advanced Certificate Manager for
   `*.beacon.spacesdrive.cc` (paid), enable Total TLS (needs ACM), or move the API to a first-level
   name such as `beacon-api.spacesdrive.cc` (then update `API_HOST`, the Caddyfile, CORS, the
   web build's `VITE_API_URL`, Google origins and docs).
2. **`https://beacon.spacesdrive.cc` answers 522** (Cloudflare could not reach the origin): the
   DNS record exists but the Pages project / custom domain is not serving yet. Re-run
   `pnpm smoke:prod` after `deploy-web.yml`.

## qa → api

1. **[done: `src/services/serialize.ts`]** **`SourceDTO.healthCode`** (worker writes `healthCode`, e.g. `paused:credits`; see
   `apps/worker/src/models/source.ts`). The UI needs it to show a paused source distinctly from
   a failing one. Please expose it (nullable) in `GET /v1/sources` and `/v1/sources/:id`.
2. **[dropped 2026-10-27: load/soak tests are out of Phase B scope]** **Memory sample for the soak test**: `GET /healthz?mem=1` → `{ ok, mem: { rss, heapUsed,
heapTotal, external } }` (bytes, `process.memoryUsage()`), or a `/metrics` route. Public is
   fine if it reveals nothing else; otherwise require `Authorization: Bearer` with an admin user.
   `scripts/load-test.mjs --soak` samples it every 10 s.
3. **[dropped 2026-10-27: load and contract tests are out of Phase B scope]** **A way to mint a local token for load and contract tests**: e.g.
   `pnpm --filter @kestrel/api run dev:token -- --email load@beacon.test` (creates or reuses a
   user in the dev DB and prints a JWT for `Authorization: Bearer`). Never available when
   `NODE_ENV=production`.
4. **[done: verified by `scripts/security-check.sh`, `HttpOnly; SameSite=Lax; Path=/`]** **Logout cookie flags**: `POST /v1/auth/logout` clears `beacon_session` with the same
   attributes it is set with (`HttpOnly; SameSite=Lax; Path=/`, plus `Secure` in production).
   `scripts/security-check.sh` asserts the flags on that response, because a real Google token
   is not available in CI.
5. **[done: `import mongoose, { model, Schema }` + `mongoose.models[...]` in every model; `src/boot.test.ts` boots `src/index.ts` under Node ESM; verified 2026-10-27 with `pnpm --filter @kestrel/api dev` and `node dist/index.js` in the arm64 image]** **API does not boot under Node ESM** (2026-10-27 19:20, blocks `pnpm --filter @kestrel/api dev`,
   `node dist/index.js` and the Docker image; Vitest hides it because it interops CJS):
   `src/models/{user,profile,listing,source,settings,activity}.ts` do
   `import { model, models, Schema } from 'mongoose'`, and mongoose 9's ESM entry has no named
   export `models` (`node --input-type=module -e "import * as m from 'mongoose'; console.log('models' in m)"`
   → `false`). Boot dies with `SyntaxError: The requested module 'mongoose' does not provide an
export named 'models'`. Fix: `import mongoose, { model, Schema } from 'mongoose'` and
   `mongoose.models['User'] ?? model(...)`. Please add a boot smoke test (e.g. CI step
   `node dist/index.js` + `curl /healthz`) so it cannot regress. QA ran the API for load,
   security and contract checks through a scratch ESM resolve hook that re-exports `models`.
6. **[done (fit path): `services/feed.ts` sorts + applies the keyset on `matches` before the `$lookup` for `sort=fit` (new index `{userId, score:-1, listingId:-1}`), `total` cached 60 s in Redis, `maxTimeMS` 5 s on every feed aggregation; `deadline`/`posted` sorts still join first. Load test not re-run by the api agent]** **`GET /v1/feed` collapses under concurrency** (load test 2026-10-27, local API + docker
   mongo 8, 2,000 match docs for one user; `docs/TESTING.md` "Load"). One request: ~110 ms per
   page plus ~100 ms more on the first page for `total`. Throughput then _falls_ with concurrency:
   1 conn 4.5 req/s (p95 234 ms), 4 conns 4 req/s (p95 1,036 ms), 10 conns 2 req/s (p95 3,569 ms),
   50 conns 12 responses in 30 s and the rest timed out; mongod sat at ~850 % CPU and a single
   request after the run took 21 s while the backlog drained. SPEC target: p95 < 300 ms at 50.
   Cause (`src/services/feed.ts` `getFeed`): the pipeline `$lookup`s **every** match of the user
   into `listings` (plus the interactions lookup) _before_ `$sort`/`$limit`, and runs the whole
   thing a second time for `total`. Suggested fix: have the worker denormalise the filter/sort
   fields onto `matches` (`type`, `deadlineAt`, `archived`, `postedAt`, `sourceId`, `remote`,
   `country`, stipend floor fields), index `{ userId: 1, score: -1, listingId: -1 }` (+ a deadline
   variant), filter + sort + cursor + `$limit` on `matches` first and `$lookup` only `limit + 1`
   listings; compute `total` with an indexed `countDocuments` (or cache it in Redis for 60 s, it
   is display-only). Also set `maxTimeMS` (e.g. 5 s) on feed aggregations so abandoned requests
   cannot keep mongod busy. (Seeded with 2,000 synthetic listings from `@kestrel/shared` fixtures
   plus `computeFit` match docs for one user; re-run with `LOAD_TOKEN=… node scripts/load-test.mjs`.)
7. **[done: `pnpm test:contract` 10/10 with and without `CONTRACT_TOKEN` (2026-10-27): a. 70/70 operations have an API test, lines 87.6 % (floor 85); b. 503 documented for both routes; c. unknown `/v1/*` → 404 before auth (`AUTHED_PREFIXES`); d. partly: `MeResponse` and `ResumeUploadResponse` are typed, 44 operations still document a generic object]** **OpenAPI vs behaviour** (`pnpm test:contract`, 3 of 10 failing):
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
8. **[done: `middleware/rateLimit.ts` keys the global limiter by user id (1,000 / 15 min) when a validly signed session is present, per IP (300 / 15 min) otherwise]** **Global limiter is per IP** (300 / 15 min, API.md §1.5). Behind a campus or office NAT every
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
   must render that listing (now the full `ListingPage`, see #9), also from a cold load.
5. **[web-radar] Soft ask after the first save (USERFLOW §2).** Render `<PushSoftAsk />`
   (`@/components/push-soft-ask`) under the toolbar once, after the first successful save; it
   handles permission, subscription, the default push rule and the 14-day snooze itself.
6. **[web-onboarding] Privacy and Terms** now exist as public routes (`/privacy`, `/terms`,
   testids `privacy-page`, `terms-page`); link to them with `<Link>` where you link to policy.

## worker → api

Context: `docs/WORKER.md` §1 and §4 are the worker's side of API.md §12–§14. Everything the API
produces today (`ingest {sourceId, reason: created|enabled|pack}`, `embed {kind:'profile', userId}`,
`match {userId, reason}`, `notify {userId, alertRuleId, test:true}`) is accepted as is.

1. **[done: `services/visibility.ts` `visibleSourceFilter` / `canSeeListing`, `lib/vector.ts` (memory matrix + Atlas post-filter) and the feed all match `sourceIds` or `sourceId`; test `routes/additions.test.ts`]** **Visibility should use `listings.sourceIds`** (array of every source the listing was seen in,
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
4. **[done: `services/serialize.ts` `toSourceDTO` (+ `lastSuccessAt`, `consecutiveFailures`); test `routes/sources.test.ts`]** **`SourceDTO.healthCode`** (same as qa → api #1): values `ok | not_modified | auth | notfound |
ratelimited | network | parse | blocked | paused:credits`, nullable before the first run. Also
   available: `lastSuccessAt`, `consecutiveFailures`.
5. **[done: `GET /v1/sources/credits` and `/v1/admin/overview` return `backendReason` and `cloudRemaining`]** **Optional for the credit meter UI:** `crawler:cloud:remaining` (last `/v2/team/credit-usage`
   result, refreshed hourly) and `crawler:backend:reason` (`payment_required | daily_cap | low_balance:<n>`).
6. **[done: optional `QUEUE_PREFIX` env on the API, passed to every BullMQ `Queue`]** If `QUEUE_PREFIX` is ever set on the worker, the API's `Queue` instances must use the same `prefix`.
7. **Optional:** add `sourceIds` as a `filter` field to the Atlas index `listings_embedding`.
   Both sides could then filter visibility inside `$vectorSearch` instead of post-filtering.
8. **[done: `services/admin.ts` (sourceRuns last 20 with source name/kind, `getJobCounts` on the 7 queues + `dead`, crawler keys); verified live against `beacon_dev`]** **For `GET /v1/admin/overview` (BRIEF addendum):** recent source runs come from the
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
2. **[web-radar] `?listing=` deep links.** The worker writes notification links as
   `/radar?listing=<id>`. The root layout now rewrites that to `/radar/<id>` (replace) on arrival,
   and the service worker / bell do the same, so the radar only has to render `ListingPage` for the
   `:listingId` param (#9), including on a cold load and when the id is not in the current feed page
   (fetch `GET /v1/listings/:id`; a 404 shows "This listing is no longer available").
3. **[web-workspace] `/tracker?item=<id>`** must open that item: the root layout already rewrites it to `/tracker/<id>` (#9), so the
   item page handles it, cold load too; unknown id → quiet toast "That tracker item was removed." and the board), and
   **`/alerts?rule=<id>`** must scroll to and briefly highlight that rule (`accent-subtle` fade,
   reduced motion: static outline). `/settings/notifications` is already a route.
4. **[web-radar, web-workspace] Page-based detail views (owner requirement).** Detail views are
   full pages with Back, not drawers/sheets. Routes now in `src/app/routes.tsx` (lazy, named
   `Component`): `/radar/:listingId` → `features/radar/ListingPage.tsx`, `/tracker/:id` →
   `features/tracker/TrackerItemPage.tsx`, `/sources/:id` → `features/sources/SourcePage.tsx`,
   `/sources/packs/:id` → `features/sources/PackPage.tsx`, `/alerts/new` and `/alerts/:id` →
   `features/alerts/AlertEditorPage.tsx`. Each file currently holds a foundation **placeholder**
   (`DetailPagePlaceholder`, testids `listing-page`, `tracker-item-page`, `source-page`,
   `pack-page`, `alert-editor-page`): replace its body, keep the `Component` export and the
   page-root testid. `/sources/packs` renders `SourcesScreen` (Packs tab). The splat routes
   (`sources/*`, `alerts/*`, `tracker/:itemId?`, `radar/:listingId?`) were replaced by these.
   Use `<DetailPageHeader parent={{ label: 'Radar', to: '/radar' }} trail={[title]} title={…}
pager={{ onPrev, onNext, position: '3 of 142' }} actions={…} />` (`@/components/detail-page-header`,
   Back = in-app history else the parent, `Esc`/`Backspace` back, `k`/`j` prev/next) or
   `PageHeader` from `@kestrel/ui` with `back` / `breadcrumbs` / `pager`. `useBackNavigation(fallback?)`
   is in `@/lib/use-back-navigation`. Keep `ShellSlot name="drawer"` for small tasks only
   (quick peeks, not the main detail view). Lists should link rows to the page with `<Link>`
   (prefetch the detail query on hover/focus so the page paints from cache).

## api → web

1. **Onboarding save and resume** (API.md §4.1): `PATCH /v1/profile/onboarding { step, answers }`
   on every page and `POST /v1/profile/onboarding/complete { answers? }` at the end. Both return the
   full `MeResponse`, so `queryClient.setQueryData(queryKeys.me, body)`. `/v1/me.onboarding` now has
   `completed`, `step` (any slug the flow saved, legacy values still possible), `answers` and
   `updatedAt`. Answers merge per key and `null` deletes one; ids match
   `^[A-Za-z][A-Za-z0-9_-]{0,63}$`, step ids `^[a-z][a-z0-9-]{0,39}$`, 32 KB total. `nextPathFor` in
   `apps/web/src/api/me.ts` maps the legacy enum to `/onboarding/<step>`; once the new flow saves its own
   step ids, route from `onboarding.step` to your step table instead (and use `onboarding.completed`).
   MSW handlers for both routes are still to be added in `src/mocks/handlers/`.
2. **Resume upload accepts PNG and JPEG and reads scans with OCR** (API.md §4): the dropzone `accept`
   should include `image/png,image/jpeg`; the response has `extraction: 'text' | 'ocr'` and
   `ocr: { pages, confidence } | null`; for scans the first warning is "We read this from a scan —
   double-check the details." (show it on the "Here's what we found" step). A scan can take a few
   seconds (budget up to ~85 s), so keep the "Reading your resume…" state up and do not time the
   request out client-side before 90 s. `422 RESUME_NO_TEXT` now means "nothing readable even after
   OCR".
3. **`POST /v1/settings/ai/test`** reports `provider: 'server'` when it tested Beacon's default LLM.

## ux-spec → api (from docs/UX-RESTRUCTURE.md §6)

1. **[done: `GET /v1/feed/facets?<feed query>` → `FeedFacets` (API.md §6): fit presets (FIT_BANDS 80/60/40/0, cumulative, null while warming up), types, remote modes, deadline 7/14/30 + none, freshness 1/7/30; each facet ignores only its own filter; cached 60 s]** Accurate per-option filter counts on `GET /v1/feed/facets` (or embedded in `/v1/feed` as `facets`), scoped to the user's current filters.
2. **[done: `GET/PATCH /v1/settings/hints` → `{ tourDone, tourStep, tour { offeredAt, completedAt, dismissedAt }, tips { id: dismissedAt }, ui { railCollapsed, radarView: 'grid'|'list' }, updatedAt }` (API.md §10); this also covers the spec's A2 (`tour`, coach marks = `tips`, rail state = `ui`) without touching the shared `Settings` schema]** Server-side tour/tip state: `GET/PATCH /v1/settings/hints` `{tourDone, tourStep, tips: {[id]: dismissedAt}}`.
3. **[done: response adds `trackerItemId` + `tracker {id, stage}`; an already-tracked listing keeps its stage; unsave deletes only a `saved` item and re-numbers the column]** `POST /v1/listings/:id/save` also creates/returns the tracker item in stage `saved` (idempotent); unsave removes it if still in `saved`.
4. **[done: `FeedItemDTO.tracker` and `ListingDetail.tracker` (spec A4's `trackerStage` = `tracker.stage`)]** Feed items include `tracker: {id, stage} | null`.
5. **[done: `followUpsDue` = tracker items in `applied` with `lastActivityAt` ≥ 10 d ago (analytics followUp + moveOn), plus the spec's A5 `nextDeadlineAt`]** `GET /v1/feed/summary` includes `followUpsDue` (tracker items idle ≥ 10 d).
   Each has a client-side fallback documented in the spec; implement server-side where cheap.

## orchestrator → all web agents (binding reconciliation, 2026-10-27 late)

- Radar default view = **card grid** (owner), list view as a toggle; apply the spec's element budget per CARD (≤ 5 + one state slot). Keep the rail per spec §1 (5 open facets, fit presets, saved views on top). Drop the separate "Tune" popover only if sort + view toggle move into the page header.
- Save = add to Tracker as Saved (single verb everywhere); `a` = mark applied.
- Light mode default; muted professional palette as tints; type→colour map from docs/DESIGN.md.
