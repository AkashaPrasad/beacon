# Beacon worker (`apps/worker`)

BullMQ workers for ingest, extract, embed, match, ghostcheck, notify and cleanup. The worker
owns the `listings`, `matches`, `notifications` and `sourceRuns` collections and a few fields on
API-owned documents (§4). It only consumes jobs from the API (docs/API.md §13).

```bash
pnpm --filter @kestrel/worker dev            # tsx watch, reads apps/worker/.env if present
pnpm --filter @kestrel/worker lint | typecheck | test | build
docker build -f apps/worker/Dockerfile -t beacon-worker .   # build context = repo root
node dist/index.js                           # prod entry; health + metrics on :4001
```

Status (2026-10-27): every queue, fetcher and pipeline below is implemented and tested, and the
live smoke in §11 passed against Atlas (`beacon_dev`).

---

## 1. Queues and payloads (the producer contract)

Job name = queue name. Default job options (`DEFAULT_JOB_OPTIONS`): `attempts: 3`, exponential
backoff from 5 s, `removeOnComplete: 1000`, `removeOnFail: {age: 7 d, count: 5000}`. A job that
exhausts its attempts, or fails with `UnrecoverableError`, is copied to the **`dead`** queue as
`{queue, jobId, name, data, reason, attemptsMade, failedAt}`. The BullMQ key prefix defaults to
`bull`. If `QUEUE_PREFIX` is set, the API must use the same prefix.

| Queue | Payload | Producers | Concurrency |
|---|---|---|---|
| `ingest` | `{ sourceId, reason }`. `reason` is `created \| enabled \| pack` (API) or `schedule \| manual \| retry` | API, per-source scheduler | 3 per worker **and** 3 queue-wide (`setGlobalConcurrency`), plus 1 per fetch host (§3) |
| `extract` | `{ listingId }` | ingest flow | 2 |
| `embed` | `{ listingId }` or `{ kind: 'profile', userId }` (`kind` is optional) | ingest flow, API | 1 |
| `match` | `{ userId, reason? }` (full recompute) or `{ listingIds, afterUserId? }` (incremental) | API, embed, ghostcheck, ingest flow | 2 |
| `ghostcheck` | `{ listingId }` | ingest (new listings), weekly re-check | 4, rate-limited to 5/s |
| `notify` | `{ kind: 'instant'\|'digest'\|'deadline'\|'nudge', userId?, ruleId?, listingIds? }`, or a test: `{ userId, alertRuleId, test: true }` (the API shape; `alertRuleId` is an alias of `ruleId`) | match, scheduler, API | 4 |
| `cleanup` | `{}` | scheduler | 1 |
| `maintenance` (internal) | job names `standby-idle`, `sync-schedules`, `crawler-balance`, `ghost-recheck` | scheduler | 1 |

**Ingest flow.** A run that finds new or changed listings adds one BullMQ flow per 100
listings. The parent is `match {listingIds}`; each listing contributes a child `embed` whose own
child is `extract`. Children use `ignoreDependencyOnFailure`, so a failed extract or embed never
blocks matching. The real-Redis test asserts the order: extract finishes before embed starts, and
every embed finishes before match starts.

**Idempotency.** Ingest upserts by `(source, externalId)`, then `canonicalKey`, then normalised
apply URL. Extract is skipped when `extractedHash === contentHash`. Embed is skipped when
`embeddingHash` (model + text) is unchanged. Ghostcheck job ids are `ghost-<listing>-<UTC day>`.
Notifications are unique per `(userId, dedupeKey)`.

## 2. Schedules (registered on boot, `WORKER_SCHEDULER=true`)

