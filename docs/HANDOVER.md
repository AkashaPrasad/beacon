# Beacon handover

The viva-ready summary of what Beacon is, where it runs, how it is built, what works, what is
pending, and what only the owner can do. Placeholders marked `<!-- orchestrator: fill after deploy -->`
are filled once the production deploy and the final test run have happened; nothing in them
should be treated as a result until then.

## 1. Product summary

Beacon is a MERN web application that aggregates internships, jobs, hackathons, scholarships and
fellowships, research programs and open-source programs from curated source packs and from any
URL a student adds. It ranks them with an explainable fit score against the student's parsed
resume and preferences, flags ghost and stale listings, alerts through web push and an in-app
notification centre, and tracks applications with follow-up nudges. It is free, BYOK for AI, and
works fully with AI switched off.

What distinguishes it:

- **Hybrid, explainable matching.** Vector retrieval, a deterministic weighted score and an
  optional LLM explanation. Every component's contribution is visible and the weights are sliders.
- **Cost-aware ingestion ladder.** ATS JSON API, then public API, then RSS or sitemap, then a
  crawler. 222 of the 338 seeded sources are verified ATS endpoints that cost nothing to poll.
- **Ghost and stale detection.** A points model with listed reasons, subtracted from the fit score.
- **Privacy-first AI.** Bring your own key (encrypted at rest), a consent toggle for sending
  resume text, and a full AI-off mode.
- **Crawler failover.** Firecrawl cloud first, a self-hosted standby EC2 instance second, started
  and stopped on demand.

## 2. Production URLs

| What                 | URL                                                    |
| -------------------- | ------------------------------------------------------ |
| Web app              | `https://beacon.spacesdrive.cc`                        |
| API                  | `https://api-beacon.spacesdrive.cc`                    |
| API reference        | `https://api-beacon.spacesdrive.cc/docs`               |
| Liveness / readiness | `https://api-beacon.spacesdrive.cc/healthz`, `/readyz` |
| Repository           | `https://github.com/AkashaPrasad/beacon` (public)      |

Region: AWS `ap-south-1` (Mumbai). Web on Cloudflare Pages (project `beacon`); API on EC2 behind
the Cloudflare proxy.

## 3. Architecture recap

```
Browser (React SPA, PWA + web push)       beacon.spacesdrive.cc   Cloudflare Pages
   └─► api-beacon.spacesdrive.cc          Cloudflare proxy → Elastic IP
          └─ EC2 t4g.small (arm64, 2 GB, ap-south-1a) · docker compose
               caddy :80/:443 → api :4000 (Express 5)
               worker :4001 (BullMQ, local embeddings)
               redis (queues, rate limits, credit meters; noeviction)
          ├─ MongoDB Atlas M0 (Mumbai) + Atlas Vector Search
          ├─ Firecrawl cloud → self-hosted standby EC2 t4g.large (normally stopped)
          └─ Meta Model API / BYOK OpenAI-compatible LLM; Web Push services
```

- **Monorepo:** pnpm workspaces and Turborepo. `apps/web`, `apps/api`, `apps/worker`,
  `packages/shared` (schemas, scoring, taxonomies, normalisers, deadline parser), `packages/ui`
  (tokens, primitives), `packages/config`.
- **Pipeline:** `ingest → extract → embed → match → notify`, plus `ghostcheck` (daily) and
  `cleanup` (nightly), all BullMQ queues with idempotent jobs and a dead-letter queue.
- **Feed:** Atlas `$vectorSearch` top 200, deterministic `computeFit`, optional LLM re-rank of the
  top 30 cached per `(user, listing, profileHash)`.
- **Auth:** Google authorization-code flow (ID-token path also accepted), JWT in an httpOnly
  `beacon_session` cookie, every query scoped by user.
- **Deploy:** `deploy-web.yml` publishes to Pages; `deploy-api.yml` builds arm64 images to GHCR
  and deploys over SSH using a GitHub OIDC role. Terraform and scripts under `infra/` and
  `scripts/`.

Detail: [ARCHITECTURE](./ARCHITECTURE.md), [INFRA](./INFRA.md), [RUNBOOK](./RUNBOOK.md),
[API](./API.md), [DECISIONS](./DECISIONS.md).

