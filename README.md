<p align="center">
  <img src="brand/beacon-mark.svg" width="72" alt="Beacon mark" />
</p>

<h1 align="center">Beacon</h1>

<p align="center">
  <strong>Every opportunity that fits you. Nothing that doesn't.</strong><br/>
  An explainable opportunity radar for students — internships, jobs, hackathons, scholarships, fellowships, research and open-source programs — from one feed.
</p>

<p align="center">
  <a href="https://beacon.spacesdrive.cc">beacon.spacesdrive.cc</a> ·
  <a href="https://api-beacon.spacesdrive.cc/docs">API docs</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/DESIGN.md">Design system</a> ·
  <a href="docs/TESTING.md">Testing</a>
</p>

<p align="center">
  <a href="https://github.com/AkashaPrasad/beacon/actions/workflows/ci.yml"><img src="https://github.com/AkashaPrasad/beacon/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/AkashaPrasad/beacon/actions/workflows/deploy-web.yml"><img src="https://github.com/AkashaPrasad/beacon/actions/workflows/deploy-web.yml/badge.svg" alt="Deploy web" /></a>
  <a href="https://github.com/AkashaPrasad/beacon/actions/workflows/deploy-api.yml"><img src="https://github.com/AkashaPrasad/beacon/actions/workflows/deploy-api.yml/badge.svg" alt="Deploy API" /></a>
  <img src="https://img.shields.io/badge/stack-MERN%20%C2%B7%20TypeScript-0b0b0b" alt="MERN TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-0b0b0b" alt="MIT" />
</p>

---

## The problem

Students discover opportunities across 10–30 tabs — LinkedIn, Internshala, Unstop, Devpost, Devfolio, scholarship portals and dozens of company career pages — then read every listing to find the eligibility line, guess whether they fit, screenshot deadlines, and track applications in a spreadsheet. Alerts are unfiltered spam, ghost jobs waste applications (≈1 in 5 listings), and ghosting is the norm.

Every existing tool covers one vertical (jobs _or_ hackathons _or_ scholarships), is US-centric, hides its matching logic, and charges for alerts. None lets a student say _"watch these 25 career pages and this hackathon site, and tell me only what fits me."_

## What Beacon does

- **One radar, every type.** Internships, full-time roles, hackathons, scholarships, fellowships, research and open-source programs in a single ranked feed.
- **Source-agnostic ingestion.** Paste any URL. Beacon detects the cheapest extraction path automatically: ATS JSON API (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Workday) → public API → RSS/sitemap → crawler fallback. 338 verified sources ship in 7 curated packs.
- **Explainable fit score.** A hybrid of semantic similarity, skill overlap, role alignment, eligibility, location and freshness — with user-adjustable weights. Every score shows _why it fits_ and _what's missing_. Never a black box.
- **Ghost and stale listing detection.** Age, repost count, dead apply links and boilerplate signals surface as a risk badge with reasons.
- **Deadline-first UX.** Hackathons and scholarships live on a timeline, not in a list.
- **Alerts that respect you.** Rule builder (_when fit ≥ 80 and type is Internship and deadline ≤ 14 days → push, instantly_), web push and in-app only, quiet hours, deadline reminders at 7/3/1 days.
- **Tracker with follow-up nudges.** Kanban from Saved to Offer, with nudges at 10 days of silence and a "move on" suggestion at 30.
- **Bring your own AI, or none.** The server default LLM can be replaced with your own OpenAI-compatible key (encrypted at rest), or disabled entirely — matching still works on local embeddings and rules.
- **Keyboard-first, fast, accessible.** `j/k` to move, `s` save, `h` hide, `a` track, `⌘K` palette. WCAG 2.2 AA, virtualised lists, Lighthouse-budgeted.

## How matching works

```
fit = 100 × ( 0.40·semantic + 0.25·skills + 0.15·role + 0.10·eligibility + 0.05·location + 0.05·freshness ) − ghost_penalty
```

1. **Retrieve** — MongoDB Atlas Vector Search returns the top 200 candidates for the student's profile embedding (`bge-small-en-v1.5`, 384-d, computed locally on CPU).
2. **Score** — a deterministic, fully explainable function (`packages/shared/src/scoring`) applies the weighted terms, hard-eligibility caps and ghost penalties. Each component's contribution is shown in the UI.
3. **Explain (optional)** — an LLM re-ranks the top 30 and writes _why it fits / gaps / tailoring tips_, cached per (listing, profile) so it runs once.

Weights are sliders. Hard constraints (citizenship, graduation year, on-site vs remote) are applied as visible caps, never silently.

## Architecture

```
Browser ──► Cloudflare Pages (React SPA, global CDN)              beacon.spacesdrive.cc
   │
   └──► api-beacon.spacesdrive.cc (Cloudflare proxy → AWS Elastic IP)
                 │
        ┌────────▼───────────────────────────────────────────┐
        │  AWS EC2 t4g.small (ARM, ap-south-1) · Docker Compose│
        │   caddy (TLS) · api (Express 5) · worker (BullMQ) · redis │
        └────────┬───────────────────────────────────────────┘
                 │                                  ┌──────────────────────────────┐
        MongoDB Atlas (Vector Search)               │ Firecrawl standby (EC2, stopped) │
        Firecrawl cloud · Meta Model API            │ auto-started when cloud credits  │
                                                    │ run out, auto-stopped when idle  │
                                                    └──────────────────────────────┘
```