| Scheduler | When | What |
|---|---|---|
| `ingest-src-<sourceId>` | every `refreshInterval` (1h / 6h / daily / weekly) of each enabled source, first run offset by a deterministic jitter ≤ min(interval/4, 30 min) | `ingest {sourceId, reason:'schedule'}` |
| `sync-schedules` | every 10 min | adds/removes per-source schedulers after API changes |
| `standby-idle` | every 5 min | stops the Firecrawl standby after `FIRECRAWL_STANDBY_IDLE_MINUTES` (20) without use |
| `crawler-balance` | hourly | `GET /v2/team/credit-usage`; below 20 credits → standby for 6 h |
| `notify-digest` | hourly, minute 0 | rule digests and the settings digest at each user's local time; flushes pushes held by quiet hours |
| `notify-deadline` | 08:00 IST | deadline reminders 7 / 3 / 1 d |
| `notify-nudge` | 10:00 IST | tracker follow-up nudges |
| `ghost-recheck` | Sundays 03:00 IST | re-checks listings not checked for 7 d (≤ 2000) |
| `cleanup-daily` | 03:30 IST | archive / prune (§7) |

SIGTERM/SIGINT drain active jobs (`worker.close()`), close queues, the health server, Mongo
and Redis. A hard exit follows after 25 s.

## 3. Fetchers (`src/fetchers`)

All HTTP goes through `lib/http.ts`: `User-Agent: BeaconBot/1.0 (+https://beacon.spacesdrive.cc/bot; …)`,
a 15 s timeout, a response-size cap, `If-None-Match` / `If-Modified-Since` from the source's
stored `etag` / `lastModified` (a 304 just bumps every live listing), and typed `SourceError`s.
Each raw record goes through `buildListing` and `listingDraftSchema`. One bad posting becomes a
warning on the run and never fails the source.

| Kind / provider | Endpoint | Notes |
|---|---|---|
| greenhouse | `GET boards-api.greenhouse.io/v1/boards/<t>/jobs?content=true` | entity-escaped HTML → Markdown; a 404 means a bad token |
| lever | `GET api(.eu).lever.co/v0/postings/<c>?mode=json` | single-posting "we moved" stub boards → `notfound` |
| ashby | `GET api.ashbyhq.com/posting-api/job-board/<b>?includeCompensation=true` | unlisted jobs skipped; salary components |
| smartrecruiters | list `…/companies/<id>/postings?limit=100&offset=` + detail per posting | detail only for new or changed `releasedDate`; `totalFound=0` → `notfound` |
| workable | `GET www.workable.com/api/accounts/<slug>?details=true` (widget API) | |
| workday | `POST <tenant>.<wd>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs` paged by 20, ≤ 200 postings + detail GET for new ids | "Posted N Days Ago" → approximate date; a known id without a fresh detail is only marked seen |
| publicapi: remotive, arbeitnow, remoteok (UA sent, legal element skipped), jobicy, themuse (≤ 3 pages), adzuna (only with `ADZUNA_APP_ID/KEY`) | as in `seed/public-apis.json` | |
| publicapi: devpost (paged, ~1 req/s), devfolio (`POST /api/search/hackathons`), unstop, hackerearth (events), kaggle (`POST …/ListCompetitions`) | as in `seed/public-apis.json` | hackathons are `type: 'hackathon'`; Devpost display ranges → deadline via the shared parser |
| rss | RSS/Atom (rss-parser), conditional GET | unstructured → LLM extraction |
| sitemap | job-like `<loc>` URLs, each new one scraped via Firecrawl | |
| firecrawl | index page scraped with a JSON listing schema, then ≤ `FIRECRAWL_MAX_DETAIL_PAGES` (20) **new** detail links as Markdown | robots.txt checked first (24 h cache); standby (no LLM) → server LLM reads the Markdown, else job-like links |
| jobspy | — | opt-in, not enabled: fails with a clear `parse` error |

Provider and feed URL come from `config.provider` / `config.feedUrl` (the API's seed loader
sets both from `apiUrl`), else from the source URL's host. Per-domain politeness: one fetch per
host at a time (`ratelimit:domain:<host>` lock, 10 min TTL). ATS kinds share their API host, so
all Greenhouse boards are fetched one after another. A busy host delays the job by 15–45 s
without using an attempt.

**SourceError → source health** (`sources.health` + `healthCode` + `errorReason = "<code>: <message>"`):

| kind | retried by BullMQ | health / healthCode |
|---|---|---|
| `network`, `ratelimited` | yes (3 attempts) | `degraded`, then `failing` after 2 consecutive failures |
| `parse` | no | `degraded`, then `failing` after 2 |
| `auth`, `notfound`, `blocked` (robots.txt) | no | `failing` |
| `credits` | no (deferred) | `degraded` + **`paused:credits`** |
| success | — | `healthy` + `ok` (or `not_modified`), `lastCheckedAt`, `lastSuccessAt`, `listingsFound`, `consecutiveFailures: 0` |