### Cost table (ap-south-1, on-demand, AWS Price List 2026-10-27)

| Item                                                           | Per month                                       |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `beacon-app` t4g.small, 730 h ($0.0112/h)                      | $8.18                                           |
| App root volume, 20 GB gp3                                     | $1.82                                           |
| Elastic IP (public IPv4, in use)                               | $3.65                                           |
| Standby root volume, 30 GB gp3 (billed while stopped)          | $2.74                                           |
| Standby t4g.large, only while running (about 20 h)             | $0.90                                           |
| Standby public IPv4, only while running (about 20 h)           | $0.10                                           |
| Data transfer out (first 100 GB free)                          | $0                                              |
| Cloudflare Free, Atlas M0, GitHub Actions + GHCR (public repo) | $0                                              |
| **Baseline**                                                   | **about $16.40; about $17.40 with standby use** |

Leaving the standby running all month by mistake adds about $36. AWS Free-plan credits, if they
apply to the account, cover this for the semester.

## 4. Environment variable reference

Names and purpose only. Values live in the git-ignored `secrets.env` and, in production, in
`/opt/beacon/.env` (composed by `scripts/lib/env.sh`). Each app has an `.env.example`.

**Identity and URLs**

| Name                                           | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `APP_NAME`, `DOMAIN`, `WEB_HOST`, `API_HOST`   | Product name and hostnames                                 |
| `WEB_URL`, `API_URL`                           | CORS origin, cookie scope, links in notifications          |
| `GITHUB_REPO`                                  | Repository slug used by deploy tooling                     |
| `NODE_ENV`, `PORT`, `HEALTH_PORT`, `LOG_LEVEL` | Runtime mode, ports (api 4000, worker 4001), log verbosity |

**Data**

| Name                        | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `MONGODB_URI`, `MONGODB_DB` | Atlas connection and database name                                 |
| `REDIS_URL`                 | BullMQ, rate limits, credit meters                                 |
| `VECTOR_SEARCH`             | `atlas` (`$vectorSearch`) or `memory` (in-process cosine fallback) |

**Auth and secrets at rest**

| Name                                       | Purpose                                                        |
| ------------------------------------------ | -------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (the secret is used for the code exchange) |
| `JWT_SECRET`                               | Signs the session cookie                                       |
| `ENCRYPTION_KEY`                           | AES-256-GCM key for user BYOK keys                             |

**AI**

| Name                                                       | Purpose                                                |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Server default LLM (Meta Model API, OpenAI-compatible) |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`                    | Local embeddings (`bge-small-en-v1.5`, 384-d)          |

**Crawling and the standby**

| Name                             | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `FIRECRAWL_API_KEY`              | Firecrawl cloud                                                      |
| `FIRECRAWL_DAILY_CREDIT_CAP`     | Global daily credit cap shown in the meter                           |
| `FIRECRAWL_SELF_HOSTED_URL`      | Standby base URL (`http://<private-ip>:3002`, no auth)               |
| `FIRECRAWL_INSTANCE_ID`          | EC2 instance the worker may start and stop                           |
| `FIRECRAWL_STANDBY_IDLE_MINUTES` | Idle time before the standby is stopped (default 20)                 |
| `AWS_REGION`                     | Region for the EC2 client (default credential chain, no static keys) |

**Web push**

| Name                                                     | Purpose          |
| -------------------------------------------------------- | ---------------- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push signing |

**Web build (Vite, browser-visible)**

| Name                                                                                | Purpose                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_VAPID_PUBLIC_KEY`, `VITE_SENTRY_DSN` | Build-time equivalents of the API values |

**Observability**

| Name         | Purpose                  |
| ------------ | ------------------------ |
| `SENTRY_DSN` | Optional error reporting |

**Infrastructure and CI (not read by the apps)**

| Name                                                                                              | Purpose                                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_PAGES_PROJECT` | DNS, Pages and SSL setup                                              |
| `CLOUDFLARE_PAGES_DEPLOY_TOKEN`                                                                   | Optional narrow "Pages: Edit" token for CI                            |
| `AWS_PROFILE`, `AWS_INSTANCE_TYPE`, `FIRECRAWL_INSTANCE_TYPE`                                     | Terraform inputs                                                      |
| `SSH_PUBLIC_KEY`, `SSH_PRIVATE_KEY_PATH`                                                          | Key pair for the two instances                                        |
| `REDIS_MAXMEMORY_POLICY`                                                                          | Optional override in `/opt/beacon/compose.env` (default `noeviction`) |

