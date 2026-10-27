# Beacon viva demo script (10 minutes)

Run against production (`https://beacon.spacesdrive.cc`) with a prepared demo account that
already has a parsed resume, the Top Indian product companies and Hackathons India packs enabled,
one alert rule and a few tracker cards. Have a second browser profile ready for a fresh sign-in,
a terminal with `ssh` to the app box, and `https://api.beacon.spacesdrive.cc/docs` in a tab.

Before starting: open the API `/healthz`, confirm the standby is stopped
(`scripts/firecrawl-standby.sh status`), and set the browser to light theme at 100% zoom.

## Minute by minute

| Min | Do | Say |
| --- | --- | --- |
| 0:00 | Landing page. Scroll slowly through the story. | "Students watch 10 to 30 tabs for opportunities. Existing tools cover one vertical, hide their ranking and send unfiltered alerts. Beacon is one radar for every type, with a score you can inspect." |
| 1:00 | Sign in with Google (fresh profile). Onboarding: drop a resume PDF. Show the parsed, editable profile. | "Parsing is deterministic: text, sections, skills from a 781-skill taxonomy, grad year and degree by regex. The LLM only enriches, so this works with AI off." Edit one field to show it is editable. |
| 2:00 | Pick types and source packs. | "338 sources in 7 packs, every endpoint verified live on 27 October 2026. 222 of them are ATS JSON endpoints." Move to the radar. |
| 3:00 | Radar feed. Point at a fit ring, the why-it-fits chips, the gap chips and a ghost badge. Use `j`/`k`, `s`, `a`. | "Each score is a weighted sum, not a verdict. Semantic 40, skills 25, role 15, eligibility 10, location 5, freshness 5, minus a ghost penalty of 0 to 20." |
| 4:00 | Open the drawer. Show the component contributions, matched and missing skills, apply-link health. Open the weights sliders and drag Skills up. Watch the order change. | "Hard constraints are visible caps. A graduation-year mismatch caps at 35 and the cap is listed with its reason. Nothing is silently filtered." |
| 5:00 | Sources manager: paste a Greenhouse board URL. Show detection, kind and credit meter. Then show a Firecrawl-kind source and the meter. | "Detection tries the cheapest path first: ATS API, public API, RSS or sitemap, and only then the crawler. Of 338 seeded sources, 222 are ATS, 21 RSS, 5 public APIs and 90 need the crawler." |
| 6:00 | Show the credit meter and a source's health and last-checked. Terminal: `scripts/firecrawl-standby.sh status` (stopped). | "If the cloud answers 402, the daily cap is hit, or fewer than 20 credits remain, the worker sets a Redis flag, starts a stopped standby instance, waits for readiness and routes scrapes there. After 20 idle minutes it stops it again. Idle cost is a 30 GB disk, about $2.74 a month." |
| 7:00 | Deadlines timeline, then Alerts builder: build "fit at least 80, Internship, deadline within 14 days, push". Press the test action; show the push and the in-app notification centre. | "Alerts are web push and in-app only. No email, no Telegram: fewer third parties, no DKIM, nothing leaves the product. Deadline reminders fire at 7, 3 and 1 days." |
| 8:00 | Tracker: drag a card, press Undo. Show a nudge. | "Ten days without a response suggests a follow-up, thirty suggests moving on. Updates are optimistic with undo." |
| 8:45 | Settings, AI: show BYOK, the consent toggle, then switch AI off and return to the radar. | "Keys are AES-256-GCM encrypted, never logged and never returned beyond the last four characters. With AI off, matching still runs on local embeddings, the taxonomy and rules." |
| 9:15 | Production practices: `/docs` tab, CI badge, Terraform, `docs/DECISIONS.md`, test totals from `docs/HANDOVER.md`. | "Typed monorepo, 850 tests and 99.7% line coverage on the scoring library, Playwright with axe, Lighthouse budgets, Terraform, OIDC deploys, a runbook, on about $16 a month." |
| 10:00 | Stop; take questions. | |

## Talking points

### Hybrid explainable matching

- Three stages. Stage 1: Atlas `$vectorSearch` on a 384-d `bge-small-en-v1.5` embedding returns the top 200. Stage 2: deterministic `computeFit` in `packages/shared`. Stage 3 (optional): an LLM re-rank of the top 30 giving why-fit, gaps and tailoring tips, cached per `(user, listing, profileHash)` so it runs once.
- The score is reproducible and unit-tested; the UI shows every component's contribution. Weights are user sliders, normalised to sum to 1.
- Skills use weighted Jaccard (required skills weigh 2) so a broad profile is not penalised.
- If the vector index is missing, the worker's in-process cosine scan gives the same candidates, and scoring is identical.

### Cost-aware ingestion ladder (numbers from `seed/VERIFICATION.md`)

- 338 sources in 7 packs: 222 ATS (Greenhouse 85, Ashby 77, Workday 32, Lever 15, SmartRecruiters 12, Workable 1), 5 public APIs, 21 RSS, 90 crawler.
- So 66% of sources are free JSON endpoints, 7% are feeds or APIs, and only 27% ever need Firecrawl.
- Real volumes on 27 October 2026: Stripe 714 postings (30 internships), ServiceNow 688 (162), Swiggy 201 (56), Canva 78 (42), Databricks 896.
- 407 companies were probed; 222 verified, 14 wrong-company or stub boards were dropped, and 171 were found to have no usable ATS endpoint.
- `ETag` and `If-Modified-Since` polling plus a `contentHash` gate: unchanged text triggers no extraction, embedding or matching.
- Community sources are crawled once and shared; cost scales with sources, not users.

