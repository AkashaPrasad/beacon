# Progress

Running log of what is done, what was verified, and what is pending. Each phase records the
commands that were actually run. Agents append to their phase; the orchestrator commits.

## Phase checklist

Status as of 2026-10-27, from the files on disk. "In progress" means code exists but the phase
gates (`pnpm lint && pnpm typecheck && pnpm test`, plus the phase's own checks) have not been
confirmed green after the concurrent agent work.

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Discovery | done | BRIEF, SPEC, DESIGN, MOTION, USERFLOW, INFRA written |
| 1. Monorepo and tooling | done | pnpm, Turborepo, lint, hooks, Dockerfiles |
| 2. `packages/shared` | done | 850 tests, 99.7% line coverage |
| 3. API | in progress | routes for auth, profile, sources, feed, tracker, alerts, settings; seed loader; `docs/API.md` |
| 4. Worker | in progress | fetchers, pipelines, crawl client, scheduler; integration test present |
| 5. Web foundation | in progress | shell, theming, auth, data layer, shadcn primitives |
| 6. Web screens | in progress | radar, deadlines, sources, alerts, tracker, settings, onboarding, notifications, profile |
| 7. Notifications (web push and in-app only) | in progress | notify pipeline and notification centre exist; end-to-end push unverified |
| 8. Testing and hardening | in progress | Playwright specs (a11y, keyboard, offline, edge cases), load and security scripts exist; `docs/TESTING.md` and recorded results pending |
| 9. Infra and deploy | in progress | Terraform, compose, workflows and scripts written; apply partly done, standby AZ move to ap-south-1b, GitHub secrets, first deploy and smoke test pending |
| 10. Seed and polish | pending | 338-source seed done; first production ingest, `@beacon/*` scope sweep, UX audit, screenshots and handover results pending |

---

## Phase 1: monorepo and tooling (done)

**Delivered**
- pnpm 12.8.1 workspaces (`apps/*`, `packages/*`) + Turborepo 2.11 (`turbo.json`: `build`,
  `lint`, `typecheck`, `test`, `dev`; all depend on `^build`). Node `>=22` (`.nvmrc` 22).
- `packages/config`: `tsconfig.base|node|library|react.json`, ESLint 10 flat-config factories
  (`node`, `library`, `react`: typescript-eslint type-checked, import-x order, react-hooks,
  react-refresh, prettier), Prettier config.
- `apps/web`: Vite 8 + React 19.3 + Tailwind 4.3 (`@tailwindcss/vite`), title "Beacon", imports
  `@kestrel/ui/tokens.css`, Vitest + Testing Library (2 tests).
- `apps/api`: Express 5, `/healthz` → `{ok:true}` on :4000, `/readyz`, `/v1/meta`, Mongoose
  connect helper (`MONGODB_URI`/`MONGODB_DB`), pino logger with redaction, zod env (tests: 4 app + 2 env).
- `apps/worker`: BullMQ skeleton: Redis connection (`REDIS_URL`), queues `ingest extract embed
  match ghostcheck notify cleanup` (`src/queues.ts`), health server :4001 `/healthz` + `/readyz` (5 tests).
- `packages/ui`: `cn()` (clsx + tailwind-merge); `tokens.css` is owned by the design agent.
- `.env.example` per app (names only). Production `Dockerfile`s for api and worker (multi-stage
  `node:22-alpine`, `pnpm deploy --prod`, non-root, heap 512/768 MB, `EXPOSE 4000/4001`,
  `HEALTHCHECK`), root `.dockerignore`, `docker-compose.dev.yml` (redis; mongo under profile `local-mongo`).
- Husky 9 + lint-staged 17 (prettier + eslint on staged files) + gitleaks pre-commit
  (local binary → Docker image → warn). `.gitleaks.toml`, `knip.json`, `.editorconfig`,
  `.prettierignore`, extended `.gitignore`.
- Root scripts: `dev build test test:e2e lint typecheck format format:check knip`.
- `git init -b main` (no commits; the orchestrator commits).

**Verified (commands run)**
```bash
pnpm install                                   # + pnpm approve-builds esbuild msgpackr-extract unrs-resolver
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # green before wave-2 agents started editing
pnpm --filter @kestrel/api deploy --prod <tmp> # pruned output imports @kestrel/shared, /healthz ok
docker build -f apps/api/Dockerfile -t beacon-api:phase1 .        # ok, 303 MB, arm64
docker run … beacon-api:phase1   → /healthz {"ok":true}, user node, NODE_OPTIONS=--max-old-space-size=512, health "healthy"
docker build -f apps/worker/Dockerfile -t beacon-worker:phase1 .  # ok (1.05 GB with wave-2 embedding deps)
docker run … beacon-worker:phase1 → /healthz ok, user node, --max-old-space-size=768
pnpm knip --workspace packages/shared --workspace packages/config --workspace .   # clean
git add -A && gitleaks git --pre-commit --staged --redact . && git reset   # 0 leaks; index left clean
git check-ignore info.txt secrets.env apps/api/.env                        # all ignored
```

## Phase 2: `packages/shared` (done)

**Delivered** (public API: `docs/SHARED-API.md`)
- zod 4 schemas + inferred types: user, profile, listing (SPEC §9 shape + `deadlineKind`,
  `archived`, `roleFamily`), source, trackerItem, alertRule (push/in-app only), notification,
  settings, weights, fit result, API DTOs (feed query, cursor pagination, detect-source,
  resume parse, errors). Patch schemas apply no defaults.
- Skill taxonomy: 781 skills, 24 categories, aliases, `extractSkills` (case-sensitive guards
  for Go/React/C/R/Excel…, c++/c#/.net/node.js edge cases), `canonicaliseSkill(s)`.
- Role taxonomy: 76 families in 7 groups, `classifyRole`, `resolveRoleFamily`, `areRolesRelated`.
- Normalisers: `normaliseUrl`, `canonicalKey`, `contentHash` (sha256, isomorphic),
  `normaliseCompany`, `normaliseTitle`, `normaliseLocation` / `inferRemote` / `normaliseCountry`
  (149 cities incl. 54 Indian, 57 countries), `parseStipend`, `toMonthlyAmount`, `convertCurrency`, `formatStipend`.
- Deadline parser (IST default, zones, ranges, relative, rolling, year inference).
- Scoring: `computeFit` (SPEC §4 exactly, explainable components/contributions/caps/penalty),
  `ghostRisk` (SPEC §3.1 G + stale), `dedupeListings`, `listingRichness`, `cosineSimilarity`,
  `normaliseWeights`.
- Constants (type labels/colour keys, stages, packs, default weights, scoring + ghost rules).
- Fixtures (`@kestrel/shared/fixtures`): 3 profiles, 12 listings across all 7 types (fictional).
- tsup build: ESM + CJS + d.ts; `source` export condition for Vite tree-shaking.

**Verified (commands run)**
```bash
pnpm --filter @kestrel/shared test     # vitest run --coverage: 14 files, 850 tests passed
#   Statements 99.2% · Branches 93.96% · Functions 100% · Lines 99.65%  (threshold: lines 90)
pnpm --filter @kestrel/shared lint     # clean
pnpm --filter @kestrel/shared typecheck
pnpm --filter @kestrel/shared build    # dist/index.{js,cjs,d.ts,d.cts} + fixtures.*
pnpm --filter @kestrel/web build       # 77.96 kB gz JS (shared tree-shaken via `source` condition)
```

## Gate status at hand-off (2026-10-27 18:42 IST)

`pnpm exec turbo run lint typecheck test build --continue` → 16/20 tasks green. The 4 failures are
confined to files that wave-2 agents created minutes earlier and are still editing:

| Task | Cause (owner) |
|---|---|
| `@kestrel/worker#lint`, `#typecheck`, `#build` | new `src/fetchers/*`, `src/lib/http.ts`, `src/models/*` (worker agent) |
| `@kestrel/web#lint` | 25 autofixable `import-x/order` errors in vendored `src/components/ui/*` (web agent; `eslint --fix` or lint-staged resolves) |
| `@kestrel/api#lint` (after the run) | new `src/lib/http.ts`, `src/lib/queues.ts` (API agent) |

All Phase 1/2-owned files lint, typecheck, test and build cleanly (`turbo … --filter` for
shared/ui/config/api, plus per-file eslint on the api/worker/web skeleton files).

## Pending / notes for the next agents

- Run `pnpm --filter @kestrel/web exec eslint . --fix` after each `shadcn add` (import order).
- Create the Atlas vector index `listings_embedding` (JSON in `docs/ARCHITECTURE.md` §5.1).
- If onnxruntime fails on Alpine (musl), build the worker with
  `--build-arg NODE_IMAGE=node:22-bookworm-slim` (see DECISIONS).
- npm scope sweep `@kestrel/*` → `@beacon/*` (orchestrator, one pass: package.json names and
  deps, `@kestrel/config/*` extends, eslint configs, `@kestrel/ui/tokens.css` import, ci.yml filters, docs).
- `test:e2e` is a no-op until `apps/web/playwright.config.ts` exists.

## Phase 4: worker (`apps/worker`, done 2026-10-27)

**Delivered** (contract and behaviour: `docs/WORKER.md`)
- 7 queues + `dead` (DLQ) + internal `maintenance`. API job shapes accepted as is (embed
  `{kind:'profile'}`, match `{userId, reason}`, notify `{userId, alertRuleId, test}`, ingest reasons
  `created|enabled|pack`). Ingest → extract → embed → match runs as a BullMQ flow.
- Fetchers: Greenhouse, Lever, Ashby, SmartRecruiters (list + detail), Workable (widget),
  Workday (POST paging + detail), Remotive, Arbeitnow, RemoteOK, Jobicy, The Muse, Adzuna (with
  keys), Devpost, Devfolio, Unstop, HackerEarth, Kaggle, RSS/Atom, sitemap, Firecrawl (index → ≤ 20
  detail pages, robots.txt). ETag / If-Modified-Since, 15 s timeouts, typed `SourceError` → source health.
- CrawlerClient cloud → self-hosted standby (402 / daily cap / < 20 remaining → 6 h), StandbyManager
  (EC2 Describe/Start/poll, readiness, idle stop every 5 min), `paused:credits` without a standby.
- Pipelines: ingest (upsert by source+externalId / canonicalKey / URL, seenCount, re-posts,
  sourceRuns, health), extract (rules for structured; LLM `generateObject` otherwise, cached, metered
  per owner), embed (bge-small, batch 16), match (visibility = API rule, vector stage 1 + per-type
  quota + pinned, `computeFit`, top-level FitResult, removal on recompute, incremental with floors,
  instant rules), ghostcheck (`applyCheck`, weekly), notify (push + in-app, dedupe, quiet hours,
  caps, digests, 7/3/1 d reminders incl. saved, nudges, rule test, 410 pruning), cleanup.
- Scheduler (per-source jittered repeatables + fixed jobs), graceful SIGTERM, `/healthz`
  `/readyz` `/metrics` (`beacon_worker_*`) on 4001.
- This session's contract fixes against API.md: collection names `tracker_items`, `alert_rules`,
  `push_subscriptions` (were camelCase); `matches` shape; `applyCheck`; `profiles.embeddedAt`; credit cap default 500.
- Worker image now defaults to `node:22-bookworm-slim` (onnxruntime fails on Alpine, see DECISIONS).

**Verified (commands run)**
```bash
pnpm --filter @kestrel/worker lint && pnpm --filter @kestrel/worker typecheck \
  && pnpm --filter @kestrel/worker test && pnpm --filter @kestrel/worker build
#   13 files: 109 passed, 1 skipped (opt-in model test); integration tests ran against local Redis
RUN_MODEL_TESTS=1 HF_HOME=<cache> pnpm --filter @kestrel/worker exec vitest run src/lib/embeddings.model.test.ts
#   cold ≈ 19 s (34 MB download); warm: load 134 ms, 1.5 ms/text, +81 MB RSS
set -a; source secrets.env; set +a; VECTOR_SEARCH=memory MONGODB_DB=beacon_dev REDIS_URL=redis://localhost:6379 \
  QUEUE_PREFIX=beacon-smoke WORKER_SCHEDULER=false HEALTH_PORT=0 \
  pnpm --filter @kestrel/worker exec tsx src/scripts/smoke.ts --board groww --llm --firecrawl https://example.com
#   Groww 10 + Devpost 173 listings, all extracted + 384-d embeddings; 183 matches for usr_aarav;
#   pipeline drained in 33 s; live LLM extraction OK (23.8 s); Firecrawl cloud scrape OK (1 credit)
docker build -f apps/worker/Dockerfile -t beacon-worker:wave2 .   # bookworm-slim, 1.16 GB, ok
#   in-container embedding 384-d ok (as node); /healthz /readyz /metrics ok; SIGTERM → exit 0 (3 runs)
```

**Pending / for other agents**
- API: use `listings.sourceIds` for visibility; expose `healthCode` (docs/SHARED-REQUESTS.md worker → api).
- Web: route the notification deep links (docs/SHARED-REQUESTS.md worker → web).
- First live standby drill (start → ready → scrape → idle stop) when the infra box is up; unit-tested only so far.
