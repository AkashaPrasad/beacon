# Beacon — engineering brief (read this first, every agent)

Beacon is a production-quality MERN web app that aggregates **internships, jobs, hackathons,
scholarships/fellowships, research and open-source programs** from curated source packs and any
URL a student adds, ranks them with an **explainable fit score** against the student's parsed
resume + preferences, flags **ghost/stale listings**, alerts through **web push + in-app**, and
tracks applications with follow-up nudges. Free, BYOK for AI, privacy-respecting.

The full product spec is `docs/SPEC.md` (sections 1–8 are the source of truth; section 9 is the
original build prompt). This brief records the **decisions that override or refine SPEC**.

## Identity

- Product name: **Beacon** (one word). Metaphor: a beacon hovers, watches many things at once,
  and only dives when it has spotted something worth it. Tone: calm, precise, confident. Never
  "Supercharge your career ✨".
- Web: `https://beacon.spacesdrive.cc` (Cloudflare Pages project `beacon`)
- API: `https://api-beacon.spacesdrive.cc` (Cloudflare-proxied → AWS EC2, ap-south-1)
- GitHub: `AkashaPrasad/beacon` (public)
- Brand assets live in `apps/web/public/brand/` (source SVGs also in `brand/` at repo root).

## Repo layout (pnpm workspaces + Turborepo, Node 22+, TS strict)

```
apps/web/        Vite + React 19 + React Router 7 + Tailwind v4 + shadcn/ui + Motion + TanStack
apps/api/        Express 5 + Mongoose 8 + zod + helmet + pino, JWT httpOnly cookie
apps/worker/     BullMQ workers: ingest, extract, embed, match, ghostcheck, notify, cleanup
packages/shared/ zod schemas, types, scoring lib, taxonomies, normalisers, deadline parser
packages/ui/     design tokens (CSS vars) + shared primitives used by web
infra/terraform/ EC2 (app + firecrawl standby), SG, EIP, IAM, user-data
infra/compose/   docker-compose.prod.yml, Caddyfile, firecrawl compose for the standby box
.github/workflows/ ci.yml, deploy-web.yml, deploy-api.yml
docs/            SPEC, BRIEF, DESIGN, ARCHITECTURE, DECISIONS, PROGRESS, TESTING, RUNBOOK, HANDOVER
```

## Decisions that override SPEC

1. **No Telegram, no email (Resend).** Alert channels are **web push (VAPID) + in-app
   notification centre** only. Remove any email/Telegram option from UI, schemas and workers.
   The react-email dependency is not used.
2. **LLM default = Meta Model API** (`LLM_BASE_URL=https://api.meta.ai/v1`,
   `LLM_MODEL=muse-spark-1.3-contributor`, OpenAI-compatible chat completions,
   `response_format: {type:"json_object"}` works). It is a _reasoning_ model: reasoning tokens count
   toward `max_tokens`, so always set `max_tokens ≥ 4096` for structured outputs and parse
   `choices[0].message.content` as JSON (strip code fences defensively). Users may BYOK any
   OpenAI-compatible provider from Settings; **AI-off mode must work fully** (embeddings + rules).
