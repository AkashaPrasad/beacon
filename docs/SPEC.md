# Opportunity Radar — Research, Spec & Claude Code Build Kit

> Version: 2026-10-27 · Stack: MERN (MongoDB · Express · React · Node) · Hosting: Cloudflare Pages (frontend) + AWS (backend)
>
> **How to use this file**
> 1. Read §1–§8 once so you understand what is being built and why (you will be asked about it in your end-term viva).
> 2. Fill in the env vars in §7.
> 3. Copy **everything inside §9** into Claude Code as the first message. It contains the whole build + test + deploy plan.
> 4. Use the §10 checklist after Claude Code reports "done".

---

## 1. Research — the problem

### 1.1 How students actually do this today (observed workflow)

| Step | What the student does now | Where it breaks |
|---|---|---|
| Discover | Checks LinkedIn, Internshala, Unstop, Naukri, college WhatsApp groups, Telegram channels, Devpost, Devfolio, MLH, scholarship portals, and 10–30 company career pages — all separately | 10+ tabs, no single feed. Opportunities on company career pages are never seen unless the student remembers to check |
| Filter | Reads every listing title, opens it, scrolls to "eligibility", closes it | Most listings are irrelevant (wrong batch year, wrong location, needs 3 yrs exp). Enormous wasted time |
| Judge fit | Guesses | No feedback on *why* they fit or don't; no resume-vs-JD gap info |
| Deadline | Screenshots, Notes app, memory | Deadlines missed; hackathon registration windows missed |
| Track | Spreadsheet, Notion, or nothing | Loses track of what was applied where; doesn't follow up |
| Alerts | LinkedIn job alerts (spam), Internshala emails (spam) | Alerts are not filtered by fit; students mute them |

### 1.2 Pain points (with evidence)

1. **The search itself is hard.** In a UK survey, only 17% of students described the internship search process as easy, and many found it difficult to locate roles aligned with their long-term goals. In an Indian survey of 1,050 students, 55% said finding an internship is difficult and 35% said there are not enough opportunities to apply for.
2. **Ghost jobs waste applications.** About one in five listings has qualified as a ghost job in any given quarter since 2022 per Greenhouse data; 70% of employers on Greenhouse had listed at least one. 81% of recruiters admit their employer posts ghost jobs (MyPerfectResume 2024). In June 2026 a US Senator formally asked the BLS/FTC whether ghost jobs are deceptive practice — this is now a policy issue.
3. **Ghosting.** 52% of job seekers reported being ghosted during the interview process (Greenhouse survey); one student applied to 27 Handshake internships and got one reply.
4. **Where you apply matters more than how much.** Huntr's 2026 analysis of 600k+ applications found direct applications on company career pages perform ~14x better than quick-apply on third-party boards, and tailored resumes yield ~1 interview per 17 applications. → Students should be monitoring career pages directly, which no student tool does well.
5. **Platforms over-index on résumés / spray-and-pray.** A 1,700-student hackathon survey found the top complaint about applying online was that platforms lean too heavily on résumés; 38% of students value learning over pay for internships (so matching must weigh learning/role content, not just salary).
6. **Volume is exploding.** Job seekers are applying to roughly twice as many jobs as in 2024 because of ghost jobs, AI agents, and competition — more noise, less signal.

### 1.3 Existing products and their gaps

| Product | What it does well | Gap for an Indian/global student |
|---|---|---|
| **LinkedIn Jobs** | Scale, networking | Alerts not fit-filtered; heavy ghost/repost noise; Easy Apply converts badly |
| **Internshala / Unstop / Naukri** | Indian internships, hackathons (Unstop) | Siloed; spammy emails; no career-page coverage; no fit explanation; no tracker |
| **Handshake** | University-affiliated postings (US) | Low response rates reported; US-centric; no external aggregation |
| **Jobright** | Strong AI matching, H1B filter, ghost-job filtering | US-only coverage; 33% price hike; many billing/cancellation complaints; AI resume hallucinations noted in reviews |
| **Simplify** | Autofill + tracker + recommendations | Mostly US; closed; no custom sources; no hackathons/scholarships |
| **Huntr** | Excellent Kanban tracker + extension | Tracking only, not discovery; free tier capped at 100 jobs |
| **JobLeads** | Job board + tools | Most features paywalled; repeated complaints of deceptive billing |
| **Devpost / Devfolio / MLH** | Hackathons | Separate from jobs; no personal filtering; deadlines easy to miss |
| **Buddy4Study / NSP** | Scholarships | Not integrated with anything; eligibility rules are buried |

**Pattern:** every tool does *one* vertical (jobs OR hackathons OR scholarships), is US-centric, hides matching logic, and charges for alerts. None lets a student say *"watch these 25 company pages and this hackathon site and tell me only what fits me."*

### 1.4 What Opportunity Radar does differently (the thesis)

- **One radar for jobs + internships + hackathons + scholarships + fellowships** — the first-year-to-final-year student lifecycle, not just "jobs".
- **Source-agnostic:** user adds any URL (career page, hackathon site, scholarship portal). The system auto-detects the right cheapest extraction path (ATS API → feed → crawler).
- **Transparent fit scoring:** every match shows *why* (skills overlap, eligibility, location) and *what's missing*, with adjustable weights. Not a black box.
- **Ghost-job and stale-listing detection** so students stop wasting applications.
- **Deadline-first UX:** hackathons and scholarships are driven by deadlines; the UI surfaces them as a timeline, not a list.
- **Bring-your-own-key AI + privacy choices**, free self-hostable, no paywall on alerts.
- **Built-in tracker with follow-up nudges** (because ghosting is the norm, the app reminds you to follow up and when to move on).

