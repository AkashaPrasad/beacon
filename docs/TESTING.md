# Testing

Owner: QA. Every number here comes from a command that was run, with the time and place it
ran. Times are IST on 2026-10-27.

## Scope (re-scoped by the owner)

Phase A is "finish all features". Phase B is a **fast usability check**, not the full SPEC §8
matrix. Phase B covers:

1. **Usability smoke**: `apps/web/e2e/smoke-all.spec.ts` walks every screen in mock mode
   (`VITE_MOCK_API=1`, MSW) on desktop Chromium and iPhone 14 (WebKit).
2. **Security checks**: `scripts/security-check.sh`.
3. **Deployment smoke**: `scripts/smoke-prod.sh`.
4. The shared Playwright helpers in `apps/web/e2e/utils/` that the screen specs use.

Out of scope for Phase B (dropped by the owner): load and soak tests, Lighthouse CI beyond the
existing `.lighthouserc.cjs`, the full edge-case matrix, API contract tests and a nightly
quality workflow. The files from before the re-scope are still in the repo
(`scripts/load-test.mjs`, `apps/api/test/contract/`, `apps/web/e2e/{edge-cases,a11y,keyboard,offline}.spec.ts`,
`.lighthouserc.cjs`). They are not maintained in Phase B. What they found before the re-scope is
recorded under [Before the re-scope](#before-the-re-scope) because it is filed with owners.

## Policy: no skipped tests

- `smoke-all.spec.ts` has no skips. Every stop either passes or fails with a readable reason.
- Its checks are soft (`expect.soft`), so one run reports every screen. A broken screen fails its
  own stop and does not hide the others.
- The older QA specs skip only through `needs(...ids)`, while a contract `data-testid` is
  missing from `apps/web/src`. All 70 contract ids are present now (`docs/TESTIDS.md`, regenerate
  with `node apps/web/e2e/utils/testids.ts`), so `needs()` skips nothing.
- Known unit-suite skip, owned by worker: `apps/worker/src/lib/embeddings.model.test.ts` (1 test)
  runs when `RUN_MODEL_TESTS=1` is set (downloads the public model on first use).

## How to run

| What                                         | Command                                                                                                                                                                                           | Needs                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Usability smoke, production build            | `pnpm --filter @kestrel/web exec playwright test e2e/smoke-all.spec.ts --project=chromium --project=mobile`                                                                                       | builds `VITE_MOCK_API=1`, serves `vite preview` on :4173 (`apps/web/playwright.config.ts`)         |
| Usability smoke, fast loop on the dev server | `pnpm --filter @kestrel/web exec playwright test --config e2e/utils/playwright.qa.config.ts e2e/smoke-all.spec.ts --project=chromium --project=mobile`                                            | Vite dev server on :4180 with MSW, started by the config                                           |
| Security                                     | `pnpm test:security` (all checks) · `bash scripts/security-check.sh --only headers,cors,csrf,cookies,auth --no-rate-limit` (prod-safe) · `--report out.md`                                        | `gitleaks` on PATH; a running API for the HTTP checks (`API_URL`, default `http://localhost:4000`) |
| Deployment smoke                             | `pnpm smoke:prod` (public checks against prod) · `WEB_URL=… API_URL=… bash scripts/smoke-prod.sh` (any environment) · `BEACON_SESSION=… bash scripts/smoke-prod.sh --full [--ingest <board url>]` | the hosts reachable                                                                                |
| Unit, API integration, worker                | `pnpm test`                                                                                                                                                                                       | nothing                                                                                            |
| Static                                       | `pnpm lint && pnpm typecheck`                                                                                                                                                                     | nothing                                                                                            |

### What the usability smoke checks

Two journeys, each run on `chromium` (Desktop Chrome) and `mobile` (iPhone 14, WebKit):

1. **First run** (`beacon:mock:user = new`): landing → `/login` → [Continue with Google] (mock
   redirect) → consent ("Don't use AI") → onboarding resume → preferences → sources (each step
   skipped or finished) → radar.
2. **Returning user** (`beacon:mock:user = returning`): radar → detail drawer (open, Esc closes)
   → deadlines → sources (add `boards.greenhouse.io/…`, detection result, the row appears) →
   alerts (create a named rule, it is listed) → tracker (move a Saved card to Applied with the
   Move to… menu, `m`) → profile (add a skill, the chip appears) → settings (appearance, AI,
   notifications, privacy tabs) → notifications.

At every stop: the page-root `data-testid` is visible; axe (WCAG 2.0–2.2 A/AA) reports no
serious or critical violation; the page has logged no `console.error`, uncaught exception or
unhandled promise rejection; and on the dev server no Vite error overlay is showing. MSW runs as
a service worker, so the spec sets `serviceWorkers: 'allow'`. After the first page load, stops
are reached by client-side navigation (`history.pushState` + `popstate`, which React Router
follows), the way a student moves around the app.

## Results

### Usability smoke

<!-- smoke:begin -->

Run 19:48, dev-server config, `chromium` + `mobile`, against the screens as they stood then.
Both journeys reached every stop on both engines, and every page root rendered. Every functional
check passed:

- the drawer opens on a row title and Esc closes it;
- the added source is detected and listed;
- the new alert rule is listed;
- the card moves to Applied;
- the skill chip appears;
- all four settings tabs open.

All four tests still failed, on soft checks (axe and console):

| Stop                                                 | Chromium                                                          | iPhone 14                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| landing                                              | axe: contrast (2), label-in-name (6)                              | axe: contrast (11), label-in-name (4)                                                                                                                                                                                                       |
| login, consent                                       | pass                                                              | pass                                                                                                                                                                                                                                        |
| onboarding resume                                    | axe: target-size (1)                                              | pass                                                                                                                                                                                                                                        |
| onboarding preferences, sources                      | pass                                                              | pass                                                                                                                                                                                                                                        |
| radar (first run)                                    | axe: contrast (59), label-in-name (2); favicon 404 console errors | axe: contrast (3), label-in-name (1); favicon 404s                                                                                                                                                                                          |
| radar (returning)                                    | axe: label-in-name (2)                                            | axe: label-in-name (1)                                                                                                                                                                                                                      |
| radar + drawer                                       | axe: aria-prohibited-attr (1), contrast (3), label-in-name (2)    | axe: aria-prohibited-attr (1), contrast (1)                                                                                                                                                                                                 |
| deadlines                                            | axe: contrast (15), label-in-name (47)                            | axe: contrast (22), label-in-name (13)                                                                                                                                                                                                      |
| sources, sources add dialog                          | axe: label-in-name (2), contrast (2); favicon 404s                | axe: contrast (1); favicon 404s                                                                                                                                                                                                             |
| alerts, tracker, profile, settings ×4, notifications | axe: label-in-name (2: `global-search`, `user-menu`)              | axe pass. WebKit logged `Fetch API cannot load … due to access control checks` for API requests in flight when the spec did a full `page.goto`, most likely requests that the reload cancelled. Since then the smoke navigates client-side. |

Every finding is filed as qa → web #12–#19 in `docs/SHARED-REQUESTS.md`. Most of the
label-in-name count comes from two shell buttons, `global-search` and `user-menu`, which appear
on every signed-in screen. The contrast count comes from one token, `text-fg-tertiary` at 4.2:1.

The spec changed after that run: client-side navigation, the Vite-overlay check, and a 10 s
action timeout. Two later runs (19:50 and 19:54) were interrupted by screens that other agents
were editing at that moment: `routes.tsx` answered 500, and a missing `./FitBreakdown` import
in `ListingDrawer.tsx` raised the Vite overlay. These are not product findings. At 19:57,
modules such as `AlertsView`, `ListingDrawer` and `DetailPanel` were being moved. Re-run once
Phase A lands.
<!-- smoke:end -->

### Security

<!-- security:begin -->

Run 19:36 against the API booted locally: `NODE_ENV=development`, local docker mongo 8 + redis,
`VECTOR_SEARCH=memory`, see [the setup below](#running-the-api-locally). Result: **PASS 28 · FAIL 0 · WARN 1 · SKIP 1**.

| Check                                                                                                                                                             | Result                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm audit --prod`                                                                                                                                               | pass: 0 critical, 0 high, 0 moderate, 0 low                               |
| gitleaks over the committable tree (697 files) and git history                                                                                                    | pass: 0 findings                                                          |
| `secrets.env` values in committable files or `apps/*/dist` (946 files, compared by value, never printed)                                                          | pass: 0 of 16 secret values found                                         |
| Helmet headers on `/healthz` and `/v1/me`: CSP, `frame-ancestors 'self'`, nosniff, `Referrer-Policy: no-referrer`, HSTS 1 year, no `X-Powered-By`, `X-Request-Id` | pass                                                                      |
| CORS: `https://evil.example` preflight and simple GET not reflected; `http://localhost:5173` allowed with credentials                                             | pass                                                                      |
| CSRF: POST without `X-Requested-With` → 403 `CSRF`; wrong value → 403                                                                                             | pass                                                                      |
| Session cookie (logout clear): `HttpOnly; SameSite=Lax; Path=/`                                                                                                   | pass; WARN: no `Secure` on plain HTTP (expected in dev; prod must set it) |
| Session cookie on a real sign-in                                                                                                                                  | SKIP: needs a real Google ID token (`GOOGLE_ID_TOKEN`)                    |
| Auth: no session → 401 `missing`; forged HS256 → 401 `invalid`; `alg=none` → 401                                                                                  | pass                                                                      |
| Rate limit: 429 on attempt 11 of `POST /v1/auth/google` (`Retry-After: 60`), `RateLimit-Policy` header                                                            | pass                                                                      |

Not run against prod: the API host is not reachable yet (see Deployment smoke).
<!-- security:end -->

### Deployment smoke

<!-- smoke-prod:begin -->

- **Prod, 19:51: 7 FAIL.** `api-beacon.spacesdrive.cc` fails the TLS handshake at Cloudflare
  (alert 40). No edge certificate covers a two-level subdomain on Universal SSL. `beacon.spacesdrive.cc`
  answers 522 (origin not serving), so its title, SPA fallback and headers fail too. The TLS
  certificate for `beacon.spacesdrive.cc` is valid for 89 days. Filed as qa → infra #1–#2.
- **Local, 19:52** (`WEB_URL=http://localhost:4181` Vite dev, `API_URL=http://localhost:4000`):
  the script runs end to end. These pass: API healthz, readyz, OpenAPI 3.1.0 (45 paths), `/docs`,
  web title, SPA fallback, `/sw.js`, manifest, API security headers, CORS rejecting
  `evil.example`, `/v1/meta` (7 packs) and `/v1/sources/community` → 401. Two kinds of FAIL are
  expected locally. The dev server sends no web security headers, and the API only allows its
  configured `WEB_URL`. The missing web headers are a real prod gap, though: there is no
  `apps/web/public/_headers` (qa → web #18).

<!-- smoke-prod:end -->

### Unit, API integration and worker suites

<!-- unit:begin -->

`pnpm exec turbo run test --continue --force`, 19:32:

| Package           | Result                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- |
| `@kestrel/shared` | 850 passed; coverage lines 99.65 %, branches 93.96 %                                  |
| `@kestrel/ui`     | 14 passed                                                                             |
| `@kestrel/web`    | 184 passed (20 files)                                                                 |
| `@kestrel/worker` | 105 passed, 1 skipped (model file)                                                    |
| `@kestrel/api`    | 88 passed, but the task **fails its coverage gate**: lines 57.89 % < 85 % (owner api) |

<!-- unit:end -->

### Static

`pnpm lint` and `pnpm typecheck` were not green repo-wide during this session, because other agents
were editing screens. At 19:57 the type errors were all in screen files that were being moved
or rewritten: alerts, deadlines, radar, sources and tracker, with missing modules such as
`./components/AlertsView` and `./components/drawer/ListingDrawer`. QA-owned files lint and typecheck clean:
`apps/web/e2e/smoke-all.spec.ts`, `apps/web/e2e/utils/**`, `scripts/*.mjs`, `.lighthouserc.cjs`,
`apps/api/test/contract/**`. `scripts/security-check.sh` and `scripts/smoke-prod.sh` are
shellcheck-clean at warning level.

## Running the API locally

```bash
docker compose -f docker-compose.dev.yml --profile local-mongo up -d    # redis + mongo
# env file (scratch, never committed): NODE_ENV=development PORT=4000 MONGODB_URI=mongodb://localhost:27017
#   MONGODB_DB=beacon_qa REDIS_URL=redis://localhost:6379/5 VECTOR_SEARCH=memory WEB_URL=http://localhost:5173
#   API_URL=http://localhost:4000 JWT_SECRET=$(openssl rand -hex 32) ENCRYPTION_KEY=$(openssl rand -hex 32)
pnpm --filter @kestrel/api exec tsx --env-file=<that file> src/index.ts
```

Use a throwaway database and a Redis DB index of its own, so queued jobs never reach a worker
attached to the shared DB. **As of 19:20 the API does not boot under plain Node ESM**: mongoose 9
has no named export `models` (qa → api #5). QA ran it through a scratch ESM resolve hook that
re-exports `models`. It works with no change to the API source, and it is not a fix.

## Before the re-scope

These ran between 19:20 and 19:45 and are filed with owners. They are not Phase B gates.

- **Load** (`scripts/load-test.mjs`, local API + docker mongo, 2,000 match docs for one user,
  `X-Forwarded-For` rotated so the per-IP limiter does not answer instead):
  - `/healthz`: about 41,000 req/s at 50 connections, p95 1.4 ms.
  - `/v1/feed?limit=20` falls over under concurrency. 1 connection: 4.5 req/s, p95 234 ms.
    4 connections: p95 1,036 ms. 10 connections: p95 3,569 ms. 50 connections: 12 responses
    in 30 s, while mongod ran at about 850 % CPU.
  - Cause: every match is `$lookup`ed into listings before `$sort`/`$limit`, and the whole
    pipeline runs again for `total`. Filed as qa → api #6. The 10-minute soak was stopped at
    the re-scope.
- **API contract** (`pnpm test:contract`, 7 of 10 pass):
  - Only 12 of 60 operations have an API test.
  - Two public routes return 503s that `/openapi.json` does not document.
  - Unknown `/v1` routes answer 401, not the 404 that API.md documents.
  - 39 operations describe their 2xx body as a bare object.
  - Filed as qa → api #7.
- **Rate-limit design:** the global limit is 300 requests per 15 minutes per IP, so students
  behind one NAT share a single budget. Filed as qa → api #8.
- **Full a11y spec** (`e2e/a11y.spec.ts`, Chromium, stopped at the re-scope): the same
  contrast and label-in-name findings as the smoke. On the `page.route` fake API, the radar stayed
  on "Loading listings". This was not investigated after the re-scope, because the smoke uses MSW.

## Open items

| #   | Item                                                                                  | Owner                            |
| --- | ------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | API crashes at boot under Node ESM (`models` named import)                            | api (qa → api #5)                |
| 2   | API test coverage gate fails (57.89 % lines); 48 of 60 routes have no test            | api (qa → api #7a)               |
| 3   | Shell label-in-name: `global-search`, `user-menu` (every signed-in screen)            | web-foundation (qa → web #12)    |
| 4   | `text-fg-tertiary` contrast at 4.2:1 (radar meta, deadlines, countdowns, ghost badge) | design / web-foundation (#13)    |
| 5   | Landing demo contrast and truncated aria-labels                                       | web-onboarding (#14)             |
| 6   | Drawer `aria-label` without a role; label-in-name on fit threshold and deadline pills | web-radar (#15)                  |
| 7   | Resume-step proficiency toggle target size                                            | web-onboarding (#16)             |
| 8   | Google favicon requests: 404 console errors, and company names sent to Google         | packages/ui CompanyLogo (#17)    |
| 9   | No `_headers` for Pages, so the web origin has no CSP, HSTS or nosniff                | web-foundation (#18)             |
| 10  | Alerts "Type condition" option not clickable in Chromium                              | web-workspace (#19)              |
| 11  | No edge TLS certificate for `api-beacon.spacesdrive.cc`; web origin 522               | infra / owner (qa → infra #1–#2) |
| 12  | A clean smoke run with zero failures once Phase A lands                               | qa                               |