3. **Firecrawl: cloud first, self-hosted standby second.** The worker uses a `CrawlerClient`
   abstraction with two backends: Firecrawl cloud (`FIRECRAWL_API_KEY`) and a self-hosted
   open-source Firecrawl (`FIRECRAWL_SELF_HOSTED_URL`, same REST shape, no auth). Switch rules:
   - cloud responds 402 (insufficient credits), or the global daily credit cap is hit, or
     `/v2/team/credit-usage` reports `remainingCredits < 20` → set a Redis flag
     `crawler:backend=selfhosted` with a 6 h TTL and route all scrape calls to the standby.
   - The standby runs on a **separate EC2 instance that is normally STOPPED**. Before using it the
     worker calls `ec2:StartInstances` (via `@aws-sdk/client-ec2`, instance role scoped to that one
     instance), waits until `GET {url}/health`-ish returns OK (poll `/v1/scrape` readiness), then
     proceeds. An idle timer (`FIRECRAWL_STANDBY_IDLE_MINUTES`, default 20) stops the instance
     again. This keeps AWS cost near zero while still being a real backup.
   - Both backends are behind the same per-day credit meter shown in the UI (self-hosted calls
     count as 0 cloud credits but are still counted for the user's view).
4. **Vector retrieval adapter.** DB is MongoDB Atlas (M0, Mumbai). Stage-1 retrieval uses
   Atlas `$vectorSearch` on `listings.embedding` when the index exists (`VECTOR_SEARCH=atlas`);
   otherwise (`VECTOR_SEARCH=memory`, used in tests and as graceful fallback) a worker-side
   in-process cosine scan over a cached `Float32Array` matrix. Scoring (stage 2) is identical.
5. **Resume parsing without AI must work.** Deterministic parser (unpdf/mammoth → text →
   sections → skills via taxonomy, grad-year/degree regex, links, email). LLM only enriches.
6. **Git:** the orchestrator commits at the end of each phase. Sub-agents **do not run `git commit`
   or `git push`**. Conventional-commit messages. **Never add any AI tool as co-author** (no
   `Co-Authored-By` trailers), never mention AI tools in README/package.json.
7. **Secrets:** `secrets.env` at repo root is git-ignored and already filled. Read values from it
   with `set -a; source secrets.env; set +a` when you need them for a real check. **Never read
   `info.txt`**, never print secret values, never commit them. Every app has a `.env.example`.
8. **Quality gates per phase:** `pnpm lint && pnpm typecheck && pnpm test` green. Do not claim
   something works that you haven't run.
9. Keep `docs/PROGRESS.md` updated (what was done / tested / pending) and `docs/DECISIONS.md`
   for every judgement call (one line each: decision, why, alternative rejected).

## Env var reference (names only; values in secrets.env)

APP_NAME DOMAIN WEB_HOST API_HOST WEB_URL API_URL GITHUB_REPO ·
CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID CLOUDFLARE_PAGES_PROJECT ·
AWS_PROFILE AWS_REGION AWS_INSTANCE_TYPE FIRECRAWL_INSTANCE_TYPE SSH_PUBLIC_KEY SSH_PRIVATE_KEY_PATH ·
MONGODB_URI MONGODB_DB REDIS_URL · GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET JWT_SECRET ENCRYPTION_KEY ·
LLM_PROVIDER LLM_BASE_URL LLM_API_KEY LLM_MODEL EMBEDDING_PROVIDER EMBEDDING_MODEL ·
FIRECRAWL_API_KEY FIRECRAWL_DAILY_CREDIT_CAP FIRECRAWL_SELF_HOSTED_URL FIRECRAWL_INSTANCE_ID ·
VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT · SENTRY_DSN

## Local tooling available

Node 26, pnpm 12, Docker 29, Terraform 1.16, AWS CLI (profile `claude-dev`, admin, ap-south-1),
gh (logged in as AkashaPrasad), wrangler 4, mongosh. Atlas cluster reachable from this machine.

## UX north star

Dense, keyboard-first, fast, calm. Study Linear (density, shortcuts), Raycast (palette),
Vercel (tables/empty states), Notion Calendar (timeline), Read.cv (profile). Every list has
skeleton / empty-with-next-action / error-with-retry states. Optimistic updates with undo toasts.
Mobile: bottom tab bar, bottom-sheet drawer, swipe gestures on cards. WCAG 2.2 AA. Motion
150–250 ms, spring easing, purposeful only, honours `prefers-reduced-motion`.

## Addendum (2026-10-27, after wave 1)

- **The product is named Beacon** (renamed from Kestrel). Hosts `beacon.spacesdrive.cc` / `api-beacon.spacesdrive.cc`, repo `AkashaPrasad/beacon`, cookie `beacon_session`, localStorage prefix `beacon:`, brand files `brand/beacon-*.svg`. The npm scope stays `@kestrel/*` **until the orchestrator sweeps it to `@beacon/*` in one pass at the end of wave 2** — do not rename package scopes yourself; just use "Beacon" in every user-facing string, doc and config name.
- **Polish mandate (owner's words): "crazy landing page, crazy UI and UX … just like Apple's software, how seamless and smooth it is, all the small things."** Concretely: every interaction has a considered press/hover/focus state; transitions use shared layout (`layoutId`) where an element moves between states; lists use layout animations on reorder/remove; skeleton→content crossfades (never a pop); numbers count up; drawers/sheets are spring-driven and interruptible; nothing janks (transform/opacity only, no layout thrash, virtualised lists); scroll-driven storytelling on the landing page; haptic-feeling spring curves. All of this still honours `prefers-reduced-motion` and the 250 ms ceiling for UI chrome (landing storytelling may use scroll-linked progress instead of durations). `docs/MOTION.md` (being written by the design agent) is the authoritative spec for this.
- **Owner priority (verbatim intent): everything must work seamlessly and fast, UX must be very good and user-friendly, while keeping ALL options.** Rule: never remove a capability to simplify a screen — use progressive disclosure instead (smart defaults first; advanced controls one click away in a popover/sheet/"More" section; power features reachable by keyboard and ⌘K). Speed is a feature: optimistic updates everywhere, prefetch on hover/focus, persisted query cache, skeletons within 100 ms, no spinner-only screens, route code-splitting, interactions never block on the network.
- **Email + password sign-in (owner request, 2026-10-27 evening):** in addition to Google, users can register/login with email + password (`POST /v1/auth/register`, `POST /v1/auth/login`; argon2id or bcrypt(12); zod password rule ≥ 8 chars; rate-limited; same `beacon_session` cookie). No email verification/reset (no email provider) — say so honestly in the UI. **Admin account:** seeded on API boot from `ADMIN_EMAIL`/`ADMIN_PASSWORD` with `role: 'admin'`; `GET /v1/admin/overview` (users, listings, sources by health, queue depths, crawler backend + credits, recent source runs) guarded by `requireRole('admin')`; web `/admin` screen (foundation-owned) shows it as a compact ops dashboard. Users have `role: 'user' | 'admin'`; `/v1/me` returns it.
- **Domain focus (owner, 2026-10-27 evening): Beacon is for students in tech** — software, data/ML, DevOps/cloud, security, product/UX-for-tech, research in CS. Everything the user sees must be tech-specific and useful: onboarding questions (stack/languages, role families limited to tech, GitHub/portfolio links, project types, open-source/hackathon/competitive-programming interest, target companies), preference options, role/skill chips shown in UI (the shared taxonomy may keep non-tech entries, but UI pickers surface tech families first and hide the rest behind "Other"), source packs (already tech), marketing copy ("for students in tech"), examples and demo data. No generic "any career" framing.