---

## 2. Open-source / managed building blocks (do NOT rebuild these)

| Need | Use | Why |
|---|---|---|
| Crawl arbitrary pages → markdown/JSON | **Firecrawl** cloud API (`firecrawl` npm SDK) — 191k+ stars, TypeScript | Self-hosting needs 8–12 GB RAM and a Playwright service; cloud free tier (~500 credits) + BYOK. Used only as the *fallback* extractor |
| Lightweight self-host fallback (optional) | **CRW** (Firecrawl-compatible single Rust binary, ~6 MB RAM) | If you later want zero-API-key crawling on the same t4g.small |
| Structured job boards without scraping | **ATS public JSON endpoints**: Greenhouse `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`, Lever `api.lever.co/v0/postings/{company}?mode=json`, Ashby `api.ashbyhq.com/posting-api/job-board/{board}`, SmartRecruiters `api.smartrecruiters.com/v1/companies/{id}/postings`, Workable public widget endpoint | Thousands of companies use these ATSs; the endpoints are stable, free, no credits, no bot-blocking. **This is the main efficiency win.** |
| Public job APIs | Adzuna API (free dev key), The Muse public API, Remotive, Arbeitnow, RemoteOK, Jobicy | Free, structured, global/remote coverage |
| Multi-board scraping (optional) | **JobSpy** (speedyapply/JobSpy, ~3.3k stars; `ts-jobspy` port) | Indeed/LinkedIn as an opt-in source; mark as "best effort", obey ToS |
| Hackathons | Devpost hackathons JSON, MLH seasons page, Devfolio, Unstop (Firecrawl fallback) | |
| Resume ↔ JD keyword/ATS scoring ideas | **Resume-Matcher** (srbhr/Resume-Matcher, ~27k stars, TS, Apache-2.0) | Port the scoring approach, don't rebuild from scratch |
| Resume PDF text | `unpdf` or `pdf-parse`; DOCX via `mammoth` | |
| Embeddings (free, CPU) | **transformers.js** (`@huggingface/transformers`) with `Xenova/bge-small-en-v1.5` (384-dim) | Runs on 2 GB ARM box; loaded once in the worker. BYOK alternative: OpenAI `text-embedding-3-small` |
| Vector search | **MongoDB Atlas Vector Search** (M0 free tier supports it) | Native to MERN, no extra DB |
| LLM calls (BYOK, any provider) | **Vercel AI SDK** (`ai` + `@ai-sdk/openai-compatible`) | One interface for Meta Model API, OpenAI, Gemini, OpenRouter, Ollama |
| Background jobs / scheduling | **BullMQ** + Redis (single container) | Repeatable crawl jobs, retries, concurrency caps |
| Auth | Google Sign-In: `@react-oauth/google` (frontend) + `google-auth-library` ID-token verification (backend), JWT in httpOnly cookie | No Passport/session store needed |
| Email | **Resend** + **react-email** | Free tier sufficient; beautiful digests |
| Telegram alerts | **grammY** | Students live on Telegram |
| Web push | `web-push` (VAPID) | |
| Kanban DnD | **dnd-kit** | |
| UI kit | **shadcn/ui** + Tailwind v4 + **Motion** (framer-motion) + components sourced from **reactbits.dev**, **21st.dev**, **Aceternity UI** | Battle-tested, copy-paste, no vendor lock |
| Lists at scale | **TanStack Virtual**, **TanStack Query**, **TanStack Table** | 10k listings without jank |
| Command palette, toasts, forms | `cmdk`, `sonner`, `react-hook-form` + `zod` | |
| Dedup/similarity | `string-similarity` / simhash on normalised `company+title+location` | |
| Logging / errors | `pino`, Sentry (free tier) | |
| TLS + reverse proxy | **Caddy** (auto Let's Encrypt) | One container, zero config |
| Testing | Vitest, Supertest, `mongodb-memory-server`, **Playwright** (+ `@axe-core/playwright`), Lighthouse CI, `autocannon` | |
| Infra | Terraform (`hashicorp/aws`) + Docker Compose + GitHub Actions; **Wrangler** for Cloudflare Pages | |

---

## 3. Feature spec

### 3.1 Core (must ship)

**A. Onboarding (under 3 minutes)**
- Google Sign-In only (no password flows).
- Upload resume (PDF/DOCX) → parsed into an editable structured profile (skills, education, grad year, projects, links, preferred roles, locations, remote preference, stipend floor, visa/work-auth, languages).
- Pick opportunity types: Internship · Full-time · Hackathon · Scholarship/Fellowship · Research · Open-source programs (GSoC/MLH Fellowship/LFX).
- Quick-start source packs: "Top Indian product companies", "FAANG+ India", "YC startups hiring interns", "Hackathons India", "Scholarships for engineering students", "Remote-friendly startups". User can toggle any.

**B. Sources Manager**
- Add any URL. The system auto-classifies: ATS (Greenhouse/Lever/Ashby/SmartRecruiters/Workable/Workday) → public API → RSS/sitemap → Firecrawl crawl.
- Per-source: refresh interval (1h/6h/daily/weekly), type tag, enable/disable, "last checked", "listings found", health status, error reason.
- Community/global sources are crawled **once** and shared across users (deduped), personal sources are per user. Cost control: hard cap on Firecrawl credits per day with a visible meter.

**C. Radar Feed**
- Ranked by *fit score* with explainers; filters: type, deadline window, location/remote, stipend, eligibility (grad year), company, source, freshness; saved filter views.
- Each card: title, company (logo via Clearbit/favicon), location/remote, stipend, deadline countdown, posted date, **fit score ring**, 3 "why it fits" chips, 1–2 "gaps" chips, ghost-risk badge, source badge, actions (Save, Hide, Apply → opens apply link, Add to tracker).
- Detail drawer: full description (sanitised), eligibility extracted, skills matched/missing, "tailor resume" tips, similar opportunities, apply link health check.
- Keyboard-first: `j/k` navigate, `s` save, `h` hide, `a` add to tracker, `/` search, `⌘K` palette.

**D. Matching engine** (see §4) with user-adjustable weights (sliders: Skills / Role / Location / Eligibility / Freshness / Stipend).

**E. Alerts**
- Channels: Email digest (daily/weekly, chosen time), Telegram, Web push, in-app.
- Rules builder: "Notify me instantly when fit ≥ 80 AND type = Internship AND deadline ≤ 14 days" etc. Multiple rules.
- Deadline reminders: 7d / 3d / 1d before.

**F. Tracker**
- Kanban: Saved → Applied → OA/Test → Interview → Offer → Rejected/Ghosted.
- Auto follow-up nudges: 10 days with no response → "send follow-up" (template); 30 days → suggest "move to ghosted".
- Notes, contacts, documents per card; applied-date; outcome analytics (response rate per source → tells the student where to apply).

**G. Ghost/stale detection**
- Signals: listing age > 45 days, reposted ≥ 3 times, apply link 404/redirect-to-home, boilerplate "always accepting", company has > N open identical roles. Shown as a risk badge with reasons.

**H. Settings & customisation**
- Theme (light/dark/system), accent colour, density (comfortable/compact), font size, reduced motion.
- AI: default provider key (server) or **user's own key** (stored encrypted; provider selectable; model selectable; "disable AI" option → pure embedding + rules matching).
- Privacy: "send resume text to AI provider" consent toggle (required because the default Meta Contributor tier may use prompts for training); data export (JSON); delete account.
- Notification preferences; quiet hours; digest time; time zone.

### 3.2 Nice-to-have (ship if time remains, in this order)
1. Browser extension / bookmarklet "Add this page as a source".
2. Public shareable "radar" (a curated feed link for a college club).
3. Cover-letter / "why us" draft from profile + JD (BYOK).
4. Calendar export (.ics) for deadlines.
5. Weekly "market pulse" (what skills are trending in matched listings).

---

## 4. Matching algorithm (hybrid, explainable, cheap)

```
fit = 100 * (
    0.40 * semantic          # cosine(profile_embedding, listing_embedding)  [bge-small, 384-d]
  + 0.25 * skills            # weighted Jaccard of extracted skill sets (required skills weigh 2x)
  + 0.15 * role_alignment    # preferred roles vs listing title/category (taxonomy map)
  + 0.10 * eligibility       # grad year, degree, experience band  (hard-fail → score capped at 35)
  + 0.05 * location          # remote pref / city match / relocation OK
  + 0.05 * freshness         # decays over 30 days; deadline urgency boosts
) - ghost_penalty            # 0–20 based on ghost signals
```

- Weights are user-adjustable sliders (sum normalised to 1).
- Hard constraints (e.g., "needs Indian citizenship", "graduating 2027 only", "on-site Bangalore" when user is remote-only) are applied as **filters or caps**, never silently.
- Stage 1 (cheap): MongoDB Atlas `$vectorSearch` returns top 200 candidates for the user. Stage 2: deterministic scoring above. Stage 3 (optional, BYOK/credits): LLM re-rank of top 30 producing `{why_fit[3], gaps[2], tailoring_tips[2]}` — **cached per (listing, profile-hash)** so it runs once.
- Skills/eligibility extraction from listings happens once per listing at ingest (LLM structured output with zod schema; fallback: keyword taxonomy). Profile embedding recomputed only when profile changes.
- Everything is explainable: the UI shows each component's contribution.

---

## 5. UI / UX specification

**Design direction (non-negotiable):** This must look like a product a senior design team shipped, not an "AI-generated SaaS template". Concretely:
- **No** purple-to-blue gradient hero, **no** generic "Supercharge your career with AI ✨" copy, **no** floating glassmorphism cards for the sake of it, **no** emoji-as-icons, **no** stock illustrations.
- Reference products to study (open them in the browser before designing): Linear (density + keyboard), Raycast (command palette), Vercel dashboard (tables, empty states), Arc (settings), Cron/Notion Calendar (timeline), Read.cv (profile). Steal *principles*, not screenshots.
- Pull real components from **reactbits.dev** (e.g., animated lists, count-up numbers, spotlight cards), **21st.dev** (shadcn-compatible blocks; Aceternity timeline/bento), and **shadcn/ui** as the base. Adapt tokens to one coherent system: one accent, neutral greys, one display font + one UI font (e.g., Instrument Serif/Geist or Inter + JetBrains Mono for numbers), 4-pt spacing scale, 8-px radius scale.
- Motion: 150–250 ms, spring easing, purposeful only (list enter, score ring fill, drawer slide, Kanban drop). Respect `prefers-reduced-motion`.

**Key screens**
1. **Landing** (public): one clear sentence, a live demo feed (seeded), "Sign in with Google". Lighthouse ≥ 95.
2. **Onboarding wizard** (3 steps, progress, can skip/return): Resume → Preferences → Sources.
3. **Radar** (home): left filter rail (collapsible), centre virtualised feed, right detail drawer. Sticky top bar with search, fit threshold slider, view switch (List / Deadline timeline / Board).
4. **Deadline Timeline**: horizontal week strips; hackathons/scholarships as pills; today marker; drag to tracker.
5. **Tracker** (Kanban + table view toggle), analytics header (applied, response rate, median response time, best sources).
6. **Sources**: table with health, add-URL modal with live detection ("Detected: Greenhouse board `stripe` → 142 jobs"), credit meter.
7. **Alerts**: rules builder (visual sentence builder: *When [fit ≥ 80] and [type is Internship] → [Telegram, instantly]*).
8. **Profile**: editable structured resume; skill chips with proficiency; "what recruiters see" preview.
9. **Settings**: tabs — Appearance, AI & Keys, Notifications, Privacy & Data.

**UX rules**
- Every list has: loading skeleton, empty state with a *next action*, error state with retry, and pagination/virtualisation.
- Optimistic updates for save/hide/track; undo toast for destructive actions.
- Mobile: bottom tab bar (Radar, Deadlines, Tracker, Alerts, Me); cards swipe (right = save, left = hide); drawer becomes bottom sheet.
- Accessibility: WCAG 2.2 AA; full keyboard nav; focus rings; ARIA on DnD; colour not the only signal (score ring has number + label).
- Perf budgets: LCP < 2.0 s on 4G, INP < 200 ms, JS ≤ 250 kB gz on first load (code-split by route), images lazy, fonts self-hosted with `font-display: swap`.

---

## 6. Architecture & AWS-optimised deployment

```
Browser ──► Cloudflare Pages (React SPA, global CDN, free)  ── custom domain: app.<domain>
   │
   └──► api.<domain>  (Cloudflare DNS proxied → AWS Elastic IP)
                 │
        ┌────────▼─────────────────────────────────────────────┐
        │  AWS EC2 t4g.small (ARM, 2 vCPU, 2 GB) – ap-south-1  │   ≈ $12–15/mo on-demand
        │  Docker Compose:                                     │
        │   • caddy     (TLS, reverse proxy, gzip/brotli)      │
        │   • api       (Express, 1 process, ~150 MB)          │
        │   • worker    (BullMQ consumer, embeddings, crawls)  │
        │   • redis     (maxmemory 128mb, allkeys-lru)         │
        └──────────────────────────────────────────────────────┘
                 │                         │
        MongoDB Atlas M0 (free, same region, Vector Search)   Firecrawl Cloud / Resend / Telegram / Meta Model API (outbound only)
```

**Why this is the least-resource / most-feature setup**
- Frontend is static on Cloudflare (free, global, DDoS-protected) — nothing to run on AWS for it.
- Atlas M0 is free and gives vector search; no self-managed Mongo.
- One small ARM instance runs API + worker + Redis. No Playwright/Chromium on the box (Firecrawl handles rendering remotely), which is what makes 2 GB enough.
- Repeatable crawl jobs are staggered (jitter) and rate-limited per domain; ATS APIs are polled with `ETag`/`If-Modified-Since`; listing text is hashed so unchanged pages cost zero LLM calls.
- Embedding model loads only in the worker (≈100 MB), API stays light. Node runs with `--max-old-space-size=512` (api) / `768` (worker).
- Cloudflare proxy in front of `api.<domain>` gives free TLS termination, caching for public GETs, and hides the EC2 IP.
- If the $200 AWS Free-plan credits apply to your account (new accounts since July 2025 get $100 + up to $100 more and the plan lasts 6 months), this runs for free for the semester.
- Upgrade path with zero code change: t4g.medium, or split worker to a second instance, or move jobs to SQS later.

**Repo layout (monorepo, pnpm workspaces)**
```
opportunity-radar/
  apps/web/          # Vite + React 19 + TS + Tailwind v4 + shadcn
  apps/api/          # Express 5 + TS + Mongoose + zod
  apps/worker/       # BullMQ workers: ingest, extract, embed, match, notify, healthcheck
  packages/shared/   # zod schemas, types, scoring lib, skill taxonomy
  packages/ui/       # design tokens + shared components
  infra/terraform/   # EC2, SG, EIP, IAM; outputs ip
  infra/compose/     # docker-compose.prod.yml, Caddyfile
  .github/workflows/ # ci.yml (lint/test/e2e), deploy-web.yml (wrangler), deploy-api.yml (ssh+compose)
  docs/              # ARCHITECTURE.md, RUNBOOK.md, TESTING.md, DECISIONS.md
```

---

## 7. Environment variables (fill before running Claude Code)

Put these in a file called `secrets.env` in the repo root **(git-ignored)**. Claude Code will split them into `apps/*/.env` and GitHub secrets.

```bash
# ── Domain / Cloudflare ───────────────────────────────────────────────
DOMAIN=yourdomain.com                     # apex you own on Cloudflare
WEB_SUBDOMAIN=app                         # → app.yourdomain.com (Pages)
API_SUBDOMAIN=api                         # → api.yourdomain.com (proxied to EC2)
CLOUDFLARE_API_TOKEN=                     # perms: Pages:Edit, DNS:Edit, Zone:Read
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ZONE_ID=

# ── AWS ───────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_INSTANCE_TYPE=t4g.small
SSH_PUBLIC_KEY=                           # contents of ~/.ssh/id_ed25519.pub (Terraform creates the key pair)

# ── Database / cache ──────────────────────────────────────────────────
MONGODB_URI=                              # Atlas M0 connection string (create cluster in ap-south-1 / Mumbai)
REDIS_URL=redis://redis:6379

# ── Auth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
JWT_SECRET=                               # 64 random chars (openssl rand -hex 32)
ENCRYPTION_KEY=                           # 32-byte hex, encrypts users' own API keys at rest (openssl rand -hex 32)

# ── AI (server default = Meta Model API, Muse Spark 1.3 Contributor) ─
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.meta.ai/v1       # verify in your Meta Model API dashboard
LLM_API_KEY=                              # your muse-spark-1.3-contributor key
LLM_MODEL=muse-spark-1.3-contributor
EMBEDDING_PROVIDER=local                  # local (transformers.js bge-small) | openai
EMBEDDING_MODEL=Xenova/bge-small-en-v1.5

# ── Crawling / data sources ───────────────────────────────────────────
FIRECRAWL_API_KEY=                        # free tier; users can add their own
FIRECRAWL_DAILY_CREDIT_CAP=150
ADZUNA_APP_ID=                            # optional, free at developer.adzuna.com
ADZUNA_APP_KEY=

# ── Notifications ─────────────────────────────────────────────────────
RESEND_API_KEY=
EMAIL_FROM="Opportunity Radar <radar@yourdomain.com>"
TELEGRAM_BOT_TOKEN=                       # from @BotFather (optional)
VAPID_PUBLIC_KEY=                         # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@yourdomain.com

# ── Observability (optional) ──────────────────────────────────────────
SENTRY_DSN=

# ── GitHub (for CI/CD) ────────────────────────────────────────────────
GITHUB_REPO=yourname/opportunity-radar    # Claude Code will create it if it doesn't exist (needs gh auth)
```

**Things you must do by hand (5 min total):**
1. Google Cloud Console → OAuth consent screen → add `https://app.<domain>` and `http://localhost:5173` as authorised JS origins.
2. MongoDB Atlas → create M0 in Mumbai → Network Access: allow `0.0.0.0/0` initially (Claude Code will tighten it to the EC2 IP after Terraform outputs it).
3. Cloudflare → create the API token with the three permissions above.
4. Resend → verify your domain (DKIM records) so digests don't land in spam.

---

## 8. Testing plan (Claude Code must execute all of it)

| Layer | Tool | What must pass |
|---|---|---|
| Static | `tsc --noEmit`, ESLint, Prettier, `knip` (dead code) | 0 errors |
| Unit | Vitest | scoring lib (every weight, cap, penalty), dedup, ATS detector, URL normaliser, skill extractor, deadline parser (IST/UTC, "rolling", "ASAP"), ghost-risk rules ≥ 90% coverage |
| API integration | Supertest + mongodb-memory-server + ioredis-mock | every route: auth (valid/expired/forged JWT), rate-limits, zod validation errors, pagination edges (page 0, huge page), ownership (user A cannot read user B's sources/tracker) |
| Worker | Vitest + recorded fixtures (`nock`) | ingest from Greenhouse/Lever/Ashby fixtures, Firecrawl fallback, retry/backoff, idempotency (same listing twice → one doc), credit cap stops crawling |
| E2E | Playwright (Chromium + WebKit + mobile viewport) | onboarding happy path, resume upload (PDF, DOCX, scanned-PDF → graceful error, 20 MB → rejected), add source → listings appear, filter/sort, save/hide/undo, tracker DnD, alert rule create → email sent (Resend test mode), keyboard shortcuts, dark mode, offline banner |
| Accessibility | `@axe-core/playwright` on every page | 0 serious/critical violations |
| Performance | Lighthouse CI (prod build, mobile) | Perf ≥ 90, A11y ≥ 95, Best-practices ≥ 95, SEO ≥ 90 |
| Load | `autocannon` against staging API on the t4g.small | `/feed` p95 < 300 ms at 50 concurrent; memory stable over 10-min soak (no leak) |
| Security | `npm audit`, headers check (helmet), CORS only from app domain, cookie `Secure/HttpOnly/SameSite=Lax`, secrets never in git (`gitleaks`) | all green |
| Deployment smoke | GitHub Actions after deploy | `GET /healthz`, Google login round-trip, one ingest job completes, one digest email renders |

**Edge cases explicitly required**: resume with no skills section; non-English resume; listing with no deadline; deadline in past; duplicate listing with different URL params; source URL that redirects; ATS board token wrong; Firecrawl quota exhausted mid-run; user removes own API key mid-session; two browser tabs updating tracker; timezone change; very long company names; emoji in titles; 0 matches state; 5,000 matches state.

---

## 9. THE CLAUDE CODE PROMPT (copy everything between the lines into Claude Code)

---

You are the lead engineer of a small senior team building **Opportunity Radar**, a production-quality MERN web app, from zero to deployed. You have full autonomy. Work in phases, verify each phase, and do not ask me questions unless a required secret is missing or an external account action is needed (then ask once, clearly, and continue with everything else).

### Ground rules
1. **Do not build what already exists.** Prefer well-maintained open-source packages/services (thousands of GitHub stars) over custom code. Before writing any non-trivial module, search the web for an existing solution and read its docs.
2. **Research with the real web first.** Before designing any screen, open and read: reactbits.dev, 21st.dev (including `https://21st.dev/llms.txt`), ui.shadcn.com, ui.aceternity.com, and look at Linear, Raycast, Vercel dashboard, Cron/Notion Calendar for interaction patterns. Write `docs/DESIGN.md` with the chosen aesthetic (fonts, palette, spacing, motion rules) and 10 concrete component choices with source links **before** writing UI code. The result must not look like a generic AI-generated SaaS template: no purple/blue gradient hero, no sparkle emojis, no glassmorphism for its own sake, no stock illustrations, no "Supercharge your X with AI" copy.
3. **Git hygiene:** commit at the end of every phase with conventional-commit messages. **Never add any AI tool as co-author or contributor in commits, PRs, README, or package.json** (no `Co-Authored-By` trailers). Author = the git user already configured.
4. **Secrets:** read `secrets.env` at the repo root (git-ignored). Never print secrets, never commit them. Create `.env.example` files with placeholders.
5. **Quality gates:** every phase ends with `pnpm lint && pnpm typecheck && pnpm test` green. Do not proceed with failures. Do not mark anything done you have not run.
6. **Keep a running `docs/PROGRESS.md`** with what was done, what was tested, and what's pending. At the very end produce `docs/HANDOVER.md`.
7. Target cost: frontend on Cloudflare Pages (free), backend on ONE AWS `t4g.small` ARM instance running Docker Compose, MongoDB Atlas M0, Redis in-container. Optimise memory and CPU everywhere (no Chromium on the server; Firecrawl cloud for rendering).

### Product definition
Opportunity Radar aggregates **internships, jobs, hackathons, scholarships/fellowships, research and open-source programs** from (a) curated source packs and (b) any URL a student adds, then ranks them by an **explainable fit score** against the student's parsed resume + preferences, alerts them through email/Telegram/web-push rules, flags **ghost/stale listings**, and tracks applications with follow-up nudges. It is free, BYOK for AI, privacy-respecting, and must feel like a product shipped by a senior design team (smooth, dense, keyboard-first, accessible, fast on mobile).

Full feature list, matching formula, UI spec, architecture and test matrix are in the companion document I'm pasting below as **SPEC**. Treat SPEC as the source of truth; where SPEC is silent, use best judgement and record the decision in `docs/DECISIONS.md`.

### Tech stack (fixed)
- Monorepo: pnpm workspaces + Turborepo. Node 22 LTS. TypeScript strict everywhere.
- `apps/web`: Vite, React 19, React Router 7, Tailwind CSS v4, shadcn/ui, Motion, TanStack Query/Table/Virtual, dnd-kit, cmdk, sonner, react-hook-form + zod, `@react-oauth/google`, PWA (vite-plugin-pwa) for web push + offline shell.
- `apps/api`: Express 5, Mongoose 8, zod, helmet, cors, express-rate-limit (Redis store), pino, `google-auth-library`, JWT in httpOnly cookies, multer (memory) for resume upload, `unpdf`/`mammoth` for parsing.
- `apps/worker`: BullMQ (Redis), `firecrawl` SDK, `@huggingface/transformers` (embeddings `Xenova/bge-small-en-v1.5`), Vercel AI SDK (`ai`, `@ai-sdk/openai-compatible`) for structured extraction and re-rank, `resend` + `react-email`, `grammy`, `web-push`.
- DB: MongoDB Atlas with Vector Search index on `listings.embedding` (384 dims, cosine). Redis for queues, rate limits, caches.
- Infra: Terraform (EC2 t4g.small Ubuntu 24.04 ARM, security group 22/80/443, Elastic IP, key pair from `SSH_PUBLIC_KEY`), Docker Compose (caddy, api, worker, redis), GitHub Actions (CI; deploy web via Wrangler to Cloudflare Pages; deploy api via SSH → `docker compose pull && up -d`), Cloudflare DNS via API (A record `api` proxied → EIP; CNAME `app` → Pages).
- Observability: pino JSON logs, `/healthz` + `/readyz`, optional Sentry.

### Data sources — implement in this priority (cheapest first)
1. **ATS detectors + fetchers** (no crawling, no credits): Greenhouse, Lever, Ashby, SmartRecruiters, Workable. Detect from the careers URL/HTML (link patterns like `boards.greenhouse.io/<token>`, `jobs.lever.co/<company>`, `jobs.ashbyhq.com/<board>`), then poll the JSON endpoint with ETag/If-Modified-Since. Verify each endpoint's current shape in its public docs before coding; write fixture files from real responses.
2. **Public APIs**: Adzuna (if keys present), The Muse public jobs API, Remotive, Arbeitnow, RemoteOK, Jobicy. Hackathons: Devpost hackathons endpoint, MLH events page, Devfolio. Scholarships: Buddy4Study and scholarships.gov.in listing pages (via step 4 if no feed).
3. **RSS/Atom/sitemap** for sites that offer them.
4. **Firecrawl cloud** (`/scrape` with JSON extraction schema) as the fallback for any other URL. Enforce `FIRECRAWL_DAILY_CREDIT_CAP` globally and per-user; show the meter in the UI; users may add their own Firecrawl key (encrypted at rest).
5. Optional, opt-in only, labelled "best effort": LinkedIn/Indeed via `ts-jobspy`. Respect robots.txt and terms; default OFF.

All listings normalise to one schema (`packages/shared/src/schemas/listing.ts`): `{ id, type, title, company, companyDomain, location[], remote: 'remote'|'hybrid'|'onsite'|'unknown', country, stipendMin, stipendMax, currency, period, postedAt, deadlineAt, eligibility: {gradYears[], degrees[], minExperienceYears, citizenship[], other[]}, skillsRequired[], skillsNice[], descriptionMd, applyUrl, sourceId, canonicalKey, contentHash, firstSeenAt, lastSeenAt, seenCount, ghostRisk: {score, reasons[]}, embedding: number[] }`. Dedup on `canonicalKey = normalise(company)+'|'+normalise(title)+'|'+normalise(primaryLocation)` plus URL canonicalisation; keep the richest record and merge `seenCount`.

### AI usage rules
- Server default LLM = `LLM_BASE_URL`/`LLM_MODEL` from env (Meta Model API, `muse-spark-1.3-contributor`, OpenAI-compatible chat completions with JSON schema output). Users can override with their own key for any OpenAI-compatible provider (OpenAI, Gemini OpenAI-compat endpoint, OpenRouter, Ollama URL) from Settings → AI & Keys; keys encrypted with `ENCRYPTION_KEY` (AES-256-GCM), never logged, never returned to the client after save (show last 4 chars).
- Show a one-time consent dialog: "Resume text and listing text are sent to the configured AI provider. The default provider's contributor tier may use prompts to improve its models. Use your own key or disable AI to avoid this." Provide **AI off** mode: matching works with embeddings + rules only (still good).
- Use LLMs only for: (1) resume → structured profile JSON, (2) listing → structured fields JSON at ingest (skip if ATS already gives structure), (3) optional re-rank + "why it fits/gaps/tips" for top 30, cached by `(listingId, profileHash)`. Everything else is deterministic.
- Every LLM call: zod-validated structured output, timeout 30 s, 2 retries with backoff, cost/tokens logged per user, daily per-user cap with graceful degradation.

### Phases (execute in order; each ends with green gates + commit)
**Phase 0 — Discovery (1 session).** Read SPEC. Browse the design references and component sites listed above. Verify current docs for: Firecrawl JSON scrape, Atlas Vector Search on M0, `@huggingface/transformers` Node usage, Vercel AI SDK openai-compatible provider, Wrangler Pages deploy, Cloudflare DNS API, Terraform AWS EC2 ARM AMI lookup, Resend + react-email, grammY, web-push. Write `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (initial), and a task list in `docs/PROGRESS.md`.

**Phase 1 — Monorepo & tooling.** pnpm + Turborepo, shared tsconfig/eslint/prettier, Vitest configured in every package, Husky + lint-staged, `gitleaks` pre-commit, `.env.example`s, `docker-compose.dev.yml` (redis + optional mongo for local), scripts: `dev`, `build`, `test`, `test:e2e`, `lint`, `typecheck`. Initialise git, create GitHub repo (`gh repo create` if needed), push.

**Phase 2 — Shared package.** zod schemas (user, profile, listing, source, trackerItem, alertRule, notification), skill taxonomy (≥ 400 tech + non-tech skills with aliases, e.g. "JS"→"JavaScript"), role taxonomy, URL normaliser, canonical-key + content-hash, deadline parser (IST default, handles "rolling", "ASAP", ranges), scoring library implementing SPEC §4 exactly with unit tests for every term, cap and penalty.

**Phase 3 — API.** Express app with: Google ID-token login (`POST /auth/google`), JWT cookie, `GET /me`, profile CRUD, resume upload+parse (PDF/DOCX, ≤ 10 MB, scanned-PDF → clear error), sources CRUD + `POST /sources/detect` (returns detected kind + preview count), feed `GET /feed` (cursor pagination, filters, sort by fit, uses Atlas `$vectorSearch` then scoring), listing detail, save/hide, tracker CRUD + move, alert rules CRUD, notifications list, settings (appearance, AI keys, notification prefs, privacy), data export (JSON) and account delete (cascade), `/healthz`, `/readyz`. Rate limits per route. Ownership checks everywhere. OpenAPI spec generated from zod (`zod-openapi`) and served at `/docs`. Integration tests with Supertest + mongodb-memory-server covering SPEC §8.

**Phase 4 — Worker.** BullMQ queues: `ingest` (per source, repeatable with jitter, per-domain concurrency 1, global concurrency 3), `extract` (structure + skills), `embed`, `match` (recompute user scores when profile/weights change; incremental on new listings), `ghostcheck` (HEAD apply URL, repost counting), `notify` (rule evaluation, digests at user's chosen time/timezone, deadline reminders 7/3/1 d), `cleanup` (archive listings unseen 60 d). Idempotent jobs, dead-letter queue, metrics endpoint. Fixture-based tests for each fetcher; Firecrawl calls mocked with `nock`; a real smoke test behind an env flag.

**Phase 5 — Web app, foundation.** Design tokens from `docs/DESIGN.md`, shadcn setup, fonts self-hosted, layout shell (sidebar + topbar + mobile tab bar), auth flow, route-level code splitting, TanStack Query with persisted cache, global command palette (`⌘K`), toasts, error boundaries, skeleton system, empty-state system, theme + density + reduced-motion settings. Lighthouse ≥ 90 on the empty shell.

**Phase 6 — Web app, screens.** In this order, each fully functional with loading/empty/error states and keyboard support: Landing → Onboarding wizard → Radar feed (virtualised) + detail drawer → Deadline timeline → Sources manager (with live detect) → Alerts rules builder → Tracker (Kanban + table, dnd-kit, undo) → Profile editor → Settings (Appearance, AI & Keys, Notifications, Privacy & Data). Use components adapted from reactbits.dev / 21st.dev / Aceternity where they fit the design system; credit sources in `docs/DESIGN.md`. Mobile layouts for every screen. Animations per SPEC §5.

**Phase 7 — Notifications.** react-email templates (digest, instant match, deadline reminder, follow-up nudge) rendered and previewed; Resend sending with test mode in CI; Telegram bot linking flow (`/start <code>`); web push subscription + service worker; in-app notification centre.

**Phase 8 — Testing & hardening.** Everything in SPEC §8: unit ≥ 90% on shared + scoring; API integration; worker fixtures; Playwright E2E (desktop Chromium, WebKit, iPhone viewport) including the listed edge cases; axe on every route; Lighthouse CI config with budgets; `autocannon` load script and results recorded in `docs/TESTING.md`; security checklist (helmet headers, CORS, cookies, audit, gitleaks). Fix everything found. No skipped tests.

**Phase 9 — Infra & deploy.**
1. Terraform: VPC default, SG (22 from my IP only, 80/443 from Cloudflare IP ranges only), t4g.small Ubuntu 24.04 ARM, 20 GB gp3, Elastic IP, user-data installs Docker + compose plugin + fail2ban + unattended-upgrades. Output the IP.
2. Cloudflare: create DNS `A api.<DOMAIN>` (proxied) → EIP; create Pages project `opportunity-radar`, custom domain `app.<DOMAIN>`; set SPA redirects (`_redirects`) and security headers (`_headers`).
3. Backend: build multi-arch (arm64) images with GitHub Actions → GHCR; `docker-compose.prod.yml` with memory limits (api 512m, worker 900m, redis 160m, caddy 64m), restart policies, log rotation; Caddyfile serving `api.<DOMAIN>` with automatic TLS (Cloudflare origin or Let's Encrypt via HTTP challenge — pick and document); deploy via SSH action.
4. Tighten Atlas network access to the EIP. Configure Atlas Vector Search index via Atlas Admin API or document the one-click step.
5. Set GitHub secrets from `secrets.env`. Run the deploy workflows. Verify: `https://api.<DOMAIN>/healthz` 200, `https://app.<DOMAIN>` loads, Google login works in prod, add source → listings ingested → feed shows fit scores → alert email received → Telegram message received. Record screenshots in `docs/HANDOVER.md`.
6. Write `docs/RUNBOOK.md`: how to rotate keys, view logs, scale up, restore, and the monthly cost estimate.

**Phase 10 — Seed & polish.** Seed 6 source packs with ≥ 150 real sources (verify each resolves), seed demo data for the landing page, run the full test suite + Lighthouse again, write `README.md` (what/why/architecture diagram/screenshots/how to run/how to deploy), finalise `docs/HANDOVER.md` with: what works, what is pending, known limitations, env var reference, and a 10-minute demo script for the viva.

### Definition of done
- All phases committed and pushed; CI green; prod URLs live; all §8 tests pass and are listed with results in `docs/TESTING.md`.
- No TODOs left in code without a corresponding entry in `docs/PROGRESS.md`.
- The app works end-to-end for a brand-new user in under 3 minutes with zero manual steps.

Begin with Phase 0 now. Here is SPEC:

[PASTE §1–§8 OF THIS FILE HERE]

---

## 10. After Claude Code says "done" — your 15-minute acceptance checklist

1. Open `docs/HANDOVER.md` — are prod URLs, screenshots and test results there?
2. Sign in with a fresh Google account → upload a resume → add `https://boards.greenhouse.io/<any-company>` → confirm listings appear with fit scores and explanations.
3. Add a hackathon source (Devpost) → check Deadline timeline.
4. Create an alert rule → confirm an email arrives (check spam; verify DKIM in Resend).
5. Drag a card in Tracker on your phone — smooth? Undo works?
6. Toggle dark mode, compact density, reduced motion — everything readable?
7. Run `pnpm test && pnpm test:e2e` locally once more; run Lighthouse on `app.<domain>` from your phone on 4G.
8. Check AWS Billing → Cost Explorer: a t4g.small + EIP should be ≈ $0.45/day. Set a $20 budget alert.
9. Check Firecrawl dashboard credits and the in-app meter match.
10. Read `docs/DECISIONS.md` — you must be able to defend every decision in the viva.

### Viva talking points (why this is an "innovative, meaningful" project)
- Hybrid explainable matching (vector + rules + optional LLM) instead of a black box.
- Cost-aware ingestion ladder (ATS API → public API → feeds → crawler) — most sources cost nothing.
- Ghost-job detection responds to a documented 2026 problem (≈1 in 5 listings).
- Privacy-first AI (BYOK, consent, AI-off mode), free and self-hostable.
- Production practices: typed monorepo, 90%+ test coverage on core, E2E + a11y + perf budgets, IaC, CI/CD, runbook — on a $15/month footprint.