### Ghost detection

- Points: listing older than 45 days (+25, +10 more past 90), reposted 3 or more times (+25), apply link 404 or 410 (+35), redirect to the careers home page (+30), 5xx or network error (+10), boilerplate such as "always accepting" (+20), more than 5 identical open roles (+15), not seen in its source for 14 days (+15). Capped at 100.
- Penalty is score / 5, so at most 20 points off the fit. Each reason is shown with its points.
- It answers a documented problem: about one listing in five is a ghost.

### Privacy-first AI

- BYOK: any OpenAI-compatible provider; keys encrypted with AES-256-GCM, never logged, never returned.
- A consent toggle gates sending resume text to a provider, because the default tier may use prompts for training.
- AI-off mode: deterministic resume parsing, taxonomy skill extraction, regex eligibility, local embeddings, `computeFit`. Nothing leaves the server.
- The server default is the Meta Model API; it is a reasoning model, so structured calls use `max_tokens` of at least 4096.

### Firecrawl cloud to standby failover

- Triggers: HTTP 402, the global daily cap, or `remainingCredits < 20`. The worker sets `crawler:backend=selfhosted` with a 6 h TTL.
- The standby is a stopped t4g.large running self-hosted Firecrawl v2.11.162. The worker starts it with `ec2:StartInstances` (instance role scoped to that one instance), polls readiness, and an idle timer stops it after 20 minutes.
- The credit meter counts both backends so the user sees real usage.
- The standby moved to `ap-south-1b` after a t4g.large capacity shortage in 1a on 2026-10-27.

### Production practices

- Typed monorepo (TypeScript strict, pnpm, Turborepo); the scoring library has 850 tests at 99.7% line coverage with a 90% gate.
- Playwright (Chromium, WebKit, iPhone viewport) with axe on every route, Lighthouse CI budgets, an autocannon load test, a security check script, gitleaks in pre-commit and CI.
- Terraform for EC2, security groups, IAM and a GitHub OIDC deploy role; images built on native arm64 runners; Caddy with Let's Encrypt behind Cloudflare Full (strict).
- Runbook for logs, key rotation, scaling, restore and cost; every decision recorded with its rejected alternative.
- All of it for about $16 a month.

## Ten likely examiner questions

1. **Why not just ask an LLM to rank listings?** It is slow, costly per user, not reproducible and cannot be audited. Beacon retrieves with vectors, scores with a pure tested function, and uses an LLM only for optional explanation, cached once per listing and profile.
2. **How is the score explainable?** `computeFit` returns each component, its weight, its contribution, any caps with reasons and the ghost penalty. The drawer renders exactly that object. Weights are adjustable and the order updates live.
3. **What if a student's profile is broad or sparse?** Skills use weighted Jaccard so many skills do not dilute the score; unknown profile data scores 0.5 with a "complete your profile" gap instead of failing. If semantic similarity is unavailable its weight is redistributed over the other terms rather than counted as zero.
4. **How do you keep ingestion cheap?** The ladder (ATS API, public API, RSS, crawler), conditional requests, a content hash that stops unchanged text at the first step, shared community crawling, and a daily Firecrawl credit cap with a visible meter. 222 of 338 sources never touch the crawler.
5. **What happens when Firecrawl credits run out?** A 402, the daily cap or fewer than 20 remaining credits flips a Redis flag; the worker starts the stopped standby instance, waits for readiness, routes scrapes there, and stops it after 20 idle minutes.
6. **How do you detect ghost listings?** A points model over age, reposts, a dead or redirecting apply link, boilerplate text, many identical roles and not being seen recently. The reasons are shown and at most 20 points are deducted from the fit.
7. **What happens to user data and API keys?** Keys are AES-256-GCM encrypted, never logged (pino redacts them) and only the last four characters are ever returned. Resume text goes to an AI provider only with consent, and AI-off mode keeps everything local. Data export and account deletion are in Settings.
8. **Why no email or Telegram?** Each adds a third-party sender, DNS and DKIM setup, or a bot token, and moves user data out of the product. Web push and the in-app centre cover the alert use case with rules, quiet hours and deadline reminders.
9. **Why one small EC2 instance, and what are the failure modes?** The static frontend is on a CDN, the database is Atlas, and 2 GB is enough because embeddings are about 100 MB and no browser runs on the box. It is a single point of failure by design; Redis jobs are idempotent and retried, and recovery is a redeploy per the runbook. Upgrade path: a larger instance or a separate worker box with no code change.
10. **Why Redis `noeviction` and smaller Node heaps than the spec?** BullMQ can lose job and lock keys under LRU eviction. A heap equal to the 512 MB container limit gets OOM-killed before garbage collection, and onnxruntime memory is outside the heap, so the caps are 384 MB (api) and 640 MB (worker).

## If something fails live

- API down: show `/healthz`, then `kc ps` and `kc logs api` on the box; the runbook has the recovery steps.
- No push on stage: show the in-app notification, which is written regardless of push delivery.
- Standby slow to start: explain the measured start-to-ready time recorded in the RUNBOOK and show `scripts/firecrawl-standby.sh status`.
