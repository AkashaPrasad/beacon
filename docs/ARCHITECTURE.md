# Beacon architecture

How the pieces fit: deployment topology, monorepo packages, the ingest → score → alert data
flow, the BullMQ queues, MongoDB collections and indexes (including the Atlas Vector Search
index), and the cost controls. Companion documents:

| Topic                                             | Document                                               |
| ------------------------------------------------- | ------------------------------------------------------ |
| Product spec / overrides                          | `docs/SPEC.md`, `docs/BRIEF.md`                        |
| Shared domain library (schemas, scoring, parsers) | `docs/SHARED-API.md`                                   |
| HTTP API, full data contract, Redis keys          | `docs/API.md` (§12 collections, §13 queues, §14 Redis) |
| Infrastructure, compose, Caddy, deploy            | `docs/INFRA.md`, `docs/RUNBOOK.md`                     |
| Design system / user flows                        | `docs/DESIGN.md`, `docs/USERFLOW.md`                   |
| Judgement calls                                   | `docs/DECISIONS.md`                                    |

`docs/API.md` §12 is the authoritative per-field data contract; this document gives the shape of
the system and the index definitions.

---

## 1. Topology

```
Browser (React SPA, PWA + service worker for web push)
   │  https://beacon.spacesdrive.cc            Cloudflare Pages (static, global CDN)
   │
   └─► https://api.beacon.spacesdrive.cc       Cloudflare proxy → Elastic IP
             │
   ┌─────────▼──────────── AWS EC2 t4g.small (arm64, 2 GB) · ap-south-1 · docker compose ──┐
   │ caddy :80/:443 ─► api :4000 (Express 5, NODE_OPTIONS=--max-old-space-size=384)         │
   │                   worker :4001 (BullMQ consumers + local embeddings, 640 MB heap)       │
   │                   redis :6379 (queues, rate limits, credit meters; noeviction)          │
   └─────────┬──────────────────────────────┬────────────────────────────────────────────────┘
             │                              │ outbound only
   MongoDB Atlas M0 (Mumbai)        Firecrawl cloud → self-hosted standby EC2 (normally stopped)
   + Atlas Vector Search            Meta Model API / BYOK OpenAI-compatible LLM
                                    Web Push services (VAPID)
```

- The api never loads the embedding model or crawls; it validates, reads Mongo, enqueues jobs.
- The worker owns all I/O-heavy and CPU-heavy work: fetchers, Firecrawl, LLM extraction, the
  `Xenova/bge-small-en-v1.5` embedding model (384-d), scoring, notifications.
- Health: api `GET /healthz` (liveness) and `/readyz` (Mongo connected); worker `GET /healthz`
  (liveness, always 200 while the process runs) and `/readyz` (Redis ready). Both images have a
  Docker `HEALTHCHECK` on `/healthz`.

## 2. Monorepo

```
apps/web        Vite 8 + React 19 + Tailwind v4 (tokens from @kestrel/ui)  → Cloudflare Pages
apps/api        Express 5 + Mongoose 9 + pino                               → Docker (apps/api/Dockerfile)
apps/worker     BullMQ 6 + ioredis + transformers.js                        → Docker (apps/worker/Dockerfile)
packages/shared zod schemas, constants, taxonomies, normalisers, deadline parser, scoring
packages/ui     design tokens (tokens.css) + UI primitives (cn)
packages/config tsconfig bases, ESLint flat-config factories, Prettier config
```

Dependency graph: `web → shared, ui`; `api → shared`; `worker → shared`; everyone → `config`
(dev). `@kestrel/shared` is built by tsup to ESM + CJS + `.d.ts`; Turborepo runs `^build` before
every `dev`, `lint`, `typecheck`, `test` and `build` so consumers always see fresh types. Vite
resolves the `source` export condition to shared's TypeScript, so the browser bundle is
tree-shaken per module (the single-file dist would pull every taxonomy into the page).

The npm scope is still `@kestrel/*` (pre-rename); the orchestrator sweeps it to `@beacon/*` in
one pass.

## 3. Data flow

### 3.1 Sources → listings (worker)

```
POST /v1/sources/detect ──► detect kind (ATS URL patterns → HTML sniff → RSS/sitemap → firecrawl)
POST /v1/sources        ──► sources doc ──► ingest job (dedup id ingest:<sourceId>)
repeatable ingest (per refreshInterval, jittered) ────────┘
        │
        ▼ fetch (ETag / If-Modified-Since for ATS + feeds; Firecrawl only as fallback, credit-capped)
  raw postings
        │  shared normalisers, per posting:
        │    normaliseUrl(applyUrl)          tracking params, www, trailing slash, fragment
        │    normaliseLocation / inferRemote city, region, country, remote|hybrid|onsite
        │    parseStipend                    min/max/currency/period ("₹25k/month", "12 LPA")
        │    parseDeadline (IST default)     date | rolling | unknown
        │    classifyRole(title)             roleFamily
        │    canonicalKey + contentHash      dedup identity + "did the text change?"
        ▼
  dedupeListings (in-batch) + upsert on canonicalKey (cross-batch; seenCount += 1, lastSeenAt = now)
        │  contentHash unchanged → stop here (zero LLM / embedding cost)
        ▼
  extract job   LLM structured output (zod-validated) when AI is on and the ATS gave no structure;
                otherwise taxonomy fallback: extractSkills(description) → skillsRequired/skillsNice,
                eligibility regexes (grad years, degrees, citizenship, min experience)
        ▼
  embed job     bge-small 384-d, L2-normalised → listings.embedding
        ▼
  match job     incremental: score the new listing for users whose stage-1 retrieval includes it
        ▼
  notify job    evaluate alert rules (instant) / queue digests; web push + in-app notification
```