## 5. Status

### 5.1 What works

State as recorded in [PROGRESS](./PROGRESS.md) at the time of writing; re-verify against the
final test run below.

- Monorepo tooling, the shared domain library (850 tests, 99.7% line coverage), the design tokens
  and brand assets.
- 338 verified sources in 7 packs with live API samples (`seed/`).
- API: Google sign-in, profile and resume parsing, sources and detection, feed, tracker, alerts,
  settings.
- Worker: BullMQ pipelines for ingest, extract, embed, match, ghost check, notify and cleanup;
  per-kind fetchers; Firecrawl cloud and standby clients.
- Web: application shell, theming, auth, data layer, landing page and the feature screens
  (radar, deadlines, sources, alerts, tracker, settings, onboarding, notifications).
- Infrastructure code (Terraform, compose, Caddy, scripts) and the CI and deploy workflows.
- Atlas vector index `listings_embedding` created.

### 5.2 Pending

- Final lint, typecheck and test pass across all workspaces after the concurrent agent work.
- npm scope sweep from `@kestrel/*` to `@beacon/*`.
- Playwright E2E, axe, Lighthouse, security check and load test runs, recorded in `docs/TESTING.md`.
- Completing the infrastructure apply (standby in `ap-south-1b`), GitHub secrets, first deploy
  of web and API, GHCR visibility, and the production smoke test.
- First production ingest and verification of fit scores and a push alert.
- Screenshots (section 7).

### 5.3 Known limitations

- Some careers pages are bot-protected (403, 406, 429) and need Firecrawl with browser
  rendering; if Firecrawl also fails, the worker drops the source for that cycle.
- SmartRecruiters and Workday need a second request per posting for the description, so they cost
  more calls than other ATS kinds. Workday reports at most 2000 postings.
- Atlas M0 is a shared free tier with limited storage, search indexes (3) and no SLA.
- The single EC2 instance is a single point of failure by design; recovery is a redeploy
  ([RUNBOOK](./RUNBOOK.md)).
- Standby start-to-ready takes a few minutes, so the first crawl after failover is delayed.
  `<!-- orchestrator: fill after deploy -->` (measured time)
- Stipend comparison uses a static approximate FX table, not live rates.
- Web push depends on browser support and permission; iOS requires the installed PWA.
- Degree matching is a soft penalty because degree wording is too varied to cap on.

### 5.4 Test and quality results

| Check                                               | Result                                     |
| --------------------------------------------------- | ------------------------------------------ |
| `pnpm lint`                                         | `<!-- orchestrator: fill after deploy -->` |
| `pnpm typecheck`                                    | `<!-- orchestrator: fill after deploy -->` |
| `pnpm test` (unit and integration, with coverage)   | `<!-- orchestrator: fill after deploy -->` |
| `pnpm test:e2e` (Chromium, WebKit, iPhone viewport) | `<!-- orchestrator: fill after deploy -->` |
| axe, every route                                    | `<!-- orchestrator: fill after deploy -->` |
| `scripts/security-check.sh`                         | `<!-- orchestrator: fill after deploy -->` |
| `node scripts/load-test.mjs`                        | `<!-- orchestrator: fill after deploy -->` |
| `scripts/smoke-prod.sh`                             | `<!-- orchestrator: fill after deploy -->` |

### 5.5 Lighthouse scores

| Page                 | Performance                                | Accessibility | Best practices | SEO |
| -------------------- | ------------------------------------------ | ------------- | -------------- | --- |
| Landing (desktop)    | `<!-- orchestrator: fill after deploy -->` |               |                |     |
| Landing (mobile, 4G) | `<!-- orchestrator: fill after deploy -->` |               |                |     |
| Radar (mobile)       | `<!-- orchestrator: fill after deploy -->` |               |                |     |

Budgets are in `.lighthouserc.cjs`.

## 6. Owner manual steps

These cannot be done from the repository.

