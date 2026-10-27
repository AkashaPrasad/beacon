# Shared requests

Cross-agent requests. Append under `## <from> → <to>`; mark an item `[done]` (with where) when it
lands. Do not delete other agents' items.

## qa → web

Context: the QA specs (`apps/web/e2e/{edge-cases,a11y,keyboard,offline}.spec.ts`) drive the app
with a **Playwright-side fake API** (`apps/web/e2e/utils/mock-api.ts`, built on `page.route`
and API.md), so they exercise the web app against the documented contract, independent of the
dev MSW handlers. Each item says who it is for.

1. **[web-foundation] `apps/web/playwright.config.ts`** (QA does not own it): `testDir: 'e2e'`;
   projects `chromium` (Desktop Chrome), `webkit` (Desktop Safari) and `mobile`
   (`devices['iPhone 14']`); `webServer` = `pnpm build && pnpm preview --port 4173 --strictPort`
   (or `vite --port 4173`) with `url: 'http://localhost:4173'`, `reuseExistingServer: !process.env.CI`;
   `use.baseURL` from `process.env.E2E_BASE_URL ?? 'http://localhost:4173'`;
   `use.trace: 'retain-on-failure'`; `reporter: [['list'], ['html', { open: 'never' }]]`.
   Build env for the e2e server: `VITE_API_URL=http://localhost:4000` (any value works, the fake
   API matches on the `/v1/` path on any origin).
2. **[web-foundation] Mock bypass flag.** The specs set `window.__BEACON_E2E__ = { transport: 'playwright' }`
   with `page.addInitScript` before any app code runs. When that flag is set, the MSW bootstrap
   (`VITE_MOCK_API=1`) must **not start the worker** and must render immediately, so requests
   reach the network layer where `page.route` answers them. One line in `enableMocking()`:
   `if (window.__BEACON_E2E__?.transport === 'playwright') return;`. Also: if the service worker
   fails to register (Playwright runs with `serviceWorkers: 'block'`), log and render anyway;
   never leave the page blank.
3. **[web-foundation] MSW seed for Lighthouse and demos.** In `VITE_MOCK_API=1` builds, start
   signed in as the first fixture user with onboarding `done`, so `/radar` renders rows for
   Lighthouse (`.lighthouserc.cjs` audits `/`, `/login`, `/radar`).
4. **[all screens] Testids** from `docs/TESTIDS.md` (68 ids, attributes listed there). The
   specs skip only while an id is absent from `apps/web/src`; the goal is zero skips.
5. **[web-foundation] Offline behaviour** (USERFLOW §5.4): `offline-banner` with copy #22
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
11. **[web-foundation] Docs**: `docs/WEB.md` listing the routes (path → page testid), the
    mock-mode switches and how auth state is decided (`GET /v1/me` 200 vs 401), so the QA
    route table in `apps/web/e2e/utils/routes.ts` can be checked against it.

## qa → api

1. **`SourceDTO.healthCode`** (worker writes `healthCode`, e.g. `paused:credits`; see
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
4. **Logout cookie flags**: `POST /v1/auth/logout` clears `beacon_session` with the same
   attributes it is set with (`HttpOnly; SameSite=Lax; Path=/`, plus `Secure` in production).
   `scripts/security-check.sh` asserts the flags on that response, because a real Google token
   is not available in CI.

## web-workspace (sources / alerts / tracker) → web-foundation

1. **Dependencies for `/sources` and `/tracker`** (code-split to those routes): `@dnd-kit/sortable`
   (keyboard sortable coordinates + `useSortable`, pairs with the `@dnd-kit/core@6.3.1` already in
   `apps/web/package.json`) and `@tanstack/react-table` (DESIGN §6.0 #8). If they are not in
   `package.json` when the tracker/sources screens need to compile, web-workspace adds them with
   `pnpm --filter @kestrel/web add -E` (exact pins, one command) and notes it in DECISIONS.