### 3.2 Feed (api)

1. **Stage 1, retrieval.** `$vectorSearch` on `listings.embedding` with the user's profile
   embedding (`VECTOR_SEARCH=atlas`), top 200, pre-filtered by `archived: false` and the
   requested `type`s. Fallback (`VECTOR_SEARCH=memory`, tests, or the index is missing): the
   worker-side cosine scan over a cached `Float32Array` matrix produces the same candidates.
2. **Stage 2, deterministic scoring.** `computeFit({ profile, listing, weights, now, semantic })`
   from `@kestrel/shared` (SPEC §4): `100 · Σ wᵢ·componentᵢ − ghostPenalty`, then caps
   (eligibility hard-fail 35, remote-only vs on-site 50, deadline passed 20). Results are stored
   in `matches` so the feed is a sorted index scan with cursor pagination.
3. **Stage 3, optional LLM re-rank** of the top 30 with `{why_fit, gaps, tailoring_tips}`,
   cached in `explanations` per `(userId, listingId, profileHash)`. AI-off mode skips it; the
   deterministic `explain` from stage 2 is always available.

### 3.3 Tracker, ghost checks, cleanup

- **ghostcheck** (daily per listing): HEAD/GET the apply URL (404/410, redirect-to-home, 5xx),
  count reposts and identical open roles, then `ghostRisk(listing, context)` writes
  `listings.ghostRisk = { score, reasons[] }`. The fit score subtracts `score / 5` (0–20).
- **notify** also runs tracker nudges: 10 days without activity → follow-up nudge, 30 days →
  suggest "ghosted" (`NUDGE_FOLLOW_UP_DAYS`, `NUDGE_GHOSTED_DAYS`), and deadline reminders at 7, 3
  and 1 days.
- **cleanup** (nightly): archive listings unseen for 60 days (`archived: true`, excluded from the
  vector filter), trim notifications, expire caches.

## 4. Queues (BullMQ, Redis)

Names live in `apps/worker/src/queues.ts` (`QUEUE_NAMES`). Defaults: 3 attempts, exponential
backoff from 5 s, bounded completed/failed history; exhausted jobs are copied to `dead-letter`.
Jobs are idempotent: a deterministic `jobId` / deduplication id per entity, and every write is an
upsert keyed by a natural key.

| Queue        | Payload (summary)                                                | Producer                                          | Concurrency                  | Schedule / dedup                                                             |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `ingest`     | `{ sourceId, reason }`                                           | api (source create/enable), repeatable per source | 3 global, 1 per domain       | repeat = `refreshInterval` + jitter; dedup `ingest:<sourceId>`               |
| `extract`    | `{ listingId }`                                                  | ingest (new or changed `contentHash`)             | 2                            | jobId `extract:<listingId>:<contentHash>`                                    |
| `embed`      | `{ kind: 'listing', listingId }` / `{ kind: 'profile', userId }` | extract, api (profile hash changed)               | 1 (model is single-threaded) | dedup `embed:<kind>:<id>`                                                    |
| `match`      | `{ userId, reason }` / `{ listingId }`                           | api (profile/weights/sources), embed              | 2                            | dedup `match:<userId>`                                                       |
| `ghostcheck` | `{ listingId }`                                                  | repeatable sweep                                  | 4                            | daily                                                                        |
| `notify`     | `{ userId, alertRuleId?, kind }`                                 | match, schedulers, api (test)                     | 4                            | digests at the user's `digestTime` in their time zone; quiet hours respected |
| `cleanup`    | `{}`                                                             | repeatable                                        | 1                            | nightly                                                                      |

## 5. MongoDB collections and indexes

Database `MONGODB_DB` on Atlas M0. Shapes are the shared zod schemas plus storage-only fields;
see `docs/API.md` §12 for every field and writer.