1. **MongoDB Atlas allow-list.** Atlas, Network Access, Add IP Address: `<APP_PUBLIC_IP>/32` (the
   Elastic IP, comment "beacon-app EIP"). Keep your own IP for seeding and `mongosh`. Once
   production reads and writes, remove `0.0.0.0/0`. The standby never talks to Atlas. If the
   Elastic IP ever changes, redo this step before deploying.
2. **Google OAuth client.** Google Cloud Console, APIs and Services, Credentials, the OAuth
   client:
   - Authorised JavaScript origins: `https://beacon.spacesdrive.cc` and `http://localhost:5173`.
   - Authorised redirect URIs: `https://beacon.spacesdrive.cc/auth/callback`,
     `http://localhost:5173/auth/callback` and `http://localhost:4173/auth/callback` (E2E).
     The redirect URI must match the API allow-list exactly.
3. **GHCR package visibility (once, after the first image push).** GitHub, Profile, Packages,
   `beacon-api`, Package settings, Change visibility, Public. Repeat for `beacon-worker`. Check
   that each package's Manage Actions access lists the `beacon` repository. Until then deploys
   still work through a short-lived token.
4. **Optional.** Add `CLOUDFLARE_PAGES_DEPLOY_TOKEN` (Pages: Edit only) to `secrets.env` and
   rerun `scripts/gh-secrets.sh`. Set a $20 AWS budget alert.

## 7. Screenshots

Capture these into `docs/screenshots/` after the deploy, from production, with the demo account.
`<!-- orchestrator: fill after deploy -->`

| File                                     | Screen                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| `docs/screenshots/landing.png`           | Landing page, hero and scroll story                             |
| `docs/screenshots/onboarding-resume.png` | Onboarding resume step with the parsed, editable profile        |
| `docs/screenshots/radar.png`             | Radar feed with fit rings, why-it-fits chips and ghost badges   |
| `docs/screenshots/drawer.png`            | Listing drawer with score breakdown, matched and missing skills |
| `docs/screenshots/deadlines.png`         | Deadline timeline                                               |
| `docs/screenshots/sources-detect.png`    | Sources manager with a URL detected (kind, cost, credit meter)  |
| `docs/screenshots/alerts-builder.png`    | Alert rule builder (push and in-app only)                       |
| `docs/screenshots/tracker.png`           | Tracker kanban with a nudge                                     |
| `docs/screenshots/settings-ai.png`       | Settings, AI section (BYOK, consent, AI off)                    |
| `docs/screenshots/mobile-radar.png`      | Radar at phone width with the bottom tab bar                    |

## 8. Acceptance checklist

Adapted from SPEC §10 for Beacon: no email and no Telegram, so the alert check uses web push and
the in-app notification centre. Tick each item with the date once verified.

- [ ] 1. This document has the production URLs, screenshots (section 7) and test results (section 5.4).
- [ ] 2. Sign in with a fresh Google account, upload a resume, confirm the parsed profile is editable, add `https://boards.greenhouse.io/<any-company>` as a source, and confirm listings appear with fit scores, component breakdown and explanations.
- [ ] 3. Add a hackathon source (Devpost or Devfolio) and check the deadline timeline.
- [ ] 4. Create an alert rule (for example fit at least 80, type Internship, deadline within 14 days), use the test action, and confirm a web push arrives and an entry appears in the in-app notification centre.
- [ ] 5. Drag a card in the tracker on a phone: smooth, and Undo works.
- [ ] 6. Toggle dark mode, compact density and reduced motion: everything is readable and motion is suppressed.
- [ ] 7. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` locally once more, and Lighthouse on the production URL from a phone on 4G.
- [ ] 8. AWS Billing, Cost Explorer: a t4g.small plus Elastic IP is about $0.45 a day. A $20 budget alert is set.
- [ ] 9. The Firecrawl dashboard credits match the in-app credit meter.
- [ ] 10. Switch AI off in Settings: the feed still ranks and explains using embeddings and rules.
- [ ] 11. Standby drill: `scripts/firecrawl-standby.sh start`, `wait-ready`, `stop`; record the start-to-ready time in the RUNBOOK.
- [ ] 12. Read [DECISIONS](./DECISIONS.md); every decision can be defended in the viva.
