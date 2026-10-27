# Decisions

One line each: **decision** · why · alternative rejected. Sections are by area. Every judgement
call from the build is here; the detailed per-phase engineering log (kept verbatim, with the
numbers behind each call) follows in the appendix. Agents append new entries to the matching
section.

## Product

- **Named Beacon (renamed from Kestrel).** · The metaphor (hovers, watches many things, dives only on a worthwhile target) fits the product's behaviour and the hosts and brand were free. · Rejected: keeping Kestrel. The npm scope stayed `@kestrel/*` until one orchestrated sweep to `@beacon/*`, so no agent renamed packages piecemeal.
- **No email and no Telegram; alert channels are web push (VAPID) and the in-app notification centre only.** · Removes a third-party sender, DNS/DKIM setup and a bot token, and keeps notification data inside the product. · Rejected: Resend email digests and a Telegram bot (SPEC §3.1 E); `react-email` is not used.
- **Google Sign-In only, with the redirect authorization-code flow as the primary path (the ID-token credential path is also accepted).** · The API exchanges the code with `GOOGLE_CLIENT_SECRET`, verifies the ID token and sets an httpOnly `beacon_session` cookie. The redirect flow works in browsers that block third-party sign-in prompts and needs no Google script on the page. · Rejected: password flows, and the GIS pop-up as the only path.
- **Never remove a capability to simplify a screen; use progressive disclosure.** · Owner priority: all options kept, smart defaults first, advanced controls one click away or on the keyboard and ⌘K. · Rejected: trimming features for visual simplicity.
- **Free and BYOK; the product is not monetised.** · Matches the "free, privacy-respecting" positioning and keeps the cost model to infrastructure only. · Rejected: a paid AI tier.
- **Community sources are crawled once and shared; personal sources are per user.** · Ingestion cost scales with sources, not users. · Rejected: per-user crawling of the same career pages.

## Matching

- **Hybrid, explainable score: `100 · (0.40 semantic + 0.25 skills + 0.15 role + 0.10 eligibility + 0.05 location + 0.05 freshness) − ghost penalty`, with user-adjustable weights.** · Every component's contribution is shown, so a score can be defended line by line. · Rejected: an LLM-only ranker (opaque, costly, not reproducible).
- **Three stages: Atlas `$vectorSearch` top 200, deterministic `computeFit`, optional LLM re-rank of the top 30 cached per `(user, listing, profileHash)`.** · Cheap retrieval first, pure scoring second, the paid step last and run once. · Rejected: scoring every listing with an LLM.
- **Vector retrieval adapter: `VECTOR_SEARCH=atlas`, with an in-process cosine scan (`memory`) for tests and as a graceful fallback.** · Tests and a missing index must not break the feed. · Rejected: hard dependency on Atlas Vector Search.
- **Local embeddings: `bge-small-en-v1.5` (384-d, L2-normalised) in the worker through transformers.js.** · No per-call cost, no resume text leaves the box, about 100 MB. · Rejected: a hosted embedding API.
- **Hard constraints are visible caps, never silent filters (eligibility 35, remote-only vs on-site 50, deadline passed 20).** · SPEC rule "never silently"; the reason is listed in `caps[]`. · Rejected: dropping the listing.
- **Resume parsing works without AI (unpdf/mammoth, sections, skill taxonomy, regexes); the LLM only enriches.** · AI-off mode must work end to end. · Rejected: LLM-only parsing.
- **Ghost risk is a points model with listed reasons (age, reposts, dead or redirecting apply link, boilerplate, identical open roles, not seen for 14 days), capped at 100; penalty = score / 5.** · Auditable and cheap; responds to the documented ghost-listing problem (about 1 in 5). · Rejected: a single opaque "ghost probability".
- **No semantic similarity available: redistribute its weight over the other terms.** · Treating it as 0 would cap every score at 60. · Rejected: zero.
- **Default stipend weight 0.** · SPEC §4's formula has no stipend term and is reproduced exactly; the slider can raise it. · Rejected: adding an unspecified term.
- **Dedup by union-find over `canonicalKey` or normalised apply URL; geography is part of the key.** · Merges cross-board duplicates without merging "Google India" into "Google". · Rejected: title-and-company only.

## Data sources