| Collection           | Shared schema                                  | Key indexes                                                                                                            |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `users`              | `userSchema`                                   | `googleSub` unique, `email`                                                                                            |
| `profiles`           | `profileSchema` (+ `embedding`, `resumeText`)  | `userId` unique                                                                                                        |
| `settings`           | `settingsSchema` (+ `ai.keyCiphertext`)        | `userId` unique                                                                                                        |
| `sources`            | `sourceSchema`                                 | `ownerId`; `{scope, packId}`; `{ownerId, url}` unique (partial: personal); `seedKey` unique sparse                     |
| `subscriptions`      | (user ↔ community source)                      | `{userId, sourceId}` unique; `sourceId`                                                                                |
| `listings`           | `listingSchema` (+ `applyCheck`)               | `canonicalKey` unique; `sourceId`; `{archived, type, deadlineAt}`; `{postedAt: -1}`; `company`; **vector index below** |
| `matches`            | `fitResultSchema` fields + `userId, listingId` | `{userId, score: -1}`; `{userId, listingId}` unique                                                                    |
| `interactions`       | saved / hidden flags                           | `{userId, listingId}` unique; `{userId, saved}`                                                                        |
| `explanations`       | LLM re-rank cache                              | `{userId, listingId, profileHash}` unique                                                                              |
| `tracker_items`      | `trackerItemSchema`                            | `{userId, stage, position}`; `{userId, listingId}`                                                                     |
| `alert_rules`        | `alertRuleSchema`                              | `userId`                                                                                                               |
| `notifications`      | `notificationSchema`                           | `{userId, createdAt: -1}`; `{userId, readAt}`                                                                          |
| `push_subscriptions` | web push endpoints                             | `endpoint` unique; `userId`                                                                                            |

### 5.1 Atlas Vector Search index on `listings.embedding`

M0 clusters support Atlas Vector Search (up to 3 search indexes per M0 cluster). Embeddings are
384-dimensional and L2-normalised, so cosine similarity is the right metric. `type`,
`deadlineAt` and `archived` are indexed as **filter** fields so stage 1 pre-filters instead of
post-filtering 200 candidates.

Index name: **`listings_embedding`** (collection `listings`, type `vectorSearch`):

```json
{
  "name": "listings_embedding",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 384, "similarity": "cosine" },
      { "type": "filter", "path": "type" },
      { "type": "filter", "path": "deadlineAt" },
      { "type": "filter", "path": "archived" }
    ]
  }
}
```

Create it once (mongosh against the Atlas cluster, or the Atlas UI "JSON editor" with the
`definition` object):

```js
db.listings.createSearchIndex({
  name: 'listings_embedding',
  type: 'vectorSearch',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: 384, similarity: 'cosine' },
      { type: 'filter', path: 'type' },
      { type: 'filter', path: 'deadlineAt' },
      { type: 'filter', path: 'archived' },
    ],
  },
});
db.listings.getSearchIndexes('listings_embedding'); // wait for status: "READY"
```

Stage-1 query:

```js
db.listings.aggregate([
  {
    $vectorSearch: {
      index: 'listings_embedding',
      path: 'embedding',
      queryVector: profileEmbedding, // number[384]
      numCandidates: 1000,
      limit: 200,
      filter: {
        archived: false,
        type: { $in: ['internship', 'hackathon'] },
        // only when the user asks for a deadline window (rolling / no-deadline listings would be excluded):
        // deadlineAt: { $gte: now, $lte: windowEnd },
      },
    },
  },
  { $project: { embedding: 0, score: { $meta: 'vectorSearchScore' } } },
]);
```

Listings without an embedding yet (`embedding: []`) are simply not returned by stage 1; the
memory fallback skips them the same way. Expired listings stay retrievable and are capped at 20
by `computeFit`, so "deadline passed" is visible rather than silently dropped.

## 6. Cost and resource controls

- **Zero-cost first:** ATS JSON endpoints and RSS/sitemaps are polled with
  `ETag` / `If-Modified-Since`; Firecrawl is the last resort.
- **Firecrawl meter:** global daily cap (`FIRECRAWL_DAILY_CREDIT_CAP`) and per-user counters in
  Redis; cloud → self-hosted standby switch-over rules are in `docs/BRIEF.md` and `docs/INFRA.md`.
- **Unchanged text costs nothing:** `contentHash` (sha256 of normalised text) gates `extract`,
  `embed` and `match`.
- **LLM:** only for resume → profile, listing → structured fields, and optional top-30 re-rank;
  zod-validated, 30 s timeout, 2 retries, per-user daily cap, cached by `(listing, profileHash)`.
  AI-off mode uses `extractSkills` + regex eligibility + embeddings + `computeFit`.
- **Memory:** api heap 384 MB in a 512 MB container, worker 640 MB in a 900 MB container; Redis `maxmemory` with `noeviction` (BullMQ
  requirement). The embedding model loads only in the worker.

## 7. Security boundaries

- Secrets come from `secrets.env` (git-ignored) at deploy time; every app ships `.env.example`
  with names only. gitleaks runs in the pre-commit hook and in CI.
- BYOK LLM keys: AES-256-GCM with `ENCRYPTION_KEY`, never logged, never returned (last 4 only).
- Auth: Google ID token → JWT in an httpOnly, Secure, SameSite=Lax cookie; every query is scoped
  by `userId` (ownership checks).
- pino redacts `authorization`, `cookie`, `set-cookie`, `*.apiKey`, `*.token`, `*.password`.
