# Contributing to Beacon

## Prerequisites

- Node 22 or newer (`.nvmrc` pins 22)
- pnpm 12 (pinned in `packageManager`)
- Docker (Redis for local development; the production images)
- A MongoDB Atlas cluster, or local MongoDB through the `local-mongo` compose profile
- Optional: a Google OAuth client for real sign-in; the web app also runs against a mocked API

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local     # fill values; never commit them
docker compose -f docker-compose.dev.yml up -d redis
pnpm dev                                          # web :5173, api :4000, worker :4001
```

To run the web app without a backend: `VITE_MOCK_API=1 pnpm --filter @beacon/web dev`.

Secrets live only in git-ignored files (`secrets.env`, `.env`). `.env.example` files list names
only. gitleaks runs in the pre-commit hook and in CI.

## Branches and commits

- Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
- Use Conventional Commits: `type(scope): summary`, imperative, lower case, no trailing period.
  Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`. Scopes follow
  the workspace: `web`, `api`, `worker`, `shared`, `ui`, `infra`, `seed`.
- Keep commits focused; one logical change each. Pull requests describe what changed, why, and
  how it was verified.

## Quality gates

A change is ready when these pass:

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e                  # when touching the web app or API contracts
pnpm format:check              # formatting (lint-staged formats staged files on commit)
pnpm knip                      # unused exports and dependencies
```

Add or update tests with the change. `packages/shared` enforces coverage thresholds. Do not
disable or skip a test to get a green run. Record any judgement call in `docs/DECISIONS.md`
(decision, why, alternative rejected).

## Add a source fetcher

Fetchers live in `apps/worker/src/fetchers/`.

1. Implement the fetcher in a new file (for example `myats.ts`) following the interface in
   `types.ts`: fetch with conditional headers where the endpoint allows, and return raw postings.
2. Map each posting to the listing shape using the shared normalisers (`normaliseUrl`,
   `normaliseLocation`, `parseStipend`, deadline parser, `classifyRole`); do not re-implement them.
3. Register it in `build.ts` and teach `detect.ts` the URL pattern for the new kind.
4. Add the kind to the source kind enum in `packages/shared` and the web kind icon and badge.
5. Add tests with recorded fixtures (see `ats.test.ts`, `feeds.test.ts`); sample real responses
   can go in `seed/samples/`.
6. If seeded, add the source to `seed/source-packs.json` and verify the endpoint live first.

## Add a screen

1. Create `apps/web/src/features/<name>/` with `components/`, `lib/` for pure logic (unit-tested)
   and the route entry; register the route lazily so it is code-split.
2. Fetch through a typed hook in `apps/web/src/api/` using TanStack Query; types come from
   `@beacon/shared`. Provide skeleton, empty-with-next-action and error-with-retry states.
3. Use tokens and primitives from `packages/ui`; follow `docs/DESIGN.md` and the motion rules in
   `docs/MOTION.md` (150 to 250 ms, honour `prefers-reduced-motion`).
4. Make it keyboard reachable, add a command to the palette where relevant, and add stable
   `data-testid` values listed in `docs/TESTIDS.md`.
5. Add a Playwright spec and an axe check. Keep every capability reachable; use progressive
   disclosure rather than removing options.

## Where docs live

| Document | Contents |
| --- | --- |
| `README.md` | Overview, local run, quality gates |
| `docs/BRIEF.md`, `docs/SPEC.md` | Decisions that override the spec; product spec |
| `docs/ARCHITECTURE.md` | Topology, data flow, queues, collections, vector index |
| `docs/API.md`, `docs/SHARED-API.md` | HTTP contract; shared library API |
| `docs/DESIGN.md`, `docs/MOTION.md`, `docs/USERFLOW.md`, `docs/TESTIDS.md` | Design system, motion, flows, test ids |
| `docs/INFRA.md`, `docs/RUNBOOK.md` | Infrastructure and day-2 operations |
| `docs/DECISIONS.md` | Every judgement call |
| `docs/PROGRESS.md` | Phase checklist and per-area logs |
| `docs/HANDOVER.md`, `docs/DEMO.md` | Handover and the viva demo script |