- **Cost-aware ingestion ladder: ATS JSON API, then public API, then RSS or sitemap, then crawler.** · 222 of 338 seeded sources (66%) are verified ATS endpoints and cost nothing. · Rejected: crawling everything with Firecrawl.
- **`ETag` / `If-Modified-Since` polling and a `contentHash` gate.** · Unchanged text triggers no extraction, embedding or matching. · Rejected: re-processing every poll.
- **Firecrawl cloud first, a self-hosted standby second.** · A real backup that costs almost nothing while idle. · Rejected: cloud-only (a credit outage would stop ingestion) and an always-on self-hosted box.
- **Failover rules: cloud 402, the global daily cap, or `remainingCredits < 20` sets the Redis flag `crawler:backend=selfhosted` (6 h TTL).** · A single, observable switch. · Rejected: per-request retry against the standby.
- **The standby is a separate EC2 instance that is normally stopped; the worker starts it with `ec2:StartInstances` and stops it after `FIRECRAWL_STANDBY_IDLE_MINUTES` (20).** · Near-zero idle cost (a 30 GB volume, about $2.74/month). · Rejected: always-on standby ($32.70 a month more).
- **Credit meter counts both backends; self-hosted calls cost 0 cloud credits but still show.** · The user sees real usage. · Rejected: hiding standby calls.
- **Seed packs contain only endpoints verified live on 2026-10-27; wrong-company slugs were dropped and bot-protected pages kept as `firecrawl`.** · See `seed/VERIFICATION.md`. · Rejected: guessing slugs.
- **Fixtures use fictional organisations only.** · They feed the public landing demo; fake postings attributed to real companies could mislead. · Rejected: realistic real-company samples.

## AI

- **Default LLM is the Meta Model API (`muse-spark-1.3-contributor`, OpenAI-compatible).** · Free for the project; supports JSON mode. · Rejected: a paid default provider.
- **Always `max_tokens ≥ 4096` and parse `choices[0].message.content` as JSON, stripping code fences.** · It is a reasoning model, so reasoning tokens count toward `max_tokens`. · Rejected: small token budgets (truncated JSON).
- **BYOK: any OpenAI-compatible provider, key encrypted with AES-256-GCM (`ENCRYPTION_KEY`), never logged, never returned (last 4 characters only).** · Users control cost and data. · Rejected: storing keys in plaintext or returning them to the client.
- **Consent toggle for sending resume text to an AI provider, and an AI-off mode.** · The default tier may use prompts for training. · Rejected: implicit consent.
- **LLM calls are zod-validated, 30 s timeout, 2 retries, per-user daily cap, cached.** · Bounded cost and failure modes. · Rejected: unbounded retries.

## Frontend

- **Vite 8, React 19.3, React Router 7, Tailwind 4.3, shadcn/ui, Motion, TanStack Query/Table/Virtual, dnd-kit, cmdk.** · Latest stable on 2026-10-27, matching the brief. · Rejected: Next.js (no server rendering needed; the SPA is static on a CDN).
- **Static SPA on Cloudflare Pages.** · Free, global, nothing to run on AWS for it. · Rejected: serving the SPA from the EC2 box.
- **Vite resolves `@kestrel/shared` through a `source` export condition.** · Per-module tree-shaking took the placeholder page from 127 kB to 78 kB gzipped. · Rejected: a single-file tsup bundle for the browser.
- **Polish mandate: shared-layout transitions, spring motion within 150–250 ms, optimistic updates with undo, skeletons within 100 ms, virtualised lists, `prefers-reduced-motion` honoured.** · Owner's brief: Apple-grade smoothness. · Rejected: spinner-only screens and blocking on the network.
- **Alerts and push UI show web push and in-app only.** · See Product.
- **Vite env names use the `VITE_` prefix (`VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_VAPID_PUBLIC_KEY`, `VITE_SENTRY_DSN`).** · Vite exposes only `VITE_*` to the browser. · Rejected: unprefixed names.

## Backend