Cost-aware by design: the frontend is static and free, the database is a free Atlas tier, and one small ARM instance runs everything else (≈ $16/month). The crawler standby stays stopped until it is needed. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/INFRA.md`](docs/INFRA.md).

## Tech stack

| Layer    | Choice                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Vite · React 19 · React Router 7 · Tailwind CSS v4 · shadcn/ui · Motion · TanStack Query / Table / Virtual · dnd-kit · cmdk · PWA + web push                |
| API      | Express 5 · Mongoose · zod · helmet · express-rate-limit (Redis) · pino · Google Sign-In (ID-token / auth-code) · JWT in httpOnly cookie · OpenAPI from zod |
| Worker   | BullMQ · Firecrawl · `@huggingface/transformers` (local embeddings) · Vercel AI SDK (OpenAI-compatible) · web-push                                          |
| Data     | MongoDB Atlas (Vector Search) · Redis                                                                                                                       |
| Infra    | Terraform · Docker Compose · Caddy · GitHub Actions · Cloudflare Pages + DNS                                                                                |
| Quality  | TypeScript strict · ESLint · Vitest · Supertest · Playwright (+ axe) · Lighthouse CI · autocannon · gitleaks                                                |

## Repository layout

```
apps/web/          React SPA
apps/api/          Express API
apps/worker/       BullMQ workers: ingest · extract · embed · match · ghostcheck · notify · cleanup
packages/shared/   zod schemas, skill/role taxonomies, normalisers, deadline parser, scoring engine
packages/ui/       design tokens, motion constants, shared primitives
packages/config/   shared tsconfig / eslint / prettier
infra/terraform/   AWS: app instance, Firecrawl standby, security groups, IAM
infra/compose/     production Docker Compose, Caddyfile, Firecrawl self-host stack
seed/              338 verified sources in 7 packs, public API samples
scripts/           infra apply, Cloudflare setup, deploy, secrets, load/security checks
docs/              SPEC · ARCHITECTURE · DESIGN · MOTION · USERFLOW · API · TESTING · RUNBOOK · DECISIONS
```

## Running locally

Requirements: Node ≥ 22, pnpm ≥ 10, Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # fill MONGODB_URI, GOOGLE_CLIENT_ID, JWT_SECRET, ENCRYPTION_KEY …
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local

docker compose -f docker-compose.dev.yml up -d redis
pnpm dev                                    # web :5173 · api :4000 · worker :4001
```

Run the web app without a backend (mocked API, used by E2E tests): `VITE_MOCK_API=1 pnpm --filter @beacon/web dev`.

Environment variable names are documented in each app's `.env.example`; no values are committed.

## Quality gates

```bash
pnpm lint && pnpm typecheck && pnpm test    # unit + integration (Vitest, Supertest, mongodb-memory-server)
pnpm test:e2e                               # Playwright: Chromium, WebKit, iPhone viewport, axe on every route
scripts/security-check.sh                   # audit, gitleaks, headers, CORS, cookies, CSRF
node scripts/load-test.mjs                  # autocannon against the API
```

The full matrix, results and budgets are in [`docs/TESTING.md`](docs/TESTING.md).

## Deployment

- **Web** — `deploy-web.yml` builds `apps/web` and publishes to Cloudflare Pages on every push to `main`.
- **API + worker** — `deploy-api.yml` builds arm64 images to GHCR and deploys over SSH with `docker compose pull && up -d`.
- **Infrastructure** — `scripts/infra-apply.sh` runs Terraform, configures Cloudflare DNS/Pages, verifies the hosts and parks the Firecrawl standby.

Operations (logs, key rotation, scaling, restore, cost) are in [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Documentation

| Doc                                                                                    | Contents                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [SPEC](docs/SPEC.md)                                                                   | Research, problem statement, feature spec, matching algorithm, UI spec |
| [ARCHITECTURE](docs/ARCHITECTURE.md)                                                   | Data flow, queues, collections, indexes, vector search                 |
| [DESIGN](docs/DESIGN.md) · [MOTION](docs/MOTION.md) · [USERFLOW](docs/USERFLOW.md)     | Design system, motion spec, first-run and daily flows                  |
| [API](docs/API.md) · [WORKER](docs/WORKER.md) · [WEB](docs/WEB.md)                     | Service contracts                                                      |
| [DECISIONS](docs/DECISIONS.md)                                                         | Every judgement call, with the alternative rejected                    |
| [TESTING](docs/TESTING.md) · [RUNBOOK](docs/RUNBOOK.md) · [HANDOVER](docs/HANDOVER.md) | Quality, operations, status                                            |

## License

MIT © Akasha Prasad