Every run writes a `sourceRuns` document: `{sourceId, reason, status: ok|not_modified|error|deferred, startedAt, finishedAt, durationMs, found, new, updated, unchanged, errors[], backend, creditsUsed}`.

## 4. What the worker writes

| Collection | Fields (beyond API.md §12) |
|---|---|
| `listings` | the shared `Listing`, plus `applyCheck {status: ok\|dead\|redirect_home\|error, httpStatus, finalUrl, checkedAt, error}`. Worker-internal: `sourceIds[]` (**every source the listing was seen in**; `sourceId` is the last one that wrote content), `sourceKind`, `externalId`, `externalVersion`, `applyUrlKey`, `structured`, `extractedHash`, `extractMethod` (`rules\|llm\|none`), `embeddingHash`, `embeddingModel`, `repostCount`, `identicalOpenRoles`, `lastGhostCheckAt` |
| `matches` | every `FitResult` field at the top level (`score, rawScore, components, contributions, weights, caps, ghostPenalty, hardFails, semanticAvailable, details, explain`), `profileHash` (= the profile's API `profileHash`, so it lines up with `explanations`), `computedAt`. Worker-internal: `matchHash` (profile + weights), `semantic` (cosine or null), `listingType`, `listingDeadlineAt` |
| `notifications` | the shared `Notification`. `channels` is `['inapp']`, or `['inapp','push']` once a push was delivered. Worker-internal: `dedupeKey`, `pushStatus` (`none\|pending\|sent\|failed`), `pushAfter` |
| `sourceRuns` | §3 |
| `sources` | `health, healthCode, errorReason, lastCheckedAt, lastSuccessAt, listingsFound, consecutiveFailures, etag, lastModified` |
| `profiles` | `embedding` (384), `embeddingHash`, `embeddedAt`, `embeddingModel`, `matchHash`, `matchFloors` |
| `tracker_items` | appends `nudges[] {kind, dueAt, sentAt, dismissedAt: null}` |
| `alert_rules` | `lastTriggeredAt`, `lastDigestAt` |
| `push_subscriptions` | deletes on 404/410 from the push service; sets `lastUsedAt` |

Reads: `subscriptions` and `sources` (visibility), `interactions` (saved → deadline reminders
and pinned matches), `settings` (weights, notification prefs, `ai.enabled`), `users`.

Indexes: the worker builds only its own declared indexes (listings, matches, notifications,
sourceRuns), one at a time. An index that already exists with other options is logged and left
alone, and nothing is dropped. The Atlas vector index `listings_embedding` (filters `type`,
`archived`, `deadlineAt`) is created in Atlas (`apps/api/src/models/indexes.md`).

## 5. Pipelines

- **Ingest.** Fetch, normalise, then `canonicalKey` + `contentHash` (title, company, locations,
  deadline, description). Dedupe within the run, then upsert. A new listing gets `seenCount 1` and an
  initial ghost risk. The same hash bumps `lastSeenAt` and `seenCount`, and adds the source to
  `sourceIds`. A changed hash updates the fetched fields and resets `extractedHash`/`embeddingHash`,
  which re-runs extract and embed. When another source already has a richer record, that record
  wins and is only bumped. Reappearing after 7 d unseen, or under a new id in the same source,
  counts as a re-post. New and changed listings go to the flow; new ones also go to `ghostcheck`.
- **Extract.** Structured listings (ATS, public APIs: `structured: true`) use the deterministic
  rules only: skills (required vs nice-to-have), grad years, degrees, experience, citizenship,
  deadline, stipend and remote. Others (RSS, crawls) call the server LLM through AI SDK
  `generateObject` with a zod schema: `response_format: json_object`, `max_tokens ≥ 4096`
  (reasoning tokens count), 30 s timeout, 2 retries, code fences stripped. Results are cached in
  Redis by `contentHash` for 30 d. Source fields always win and extraction fills gaps.
  **Budget:** a personal source's listing is charged to its owner
  (`llm:calls:<userId>:<day>`, cap `LLM_DAILY_USER_CAP` = 50, same key as the API, tokens in
  `llm:tokens:<userId>:<day>`). An owner with AI off gets rules only. Community listings use
  `llm:calls:server:<day>` (cap `LLM_DAILY_SERVER_CAP` = 1000). Over a cap → rules only, and the job still succeeds.
- **Embed.** `@huggingface/transformers` `feature-extraction` with `Xenova/bge-small-en-v1.5`
  (q8 ONNX, mean pooling, normalised, 384-d). It loads lazily once per process and caches the
  model in `HF_HOME`. Each listing job also embeds up to 15 other waiting listings (batch 16).
  `EMBEDDING_PROVIDER=openai` with `OPENAI_API_KEY` uses `text-embedding-3-small` at 384 dims instead.
  Listing text = title + company + type + skills + the first 1500 characters of the description.
  Profile text = headline, roles, types, skills, education, projects, summary. A profile change → `match {userId, reason:'embedding'}`.
- **Match.** Visibility follows the API's rule exactly: own personal sources + subscribed
  community sources, or every community source when the user has neither. A listing is visible
  if any of its `sourceIds` is. **Full** (`{userId}`): stage 1 = vector top-K
  (`MATCH_CANDIDATES_K` = 200) over visible listings, plus top 40 per opportunity type (the
  profile's types, or all), plus every saved or tracked listing. Stage 2 = shared `computeFit` with
  the user's normalised weights. It upserts `matches`, then **deletes the user's other matches**,
  so a disabled pack or removed source leaves the feed after the API's `match {userId, reason:'sources'}`.
  Without a profile embedding it falls back to rules only over the 200 freshest visible listings.
  **Incremental** (`{listingIds}`): for each user with an embedding who can see the listings
  (200 users per job, then a continuation job), it writes the match when the listing clears the
  user's stage-1 floor (the K-th similarity at the last recompute), already had a match, or fires
  an instant rule. Each rule that fired → `notify {kind:'instant'}`.
  Vector adapter: `VECTOR_SEARCH=atlas` runs `$vectorSearch` on `listings_embedding` (filter
  `archived` + `type`; source visibility is post-filtered after over-fetching 5×). It falls back
  to the memory scan for 10 min on error. `memory` keeps a cached `Float32Array` matrix (5 min TTL).
- **Ghostcheck.** HEAD the apply URL (GET when HEAD is refused), following redirects, with a
  10 s timeout. Also detects redirect-to-home and counts identical open roles at the company,
  then the shared `ghostRisk` (age, re-posts, dead link, boilerplate, unseen) → `ghostRisk` +
  `applyCheck`. A score move ≥ 10 → `match {listingIds}`. Weekly re-check.
- **Notify.** Web push (VAPID, `web-push`) plus an in-app document. No email and no Telegram.
  The push payload is `{title, body, url, tag, notificationId, kind}` (matches `apps/web/src/sw.ts`).
  - instant: at most 3 pushes per rule run (the rest in-app), one push per (user, listing) per 30 d,
    `PUSH_DAILY_CAP` = 10 per user per UTC day (overflow in-app). Dedupe key `match:<rule>:<listing>`.
  - quiet hours (rule's, else the settings'): the in-app item is created now and the push waits
    until the window ends (flushed by the hourly tick). Windows may wrap midnight.
  - digests: per daily/weekly rule at `digestTime` (and `digestDay`) in the rule's time zone, plus
    the settings card ("Today: N new Strong fits · M deadlines tomorrow").
  - deadline reminders: `settings.notifications.deadlineReminders` (7/3/1 d) for tracked items
    (non-terminal stages) **and saved listings that are not tracked**. Each threshold fires once.
  - nudges: applied +10 d → follow-up, +30 d → move to ghosted; interview +7 / +21 d. Snoozes are
    honoured, and at most one nudge push per day.
  - test (`{userId, alertRuleId, test:true}`): "Test: “<rule name>”" on the rule's channels, bypassing quiet hours and caps.
  - expired subscriptions (404/410) are deleted.
- **Cleanup.** Archive listings unseen for 60 d and delete their matches; delete `sourceRuns`
  older than 30 d and DLQ entries older than 7 d.

## 6. Crawler: Firecrawl cloud → self-hosted standby (BRIEF decision 3)

`CrawlerClient.scrape(url, {formats, userId})`: check robots.txt, then:

1. Backend = `crawler:backend` (`selfhosted` while switched, else cloud). Cloud: an hourly
   `GET /v2/team/credit-usage` (cached in `crawler:cloud:remaining`); below 20 credits → standby for 6 h.
2. Reserve credits in `crawler:credits:<UTC day>` (1 per page, +4 with JSON extraction). Over
   `FIRECRAWL_DAILY_CREDIT_CAP` → switch to the standby for 6 h. A personal source over
   `FIRECRAWL_USER_DAILY_CREDIT_CAP` (30, key `crawler:user:<id>:<day>`) is deferred instead,
   and the global backend is not touched.
3. `POST {FIRECRAWL_API_URL}/v2/scrape`. The reservation is corrected with `metadata.creditsUsed`;
   failed calls are refunded. **HTTP 402** → refund, switch to the standby for 6 h, and retry this
   call on the standby.
4. Standby: `StandbyManager.ensureReady()` runs `DescribeInstances`; if stopped,
   `StartInstances`; then polls until `running`, then polls `GET {url}/v0/health/readiness` and
   a real `/v1/scrape` of example.com until both succeed. The whole wait is capped at 4 min.
   Concurrent callers share one wait. Only `markdown`/`html`/`links` are sent (the standby has no
   LLM provider). Calls count in `crawler:selfhosted:<day>` and the user's key, and every call
   updates `crawler:standby:lastUsed`. The `standby-idle` job stops the instance 20 min after the last use.
5. With no `FIRECRAWL_INSTANCE_ID` or `FIRECRAWL_SELF_HOSTED_URL` (or no cloud key and no
   standby) → `SourceError('credits')` → the source shows `paused:credits` and resumes on its
   next scheduled run.

EC2 uses the AWS SDK default credential chain (the instance role in prod, `AWS_PROFILE` locally),
region `AWS_REGION`. It is unit-tested with a mocked EC2 client and nock (`crawl/crawl.test.ts`).

## 7. Redis keys

| Key | Meaning |
|---|---|
| `crawler:backend` (+ `crawler:backend:reason`) | `selfhosted` with a 6 h TTL while switched |
| `crawler:credits:<day>` / `crawler:selfhosted:<day>` / `crawler:user:<id>:<day>` | daily meters (3 d TTL), shared with the API's `/v1/sources/credits` |
| `crawler:standby:lastUsed` | epoch ms of the last standby call |
| `crawler:cloud:remaining`, `crawler:cloud:remainingCheckedAt` | last credit-usage result (the UI may show it) |
| `crawler:robots:<host>` | robots.txt cache (24 h) |
| `ratelimit:domain:<host>` | per-host fetch lock |
| `llm:calls:<userId\|server>:<day>`, `llm:tokens:<userId\|server>:<day>` (hash `prompt, completion, total`) | LLM budget, shared with the API |
| `llm:extract:<contentHash>` | extraction cache (30 d) |
| `notify:pushed:<user>:<listing>`, `notify:push:<user>:<day>`, `notify:nudgepush:<user>:<day>` | push dedupe and caps |

## 8. Health and metrics (`HEALTH_PORT`, default 4001)

`GET /healthz` → `{ok:true, redis, mongo, queues}` (liveness; the Docker `HEALTHCHECK` uses node
`fetch`). `GET /readyz` → 503 until Redis is `ready` and Mongo is `connected`. `GET /metrics` →
Prometheus text:

- Counters: `beacon_worker_jobs_processed_total{queue}`, `beacon_worker_jobs_failed_total{queue}`,
  `beacon_worker_dead_letters_total{queue}`, `beacon_worker_source_errors_total{kind}`,
  `beacon_worker_listings_ingested_total{result}`, `beacon_worker_extractions_total{method}`,
  `beacon_worker_llm_failures_total{op,reason}`, `beacon_worker_embeddings_total{kind}`,
  `beacon_worker_matches_written_total{mode}`, `beacon_worker_ghostchecks_total{dead}`,
  `beacon_worker_notifications_total{kind}`, `beacon_worker_pushes_total{delivered}`,
  `beacon_worker_push_subscriptions_pruned_total`.
- Gauges: `beacon_worker_queue_depth{queue,state}`, `beacon_worker_crawler_backend{backend}`,
  `beacon_worker_crawler_cloud_credits_used{day}`, `beacon_worker_crawler_daily_credit_cap`,
  `beacon_worker_crawler_selfhosted_calls{day}`, `beacon_worker_standby_available`.

## 9. Environment (`src/env.ts`)

`NODE_ENV HEALTH_PORT LOG_LEVEL REDIS_URL QUEUE_PREFIX MONGODB_URI MONGODB_DB VECTOR_SEARCH(memory|atlas)
VECTOR_INDEX_NAME WORKER_PROCESSORS WORKER_SCHEDULER INGEST_MAX_LISTINGS(1000) MATCH_USERS_PER_JOB(200)
MATCH_CANDIDATES_K(200) LLM_PROVIDER LLM_BASE_URL LLM_API_KEY LLM_MODEL LLM_MAX_TOKENS(≥4096) LLM_TIMEOUT_MS(30000)
LLM_DISABLED LLM_DAILY_USER_CAP(50) LLM_DAILY_SERVER_CAP(1000) EMBEDDING_PROVIDER(local|openai) EMBEDDING_MODEL
OPENAI_API_KEY HF_HOME FIRECRAWL_API_KEY FIRECRAWL_API_URL FIRECRAWL_DAILY_CREDIT_CAP(500, prod sets 150)
FIRECRAWL_USER_DAILY_CREDIT_CAP(30) FIRECRAWL_SELF_HOSTED_URL FIRECRAWL_INSTANCE_ID FIRECRAWL_STANDBY_IDLE_MINUTES(20)
FIRECRAWL_MAX_DETAIL_PAGES(20) AWS_REGION ADZUNA_APP_ID ADZUNA_APP_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT
PUSH_DAILY_CAP(10) WEB_URL`. Empty strings count as unset.

## 10. Tests

`pnpm --filter @kestrel/worker test`: 13 files, 110 tests (109 pass, 1 opt-in skipped). Fetchers run against the
recorded `seed/samples/*` responses with nock. Mongo uses `mongodb-memory-server`.

| Area | File |
|---|---|
| every fetcher (Greenhouse 304/404, Lever stub, Ashby, SmartRecruiters detail diffing, Workable, Workday paging/detail/200 cap, 11 public APIs, RSS, Firecrawl index → detail, link fallback, detection) | `fetchers/*.test.ts` |
| ingest: insert + run + health; **same listing twice → one doc, seenCount 2**; **content change → re-extract**; dedupe within a run and across sources; Workday re-list without detail = same doc; 304; 404 → failing; network → retry; `paused:credits` | `pipelines/ingest.test.ts` |
| credit meter; **cap flips backend** (6 h); 402 → standby; low balance; per-user cap; robots; **standby start / wait / 4 min timeout / idle stop with mocked EC2** | `crawl/crawl.test.ts` |
| rules extraction; LLM (`json_object`, `max_tokens ≥ 4096`, fences, cache, retries); per-user/server caps + token counters; owner AI off | `pipelines/extract.test.ts` |
| embed batching / skip; **match recompute** (top-level fit, weights change), rules-only fallback, visibility + removal, pinned saved listings, **incremental** + instant rules, chunking, floors | `pipelines/match.test.ts` |
| **notify dedupe**, **quiet hours** queue + flush, 410 pruning, push cap, reminders (tracked + saved), API test job, nudges + snooze, digest; ghostcheck + `applyCheck`; cleanup | `pipelines/notify.test.ts` |
| **real Redis**: retry with exponential backoff → `dead` queue; 404 not retried; **flow order** extract → embed → match + idempotent re-run; domain lock delays without using an attempt | `integration.test.ts` (skipped with a message when Redis is down) |
| health, readiness, `/metrics`; queue config; index conflict tolerance | `health.test.ts`, `queues.test.ts`, `models/indexes.test.ts` |
| **real model** (opt-in `RUN_MODEL_TESTS=1`) | `lib/embeddings.model.test.ts` |

Model test, run on 2026-10-27 (Apple Silicon laptop, Node 26): the first run including the
download of `Xenova/bge-small-en-v1.5` (34 MB in `HF_HOME`) took ≈ 19 s. With a warm cache, the
load plus the first text took 134 ms, and 32 short texts took 47 ms (1.5 ms/text, batch 16).
RSS grew 169 → 250 MB (+81 MB). sim(job, matching student) = 0.844 vs sim(job, accountant) = 0.477.

## 11. Live smoke (`src/scripts/smoke.ts`)

```bash
set -a; source secrets.env; set +a; \
VECTOR_SEARCH=memory MONGODB_DB=beacon_dev REDIS_URL=redis://localhost:6379 QUEUE_PREFIX=beacon-smoke \
WORKER_SCHEDULER=false HEALTH_PORT=0 LOG_LEVEL=warn \
pnpm --filter @kestrel/worker exec tsx src/scripts/smoke.ts --board groww --llm --firecrawl https://example.com
```

The script refuses `MONGODB_DB=beacon` and the default queue prefix. It upserts the two seed
sources exactly like the API seed loader (by `seedKey`, insert-only), embeds the fixture profile
`usr_aarav`, runs both ingests through the real queues, recomputes the user's matches, and at the
end removes the smoke profile and matches and obliterates its own queues.

Result on 2026-10-27 against Atlas `beacon_dev` (laptop, local Redis):

| Step | Result |
|---|---|
| Groww (Greenhouse `groww`) | 10 listings, all extracted (rules) and embedded; source `healthy/ok`; run 0.7 s |
| Devpost Hackathons (publicapi, 20 pages) | 173 listings, all extracted and embedded; `healthy/ok`; run 15.3 s (≈1 req/s politeness) |
| ingest → extract → embed → match | drained in 33.2 s: extract 183 jobs (21 s busy), embed 183 jobs (20 s busy, batches of 16), 4 match flow parents |
| profile embedding | 0.7 s including the model load (warm cache) |
| `matchUser` | 183 candidates, 183 matches written in 1.6 s. Top fits were remote hackathons at 63 (the fixture prefers remote internships/hackathons) |
| live LLM extraction (Meta `muse-spark-1.3-contributor`, `generateObject`) | valid structured output in 23.8 s (a reasoning model) |
| Firecrawl cloud | 1 scrape of example.com: `backend=cloud`, 1 credit, 959 chars Markdown, 0.6 s; `/v2/team/credit-usage` reported 1000 remaining before the call; meter 1/150 |
| process | 67 s wall, max RSS 573 MB (tsx + model + Mongo/Redis clients) |

The listings and the two sources stay in `beacon_dev` for the API and web agents.

**Image check** (`docker build -f apps/worker/Dockerfile -t beacon-worker:wave2 .`, default
`node:22-bookworm-slim`, 1.16 GB): inside the container, as user `node`, `LocalEmbedder` returned
a 384-d vector in 10.9 s including the model download (RSS 264 MB). Booted against local
Redis + Mongo: `/healthz`, `/readyz` and `/metrics` answered, Docker health was `healthy`, and
SIGTERM drained and exited 0 in 5–7 ms (3 runs). The Alpine build fails to load onnxruntime
(`__sprintf_chk: symbol not found`).

## 12. Known limitations

- `generateObject` is deprecated in AI SDK 7 (it still works and is the only API with
  `repairText`). The SDK's warning log is switched off in `lib/llm.ts`.
- The Atlas source-visibility filter runs after `$vectorSearch` (`sourceId(s)` is not an index
  filter field), so a user whose sources are a tiny share of all listings may get fewer than K
  stage-1 candidates. Adding `sourceIds` as a filter field to `listings_embedding` would make it exact.
- Push overflow above the daily cap stays in-app. The "and N more in Beacon" summary push from
  USERFLOW §3.4 is not sent.
- The standby path has not been exercised live in this session (the instance stays stopped); it
  is covered by unit tests with a mocked EC2 client and nock, plus `scripts/firecrawl-standby.sh`.