- **Express 5, Mongoose 9.11, zod 4, pino with redaction, BullMQ 6.5 with ioredis 6.** · Latest stable on 2026-10-27 (Mongoose 9 instead of the brief's 8). · Rejected: pinning Mongoose 8.
- **JWT in an httpOnly, Secure, SameSite=Lax cookie, with a CSRF check and every query scoped by `userId`.** · Not readable by scripts; ownership enforced in one place. · Rejected: tokens in localStorage.
- **The API never loads the embedding model or crawls; the worker owns all heavy work.** · Keeps the API light on a 2 GB box. · Rejected: one process doing both.
- **Idempotent jobs: deterministic `jobId` per entity, upserts keyed by a natural key, 3 attempts with exponential backoff, dead-letter queue.** · Retries and duplicate triggers are safe. · Rejected: fire-and-forget jobs.
- **Patch DTOs are separate schemas with no defaults.** · zod 4 applies defaults inside `.partial()`, so a PATCH would reset omitted fields. · Rejected: `.partial()` of the create schema.
- **`ghostRisk.reasons` are `{ code, message, points }` objects.** · The UI shows each reason and the points are auditable. · Rejected: bare strings.
- **Isomorphic shared package; sha256 through `@noble/hashes`, not `node:crypto`.** · `contentHash` also runs in the browser. · Rejected: Node-only hashing.

## Infra

- **One t4g.small (arm64, 2 GB) runs caddy, api, worker and Redis; frontend on Pages; DB on Atlas M0.** · About $16 a month; no Chromium on the box because Firecrawl renders remotely. · Rejected: a larger instance or managed Redis.
- **Standby AZ moved to `ap-south-1b` (variable `firecrawl_availability_zone`).** · A t4g.large capacity shortage in ap-south-1a was seen on 2026-10-27; the app box stays in 1a and cross-AZ traffic inside the VPC is fine at this volume. · Rejected: waiting for capacity, or moving the app box.
- **Redis `maxmemory-policy noeviction`, not SPEC's `allkeys-lru`.** · BullMQ requires it (LRU can silently evict job and lock keys); `docker-compose.dev.yml` uses it too. Override with `REDIS_MAXMEMORY_POLICY` in `/opt/beacon/compose.env`. · Rejected: following SPEC literally.
- **Node heap caps of 384 MB (api) and 640 MB (worker), not SPEC's 512/768.** · A heap equal to the 512 MB cgroup limit gets OOM-killed before V8 can collect, and onnxruntime memory lives outside the heap. · Rejected: the SPEC values.
- **GitHub OIDC role opens port 22 to the runner IP for the duration of a deploy only.** · SSH is otherwise restricted to the owner's IP and hosted-runner IPs are unpredictable. · Rejected: opening 22 to the world; SSM Run Command (more IAM and agent surface).
- **Native `ubuntu-24.04-arm` runners build the arm64 images.** · Free for public repos and avoids QEMU. · Rejected: QEMU on x86 (5–10x slower).
- **Firecrawl API from the published image; `playwright-service` and `nuq-postgres` built from the pinned tag (v2.11.162).** · Fast first boot, and the schema and scraper match the release. · Rejected: a full source build (about an hour on a t4g.large).
- **Let's Encrypt HTTP-01 through the Cloudflare proxy, SSL mode Full (strict).** · Verified on this zone on 2026-10-27: the ACME path reaches the origin while `/` gets a 301. · Rejected: a Cloudflare Origin CA certificate (extra token scope, manual renewal).
- **Gzipped user-data with files embedded as YAML block scalars.** · Base64-in-YAML was 18.8 KB, over EC2's 16 KB limit; gzip gives 6 KB. · Rejected: base64 embedding.
- **`secrets.env` is parsed, not `source`d.** · An unquoted `&` in `MONGODB_URI` makes bash drop the variable and zsh fail. · Rejected: plain `source`.
- **`cpu_credits = unlimited` on both instances.** · No throttling for the API or short standby bursts; surplus costs $0.04 per vCPU-hour only if CPU stays above baseline. · Rejected: standard credits.
- **Docker networks drawn from `10.201.0.0/16`.** · Docker's default pools include `172.31.0.0/16`, the default VPC CIDR, which would swallow traffic to the standby. · Rejected: default pools.
- **Dockerfiles: pnpm installed with npm, filtered install, topological build, `pnpm deploy --prod`, non-root, busybox `HEALTHCHECK`; `ARG NODE_IMAGE` for a glibc fallback.** · Corepack is gone from Node 25+; onnxruntime ships glibc binaries. · Rejected: copying the whole workspace `node_modules` (about 3x larger).
- **Compose healthchecks run `node -e "fetch(...)"`.** · Images need no curl. · Rejected: adding curl.
- **Cloudflare Pages deploy should use a narrow "Pages: Edit" token (`CLOUDFLARE_PAGES_DEPLOY_TOKEN`), not the broad account token.** · Least privilege in CI. · Rejected: the account-wide token in GitHub secrets.

## Testing

- **Quality gates per phase: `pnpm lint && pnpm typecheck && pnpm test` green; nothing is claimed that was not run.** · Honest status. · Rejected: marking phases done on file presence.
- **Coverage gate in `packages/shared`: lines, functions, statements at least 90, branches at least 80 (measured 99.7% lines).** · The scoring core is what the viva examines. · Rejected: a repo-wide threshold that would fail on files outside an agent's ownership.
- **ESLint 10 flat config with type-aware rules; Prettier is a separate `format:check`.** · Catches floating promises and unsafe `any` without a repo-wide format gate. · Rejected: syntax-only lint; `prettier --check` inside lint.
- **TypeScript 6.0.3, not 7.** · typescript-eslint and tsup do not support the native TS 7 port yet. · Rejected: TS 7 with non-type-aware lint.
- **gitleaks in the pre-commit hook (local binary, then Docker, then warn) and in CI.** · The npm package named `gitleaks` is unrelated third-party code. · Rejected: `npx gitleaks`.
- **Playwright E2E (Chromium, WebKit, iPhone viewport) with axe on every route, Lighthouse CI budgets, autocannon load test, `scripts/security-check.sh`.** · Functional, accessibility, performance and security coverage in one matrix. · Rejected: unit tests only.

---

# Appendix: detailed engineering log

The per-phase entries below are the original, longer-form decisions with the numbers behind
them. They are kept verbatim.

## Phase 1: monorepo and tooling

- **pnpm 12.8.1 (the installed version), pinned in `packageManager`, settings in `pnpm-workspace.yaml`.** pnpm 12 blocks dependency build scripts by default, so `allowBuilds` whitelists esbuild, msgpackr-extract and unrs-resolver. Rejected: a pinned older pnpm (it would diverge from the local toolchain).
- **Turborepo 2 `tasks` (the v2 name for the "pipeline"); `lint`, `typecheck`, `test` and `dev` depend on `^build`.** Consumers resolve `@kestrel/shared` types from `dist`, so it must be built first. Rejected: TS project references (extra config for the same result).
- **TypeScript 6.0.3, not 7.0.x (npm latest).** typescript-eslint 8.72 declares `typescript <6.1.0`, and tsup's dts build uses the TS JS API, which the native TS 7 port does not provide yet. Rejected: TS 7 with a non-type-aware lint.
- **ESLint 10 (flat config) instead of the brief's "ESLint 9".** 10.x is the latest stable, all plugins used declare `^10` support, and v10 resolves the nearest `eslint.config.js` per file, which makes per-workspace configs and root lint-staged work without flags. Rejected: ESLint 9.39 (needs `unstable_config_lookup_from_file`).
- **Type-aware lint (`recommendedTypeChecked` + `projectService`), `import-x/order`, react-hooks and react-refresh.** This catches floating promises and unsafe `any`. Rejected: syntax-only rules (they miss promise bugs in api/worker).
- **`react-refresh/only-export-components` is off for `**/components/ui/**`.** Vendored shadcn primitives export `*Variants` and hooks by design. Rejected: hand-editing every shadcn file after each `shadcn add`.
- **Prettier is not part of `pnpm lint`; `pnpm format:check` is separate, and lint-staged formats staged files.** Several agents write docs concurrently, and a repo-wide format gate would fail on files outside an agent's ownership. Rejected: `prettier --check .` inside lint.
- **Mongoose 9.11 (latest stable) instead of BRIEF/SPEC "Mongoose 8".** The task asked for latest stable, and 9 runs on Node ≥ 20.19 with the same promise API. Rejected: pinning 8.x.
- **Vite 8, React 19.3, Tailwind 4.3 (`@tailwindcss/vite`), Vitest 5, zod 4.6, Express 5.3, BullMQ 6.5 with ioredis 6.** All were the latest stable on 2026-10-27 (`npm view`).
- **Shared package scope stays `@kestrel/*` after the product was renamed to Beacon.** Per the BRIEF addendum, the orchestrator sweeps scopes in one pass; user-facing strings already say Beacon.
- **Vite resolves `@kestrel/shared` through a `source` export condition (TS sources); Node, tsc and Vitest use `dist`.** The single-file tsup bundle cannot be tree-shaken. With it the placeholder page was 127 kB gz; per-module resolution brings it to 78 kB gz, which is mostly react-dom. Rejected: `bundle: false` tsup output (Node ESM would need extension rewriting).
- **gitleaks pre-commit order: local binary (installed, v8.30.1, `gitleaks git --pre-commit --staged`), then the official Docker image, then warn without failing.** The npm package called `gitleaks` is an unrelated third-party package, so the suggested `npx -y gitleaks` would run untrusted code. Rejected: npx.
- **Dev Redis uses `maxmemory-policy noeviction`.** BullMQ needs it, because LRU eviction can drop job and lock keys. INFRA.md applies the same rule in prod. Rejected: SPEC's `allkeys-lru`.
- **Dockerfiles: `npm i -g pnpm@12.8.1`, then a filtered install, a topological build and `pnpm deploy --prod`. The runtime copies only `package.json`, `node_modules` and `dist`, runs as user `node`, and has a busybox-`wget` `HEALTHCHECK`.** Corepack is gone from Node ≥ 25, and pnpm 12 ships native binaries (including linux-arm64-musl). pnpm 12's deploy injects workspace deps without `injectWorkspacePackages`. Rejected: copying the whole workspace `node_modules` (about 3× larger).
- **The worker image adds `gcompat libstdc++` on Alpine, and both images take `ARG NODE_IMAGE`.** onnxruntime-node (used by transformers.js) ships glibc binaries. If embeddings fail on musl, build with `NODE_IMAGE=node:22-bookworm-slim`. Rejected: switching the default off Alpine, because the brief asks for `node:22-alpine`.
- **apps/web `.env.example` uses `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_VAPID_PUBLIC_KEY` and `VITE_SENTRY_DSN`.** Vite only exposes `VITE_*` variables to the browser. They map to BRIEF's `API_URL`, `GOOGLE_CLIENT_ID`, `VAPID_PUBLIC_KEY` and `SENTRY_DSN` at build time.
- **api placeholder exposes `GET /v1/meta` (opportunity types from shared).** It proves the shared package resolves inside the pruned Docker image. Rejected: an api that does not import shared until Phase 3.

## Phase 2: `packages/shared`

- **Isomorphic shared package: sha256 via `@noble/hashes`, not `node:crypto`.** `contentHash` runs in the browser too, for example for optimistic UI.
- **Dates: date-fns 4 + date-fns-tz 3.** These were the brief's first choice; zone maths uses `fromZonedTime` / `toZonedTime` and is host-TZ independent. Rejected: luxon (a second date library in shared).
- **Listing schema = the SPEC §9 shape exactly, plus three defaulted extensions: `deadlineKind` (rolling vs unknown when `deadlineAt` is null), `archived` (cleanup queue and the vector filter) and `roleFamily` (computed at ingest).** These are needed downstream, and SPEC-shaped objects still parse.
- **`ghostRisk.reasons` are `{ code, message, points }` objects, not strings.** The UI shows each reason and the points are auditable. Rejected: bare strings.
- **Patch DTOs (`*PatchSchema`) are separate schemas with no defaults.** zod 4 applies inner defaults inside `.partial()`, so a PATCH would silently reset omitted fields. Nested defaulted objects use `.prefault({})` so their inner defaults apply.
- **Default stipend weight = 0.** SPEC §4's formula has no stipend term and must be reproduced exactly. The slider can raise it, and stipend facts ("above your floor", "below your floor") are still explained at weight 0.
- **Skills term = weighted Jaccard. Required skills weigh 2, nice-to-have 1, and profile-only skills weigh 0.5 when they share a category with the listing's skills; unrelated-category profile skills are ignored.** Plain Jaccard penalises broad profiles (30 skills against 5 required gives about 0.3 even with full coverage). Rejected: pure Jaccard, and coverage-only scoring, which is not Jaccard.
- **No semantic similarity supplied → its weight is redistributed proportionally over the other terms (`semanticAvailable: false`).** Rejected: treating it as 0, which would cap every score at 60.
- **Order of operations: `rawScore − ghostPenalty`, then the minimum of the caps, then clamp 0..100 and round.** A cap is the final ceiling and is always reported in `caps[]` with a reason.
- **Deadline passed → cap 20 (plus freshness 0), not a silent drop.** This follows the SPEC rule "never silently"; the feed can still hide expired listings with `includeExpired=false`.
- **Eligibility: grad year, citizenship and min experience are hard fails (cap 35). Degree mismatch is a soft fail (0.25). Unknown profile data scores 0.5 with a "complete your profile" gap; no checks at all scores 1.** The brief lists those three as hard fails; degree wording is too fuzzy to cap on.
- **Location matrix (component values):** remote listing 1 (0.6 for on-site-preferring users). For hybrid and on-site, the work-mode factor (prefer_remote 0.5–0.6, hybrid 0.8–1, onsite 0.9–1, any 1) is multiplied by a place factor (city match 1, same country or no preference 0.7, elsewhere 0.2, or 0.6 when open to relocate). Remote-only vs hybrid scores 0.3. Remote-only vs on-site scores 0 and is capped at 50, unless the student is open to relocation (then 0.4 × place). A country-level preference such as "India" matches any city in it.
- **Role alignment:** exact family 1, related family 0.6, same group 0.3, otherwise 0. It is neutral (0.5) when the student has no preference or the title is unclassifiable (hackathons, scholarships).
- **Freshness:** linear decay over 30 days since `postedAt` (falls back to `firstSeenAt`), then +0.25 when the deadline is within 7 days, clamped to 1. No dates scores 0.5.
- **Stipend:** compares the best case (`stipendMax`, else `stipendMin`) converted to monthly against the floor, using a static approximate FX table (`APPROX_FX_PER_USD`), not a live rate. Below the floor scores 0; at or above scores 0.7 + 0.3 × min(1, ratio − 1). The floor does not apply to hackathon prizes or scholarship awards. One-off totals are "not comparable" (0.7). Rejected: a live FX API (network calls inside a pure function).
- **Ghost risk points:** age > 45 d +25, > 90 d +10, re-posted ≥ 3× +25, apply link 404/410 +35, redirect to the careers home page +30, apply link 5xx or network error +10, boilerplate text ("always accepting", "talent community") +20, > 5 identical open roles +15, not seen in source for 14 d +15; capped at 100. Penalty = score / 5. "Not seen recently" is an addition for the "stale" half of SPEC G.
- **Dedup:** union-find over equal `canonicalKey` **or** equal `normaliseUrl(applyUrl)` (transitive). The richest record is kept (`listingRichness`, ties go to the first seen), `seenCount` is summed and first/last seen are widened.
- **`canonicalKey` = `normaliseCompany | normaliseTitle | primary location`, where the primary location is the canonical city, else `remote`, else the country code.** City aliases (Bangalore = Bengaluru) and legal suffixes (Pvt Ltd, Inc, Technologies) collapse, but geography does not ("Google India" ≠ "Google"), to avoid false merges.
- **`normaliseUrl` upgrades http → https (except localhost) and strips `utm_*`, click ids, `ref`/`source`/`src`, Greenhouse/Lever source params and session ids; it keeps path case.** This is for dedup across boards. Rejected: lowercasing paths (they are case-sensitive on many ATSs).
- **`inferRemote` precedence:** a negation ("no remote", "on-site only") → onsite; "remote/hybrid" given as alternatives → remote; hybrid → hybrid; any remote cue (including "online" and "virtual" for hackathons) → remote; on-site cue → onsite. A bare city becomes onsite in `normaliseLocation`.
- **Deadline parser:** IST is the default zone and "IST" always means India. Date-only input means 23:59:59.999 local. Missing year: a month before the current month means next year, otherwise this year, so "Oct 20" read on Oct 27 is a past deadline. "next Friday" is the first Friday strictly after today. An explicit date beats "rolling".
- **Skill taxonomy: 781 skills in 24 categories, with case-sensitive aliases for ambiguous words (Go, React, Express, Spring, Excel, Swift, Rust, C, R…) and context guards (no match for "go to", "C-suite", "R&D", "excel at").** Matching uses two precompiled longest-first alternation regexes; a 20k-character text takes well under 150 ms. "CV" and "TF" are deliberately not aliases.
- **Role taxonomy: 76 families in 7 groups; `classifyRole` picks the highest-weight matching pattern (title-specific 8–10, keyword 5–7, generic 1–4).** Related families are symmetric.
- **Fixtures use fictional organisations and people only.** They feed the public landing-page demo, and fake postings attributed to real companies could mislead visitors.
- **Coverage gate in `packages/shared/vitest.config.ts`: lines, functions and statements ≥ 90, branches ≥ 80.** Barrels and fixtures are excluded from the measurement.

## Phase 4: worker (`apps/worker`)

- **Matches are written only for listings the user can see, using the API's visibility rule (own personal sources + subscriptions, else every community source; a listing is visible when any of its `sourceIds` is).** The API's warm feed lists every match doc without re-checking sources, so a global top-K would ignore pack and source choices. A full recompute also deletes the user's other matches. Rejected: global vector top-K.
- **Stage 1 = vector top 200 over visible listings + top 40 per opportunity type + every saved or tracked listing.** A narrow profile still gets hackathons and scholarships in the feed's type filters. Rejected: a single top-200, which can contain only one type.
- **Incremental matching writes a match only when the listing clears the user's stage-1 floor (the K-th similarity at the last recompute), already had one, or fires an instant rule.** The feed stays consistent with a full recompute and `matches` stays bounded on M0. Rejected: a match for every new listing × every user.
- **`matches` stores every `FitResult` field at the top level and `profileHash` = the profile's API `profileHash`; the worker's own profile + weights hash is a separate `matchHash`.** This follows API.md §12 and lines up with the `explanations` cache. Rejected: a nested `fit` object (the earlier worker draft).
- **Ingest matches existing docs by `(source, externalId)` before `canonicalKey`/apply URL, and a known Workday posting re-listed without its detail is only marked seen (`partial`).** Workday list items have no description and only "N Locations", so the key drifted and good data was overwritten. Rejected: re-fetching every detail on every run.
- **`applyCheck {status: ok|dead|redirect_home|error, httpStatus, finalUrl, checkedAt}`, with 401/403/429/5xx/network as `error`.** This is the API contract. A bot wall means "could not verify", not "dead".
- **Server-side LLM extraction is charged to the personal source's owner (`llm:calls:<userId>:<day>`, same cap and key as the API); an owner with AI off gets rules only; community listings use `llm:calls:server:<day>` (cap 1000).** It honours the per-user cap rule and the AI-off choice, and protects the shared Meta quota. Rejected: unmetered extraction.
- **Kept AI SDK `generateObject` (deprecated in AI SDK 7) and switched the SDK warning log off.** The spec names it, it still works, and it is the only API with `repairText` (needed for fenced JSON from the reasoning model). The provider sends `response_format: json_object` and zod validates. Rejected: `generateText` + `Output.object` (no repair hook).
- **Worker image defaults to `node:22-bookworm-slim`.** `onnxruntime-node` fails on Alpine even with gcompat (`__sprintf_chk: symbol not found`, verified in the built image), so local embeddings cannot run there. The API image stays Alpine. Rejected: Alpine + `EMBEDDING_PROVIDER=openai` (it would make a paid key mandatory).
- **Docker `HEALTHCHECK` uses `node -e fetch(...)`.** INFRA's contract is that images need only `node`; Debian slim has no wget.
- **Ingest global concurrency 3 is enforced queue-wide (`Queue.setGlobalConcurrency`), not only per worker process.** It still holds if a second worker replica is started.
- **Index creation tolerates "same name, different options" conflicts (logged, nothing dropped).** The API declares indexes on the same collections, and a stale index must not stop the worker from booting. Rejected: `syncIndexes()`, which would drop the API's indexes.
- **`FIRECRAWL_DAILY_CREDIT_CAP` default 500, the same as the API's credit meter (prod sets 150 in `secrets.env`).** The two sides must agree on the cap shown in the UI.
- **Optional `QUEUE_PREFIX`.** It isolates the smoke run (and any staging) on a shared Redis. The default `bull` is what the API uses.
- **The real-Redis integration test serves upstream APIs from a local HTTP server (publicapi sources with a `feedUrl`) instead of nock.** nock's undici interception threw an uncaught TLS socket error after the flow test. Rejected: keeping nock for the BullMQ tests.
- **Deadline reminders also cover saved (untracked) listings.** USERFLOW §3.3 says "saved and tracked items". A tracked listing is reminded once, through its tracker item.

## Phase 3: API (`apps/api`)

- **Resume OCR runs inside the API, inline in the upload request (tesseract.js 7 + the vendored `@tesseract.js-data/eng` LSTM model; image-only PDFs rendered with unpdf's pdf.js + `@napi-rs/canvas`, ≤ 4 pages at 150 dpi).** The student is waiting on the onboarding screen for the parsed draft, so an async OCR job would need polling for a ~1 s task. Budget: OCR 60 s, the whole upload ≈ 85 s (LLM enrichment gets only the remainder). Rejected: a worker queue (extra round trips and UI states), `pdf-to-img` (a second pdf.js copy next to unpdf's), the system `tesseract` binary (apt packages, larger image).
- **One tesseract worker per API process, created on first use, jobs serialised, terminated after 5 idle minutes or on a timeout.** Measured in the arm64 image: 92 MiB idle → 282 MiB with the worker resident, inside the 512 MiB container limit; idle termination gives the memory back. Rejected: a worker pool (memory on the 2 GB box), keeping the worker forever.
- **OCR thresholds: a PDF text layer under 200 characters triggers OCR; 422 `RESUME_NO_TEXT` only when the better of text layer and OCR is under 100; DOCX keeps the 200 rule (no OCR).** Owner requirement; the longer text wins so a thin text layer never beats a good scan. Images above 40 MP are refused before decoding (decompression bombs) and anything over 4000 px is scaled down.
- **The API image moves to `node:22-bookworm-slim` (like the worker), with a node-fetch HEALTHCHECK.** `@napi-rs/canvas` ships glibc prebuilts (no apt packages) and Debian slim has no `wget`. The arm64 image is about 143 MB. Rejected: staying on Alpine (musl prebuilts exist, but one libc for both images is simpler to reason about).
- **Onboarding save-and-resume lives on the user document (`onboardingStep` widened to a slug, `onboardingAnswers`, `onboardingUpdatedAt`), exposed at `PATCH /v1/profile/onboarding` and `POST /v1/profile/onboarding/complete`, both answering `MeResponse`.** The answers are the flow's UI state, not profile data, and `/v1/me` already decides routing. Answers merge key by key (`$set`/`$unset` per key, `null` deletes), ≤ 100 keys and 32 KB. Once completed the step stays `done`. Rejected: storing answers in `profiles` (the worker hashes profile fields), an enum of new step ids (the web owns the sequence), whole-object replacement (two tabs would lose answers).
- **Feed `sort=fit` sorts and applies the keyset cursor on `matches` before the `$lookup` into `listings`, with a new `{userId, score:-1, listingId:-1}` index.** The join then runs only until `limit + 1` rows pass the listing filters instead of over every match of the user (qa → api #6). `deadline`/`posted` sorts still join first (their keys live on the listing); `total` stays cached for 60 s.
- **LLM calls accept an overall deadline: each attempt gets `min(LLM_TIMEOUT_MS, time left)` and no attempt starts with under 2 s left.** Keeps the resume upload inside its budget after OCR. Rejected: a fixed shorter timeout for every caller.
- **Description links keep `rel="noopener noreferrer nofollow" target="_blank"`.** The sanitize-html allowlist dropped the attributes its own transform added; `rel` and `target` are now allowed and the transform overwrites any value the source sent.
- **Coverage floor back to 85 % lines (SPEC §8); every documented operation has an API test (contract suite 70/70).**

### Visual system v3 (2026-10-27, design lead on Fable)

- **Light is the default theme; dark is a full theme** — owner pivot ("minimalist, good light, professional"); `appearance.theme` defaults to `light`, `system` only when chosen. Alternative rejected: OS-following default (surprised the owner on a dark laptop).
- **Muted role palette used as tints** (cobalt/indigo/violet/teal/orange/pink/lime/amber, each base + 10% tint + AA text) with a fixed opportunity-type → colour map and tracker-stage colours — owner: "full palette, not one hue", then "not too bold". Rejected: saturated fills (too loud) and single-accent (owner: too plain).
- **Radar default view = card grid** (`RadarGrid`, 1/2/3 columns, ≤ 5 elements + one state slot per card); list/timeline/board stay behind the view switch. Rejected: list-first (owner: "too basic").
- **Elevation system e1/e2/e3 + glass chrome + barely-there canvas washes** instead of flat hairline panels; shadows soft and short, neutral.
- **Geist for all app display type**; Instrument Serif reserved for marketing and onboarding prompts (`font-serif`).
- **Boot skeleton in index.html** so no route renders blank while the mock worker / lazy route / data load (QA found 17/18 blank captures).
- **`/me` page + 4 mobile tabs** (Radar · Deadlines · Tracker · Me); Alerts/Sources/Notifications/Profile/Settings/Admin/tour live under Me on phones.

## Public API hostname (2026-10-27 release)

Use `api-beacon.spacesdrive.cc`. The legacy nested API hostname is two levels below
`spacesdrive.cc`; the zone's free Universal SSL certificate does not cover it, and its public
TLS handshake fails. A first-level hostname uses the existing certificate without adding a
paid service. Caddy, GitHub health checks, frontend API configuration, CSP and operational
documentation use the new hostname. The existing DNS record is left intact for reference.

## Immutable GitHub OIDC subjects (2026-10-27 release)

The GitHub repository uses an immutable subject containing owner and repository IDs. The old
AWS trust policy accepted name-only subjects, so the deploy job could build images but could
not assume its AWS role. Trust now matches the exact prefix returned by GitHub's repository
OIDC settings plus `:ref:refs/heads/main`; the audience remains `sts.amazonaws.com`.
Terraform records the prefix through `github_oidc_subject_prefix`, populated from the private
configuration's `GITHUB_OIDC_SUBJECT_PREFIX` by `scripts/infra-tfvars.sh`.
See [GitHub's immutable subject reference](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).
