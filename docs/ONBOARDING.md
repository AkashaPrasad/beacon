# Beacon onboarding: conversational setup, spotlight tour and coach marks

Final step list and references. Owners: the **onboarding / profile / settings / notifications agent** for the flow
(`features/onboarding/flow/*`, `steps/*`), and the **shell agent** for `/welcome`, the tour engine and coach marks.
It supersedes USERFLOW §1.3–1.7 wherever they differ. Evidence: `docs/UX-RESEARCH.md` (P10–P12). Screen
checklist: `docs/UX-RESTRUCTURE.md` §3. API asks: `docs/UX-RESTRUCTURE.md` §6.

**Goal:** a tech student goes from sign-in to a ranked radar in **≤ 2.5 minutes** on the resume path. They answer only
what Beacon can't infer, one question per page, and every answer visibly changes what comes next.

---

## 1. What the best products do, and what we take

| Product | What they do | What Beacon takes |
|---|---|---|
| **Linear** | About 7 single-purpose screens (welcome, theme, name, import, invite, notifications, first issue). About 1 minute. Every optional step shows "I'll do this later". It ends at a blinking cursor in real work ([Candu teardown](https://www.candu.ai/blog/linear-onboarding-teardown)) | One thing per page, always-visible skip, end inside the product |
| **Notion** | "What will you use Notion for?" changes the templates and starter workflows you get ([Dock](https://www.dock.us/grow-and-tell/how-notion-manages-multiple-use-cases-in-onboarding)) | Each answer visibly changes the result. The live "≈ N fits" line, and companies preselect packs |
| **Superhuman** | Full-screen panels with smart defaults took completion from about 30% to over 98%. Opinionated "first level". Practice by doing ("press the key now"). "If you are going to disturb the user, it needs to be for something extremely valuable" ([First Round Review](https://review.firstround.com/superhuman-onboarding-playbook.md)) | Prefill everything. The tour asks for one real action (save a listing) instead of describing it |
| **Duolingo** | Goal first. Value before sign-up (+20% DAU from delaying sign-up) ([Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding), [Appcues GoodUX](https://goodux.appcues.com/blog/duolingo-user-onboarding)). Progress bar, warm voice | Intent (opportunity types) comes right after the resume. Thin progress bar. Warm, short copy. The landing page's live demo feed is our "value before sign-up" |
| **Typeform** | One question at a time. Enter to continue, keyboard answers. Average completion 47–57% (vendor) ([Typeform help](https://help.typeform.com/hc/en-us/articles/360029615911)) | One prompt, one auto-focused input, `Enter` and number keys |
| **Stripe** | Onboarding should be "effortless": only the necessary steps, one Continue per step ([Stripe docs](https://docs.stripe.com/stripe-apps/patterns/onboarding-experience)) | No page that doesn't change ranking or sources |
| **Headspace** | Multi-select goals (+10% trial conversion, *secondary*). Critique: "personalisation" steps that don't change the next screen feel fake ([redesign case](https://jenniferqian.cargo.site/headspace-redesign-1)) | Multi-select types and roles. The review page proves every answer was used |
| **NN/g · Apple** | Wizards show position, have explicit Back/Next, reuse answers and save state ([NN/g](https://www.nngroup.com/articles/wizards/)). Tutorials are overused, so prefer pull revelations ([NN/g](https://www.nngroup.com/articles/onboarding-tutorials/)). Coach marks: one at a time, visually distinct, short ([NN/g](https://www.nngroup.com/articles/mobile-instructional-overlay/)). "fast, fun, and optional". Once skipped, don't present again but keep it findable. Ask for permissions when the feature is first used ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding)) | Save after every answer. An optional 5-step tour, replayable. One coach mark per screen. Push is asked only after the first save |

## 2. Final step list

The step IDs are the in-flight engine's (`features/onboarding/flow/steps.ts`). Progress and answers are saved
after every page through `PATCH /v1/profile/onboarding` with a local mirror (already built), so a closed tab
resumes on the same question. `PATCH /v1/me { onboardingStep }` keeps receiving the coarse chapter
(`legacyStepFor`).

**Order (changes to `STEP_ORDER`):** the resume comes **before** education. The resume answers education, stack
and roles, so asking for education first wastes a question on the most common path (P11). The `interests` page is
**folded into `types`** (three of its four cards duplicate opportunity types).

```
email → name → resume → found → education → stack → types → roles → location → stipend → work-auth → companies → packs → review → customising
(auto)   (auto)                     (auto if known)  (auto if ≥3)                    (conditional) (conditional)  (optional)
```

| # | Step id | Shown when | Prompt (final copy, in `font-serif` per DESIGN v2) | Input | Skip consequence (shown on the Skip button) |
|---|---|---|---|---|---|
| 0 | `/welcome` (consent) | once per consent version | **Before we start** · "Here's exactly what happens to your data." | 3 short facts + AI choice (3 radio cards, none preselected) + resume-to-AI checkbox for option 1 (§4) | — (required) |
| 1 | `email` | never in practice (known from Google or register) | "What's your email?" | email | — |
| 2 | `name` | name empty, or equal to the email's local part (`nameIsKnown`) | "What should we call you?" | text, prefilled | — |
| 3 | `resume` | no confirmed resume | "Let's start with your resume." · helper "We read it once to learn your skills, education and graduation year." | dropzone (drag, click, paste). Under it, always: "No resume handy? **Answer 3 quick questions instead**" → education | "Skip — fit scores will be rougher until you add one" |
| 3′ | (same page) | while parsing | "Reading your resume…" | staged determinate progress: Text ✓ → Education ✓ → Skills ✓ → Projects. The deterministic parse returns in ≤ 3 s, and AI enrichment never blocks | — |
| 4 | `found` | a resume was parsed | "Here's what we found, Aarav." · "Fix anything that looks off." | sections stream in (skeleton → content): Name & links · Education · Skills (chips with Learning / Working / Strong) · Projects · Experience. Everything is inline-editable. A missing essential shows inline ("Graduation year — we couldn't find it"). AI refinements show "Refined with AI · Undo" | — (needs grad year + ≥ 1 skill) |
| 5 | `education` | grad year or degree still unknown | "What are you studying, Aarav?" | degree cards (B.Tech/B.E. · B.Sc/BCA · M.Tech/M.S. · MCA/M.Sc · PhD · Diploma), branch combobox (CS family first), grad-year segmented (this year … +4). Then the reflection line (`gradYearLine`: "Class of 2027. Prime internship season is coming up.") | — (grad year required) |
| 6 | `stack` | fewer than 3 skills | "What do you build with?" | grouped chips: Languages · Frontend · Backend · Data & ML · Cloud & DevOps · Mobile · Tools, plus **Competitive programming**. Search adds more | — (≥ 1 skill) |
| 7 | `types` | always (prefilled) | "What are you looking for?" · "Pick all that apply." | 6 numbered cards: Internship · Full-time · Hackathon · Scholarship / Fellowship · Research · Open-source programs (hint "GSoC, LFX, Outreachy, MLH Fellowship"). Prefill: grad year ≥ next year → Internship + Hackathon, else Full-time + Internship. Writes `answers.interests` derived from the types (replaces the old `interests` page) | — (≥ 1) |
| 8 | `roles` | always (prefilled from skills) | "What kind of work do you want to do?" · "We picked these from your skills." | tech role families, up to 5: Backend · Frontend · Full-stack · Mobile · Data · ML / AI · DevOps / Cloud / SRE · Security · Systems / Embedded · Research · Product / UX for tech. A collapsed **Other (non-tech)** group | "Skip — we'll rank all tech roles equally" |
| 9 | `location` | always | "Where can you work?" | segmented Remote only · Remote or hybrid · Anywhere. Cities combobox (Indian metros first, "Anywhere in India", "Outside India"). Switch "Open to relocating" | "Skip — every location counts the same" |
| 10 | `stipend` | Internship or Full-time chosen | "What's the least you'd accept per month?" | slider ₹0–₹1,00,000 in ₹5k steps, labelled "No minimum" at 0. Switch "Also hide unpaid or unlisted" | "Skip — no minimum" |
| 11 | `work-auth` | location includes "Outside India" or global remote | "Where can you work without visa sponsorship?" | country chips, India preset | "Skip — we'll assume India only" |
| 12 | `companies` | always, optional | "Any dream companies?" · "We'll make sure they're watched." | logo grid (`POPULAR_COMPANIES`) + search over community sources (`GET /v1/sources/community?q=`). Each pick shows "Watched in ‹pack›" or "We'll add their careers page". **Effect:** preselects the packs that contain them, and creates the "Dream companies" saved view on Radar (`companies=` feed filter) | "Skip" (no consequence) |
| 13 | `packs` | always | "Where should Beacon look?" · "Packs are watched for everyone, so they're free and already full." | 7 pack cards with toggles, preselected from types, location and companies (USERFLOW §1.6 table). A secondary "**Missing a company?**" field takes a URL with live detection | — (≥ 1 pack or URL, else "Skip — choose later in Sources") |
| 14 | `review` | always | "Looks right?" · "You can change any of this later." | one line per answer, each with [Edit] (returns to review after editing): "Internships, hackathons, open source · Backend, Full-stack · Remote or hybrid · Bengaluru · ≥ ₹15k/mo · 4 packs, 245 sources · Dream: Razorpay, Stripe". Skipped items read "Not set · [Set now]" | — |
| 15 | `customising` | always | "Building your radar…" | real-state sequence (§5) | — |

**Typical paths.** Google plus resume: resume → found → types → roles → location → stipend → companies → packs
→ review = **9 counted pages** (`positionOf` excludes `customising`). Manual: resume (skip) → education → stack →
types → roles → location → stipend → companies → packs → review = 10. Hackathon-only students skip `stipend`.

**Rules**

- **Ask once.** Anything known (Google, register, resume, an earlier answer) is auto-skipped (`initialAuto`,
  `autoAfterResume`). Prefills show as selected, so `Enter` confirms them.
- **Tech-first options** everywhere (BRIEF Addendum). Non-tech sits behind a collapsed "Other". Examples speak to
  CS/engineering students (projects, GitHub, OAs, GSoC).
- **Live effect line** ("≈ 1,240 open fits so far", debounced 300 ms) on steps 7–13 **only when ≥ 20**. Below 20 it
  reads "Your packs are still filling in — this number will grow." (fixes audit A6: "≈ 2 open listings").
- **Skip is never a dead end.** It states its consequence, moves forward, and shows on review as "Not set".
- **Back** keeps answers (`previousStep` never lands on `customising`). Editing from review returns to review.
- **Return visits** land on `firstOpenStep`. The eyebrow reads "WELCOME BACK, AARAV".
- **Errors** stay inline and never wipe answers (USERFLOW §1.4 copy for scanned PDF, wrong type, upload failure).
- **No permission prompts here.** Push gets its soft ask after the first save (USERFLOW §2).

## 3. Page anatomy (every question page)

```
Desktop ≥ 1024                                                     Mobile
┌────────────────────────────────────────────────────────────────┐ ┌────────────────────────────────┐
│ ◉ Beacon                       You · What you want · Where to look │ │ ‹   ━━━━━━━━━━━──────   4 of 9 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────────────  4 of 9  │ │                                │
│                                                                │ │ NICE TO MEET YOU, AARAV        │
│               NICE TO MEET YOU, AARAV            (eyebrow)     │ │ What are you looking for?      │
│               What are you looking for?          (serif 40)    │ │ Pick all that apply.  Why? ▸   │
│               Pick all that apply.   Why we ask ▸              │ │ ┌────────────────────────────┐ │
│                                                                │ │ │ 1  Internship           ✓ │ │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │ │ └────────────────────────────┘ │
│      │ 1 Internship✓│ │ 2 Full-time  │ │ 3 Hackathon ✓│        │ │ ┌────────────────────────────┐ │
│      └──────────────┘ └──────────────┘ └──────────────┘        │ │ │ 2  Full-time               │ │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │ │ └────────────────────────────┘ │
│      │ 4 Scholarship│ │ 5 Research   │ │ 6 Open source│        │ │   …                            │
│      └──────────────┘ └──────────────┘ └──────────────┘        │ │ ≈ 1,240 open fits so far       │
│               ≈ 1,240 open fits so far                         │ ├────────────────────────────────┤
│  ‹ Back            Skip — we'll show every type   [Continue ↵] │ │ Skip            [  Continue  ] │
└────────────────────────────────────────────────────────────────┘ └────────────────────────────────┘
```

- **Column** max 640 px, centred. Top space about 18 vh on desktop, 32 px on mobile. **No two-column layouts** in
  question pages: `found` is the exception, with a single 720 px column of editable sections.
- **Eyebrow** (caption, uppercase): personal context ("NICE TO MEET YOU, AARAV", "ALMOST THERE", "WELCOME BACK").
- **Prompt**: one sentence ending in "?" (or a short statement on `resume`/`found`), at 40/44 desktop and 30/34
  mobile. Helper ≤ 12 words. **"Why we ask"** is a disclosure of 1–2 sentences, never a tooltip.
- **One input**, auto-focused once the enter transition settles (~200 ms). Option cards are numbered 1–9.
- **Footer** (sticky on mobile; on desktop inline under the content, never below the fold): ‹ Back (ghost) · Skip
  with its consequence · primary [Continue ↵]. Continue is never disabled without a reason line ("Pick at least one type").
- **Progress**: a 2 px bar plus "4 of 9" in mono, computed from the current sequence. The total animates when a step
  leaves or joins the path, never mid-interaction. Chapter labels show on desktop only.
- **Motion**: directional. Forward enters 24 px from the right with a fade, Back from the left (MOTION.md spring,
  ≤ 240 ms). The prompt lands first and the input 60 ms later. Reduced motion: 120 ms crossfade.
- **Keyboard**: `Enter` continues (not in multi-line fields). `1`–`9` toggles option N. Arrows move between options
  and `Space` toggles. `Alt ←` goes back. `Esc` does nothing. On the first question only, one hint line: "Tip: press
  1–6 to pick, Enter to continue."
- **Screen readers**: the prompt is the focused `h1` after each transition. Progress is announced politely ("Step 4
  of 9, What are you looking for?").

## 4. Consent page (`/welcome`)

The USERFLOW §1.2 content stays; the structure changes so it fits one screen.

```
┌──────────────────────────────────────────────┐
│ ◉                                            │
│ Before we start                              │
│ Here's exactly what happens to your data.    │
│                                              │
│ ✓ Your profile, resume and tracker are stored│
│   in Mumbai, encrypted at rest.     More ▸   │
│ ✓ We never sell data, show ads or share your │
│   profile with companies.                    │
│ ✓ Export or delete everything, any time.     │
│                                              │
│ How should Beacon use AI?                    │
│ ( ) Beacon's AI — Meta's Model API    More ▸ │
│     ☐ Send my resume text to Meta for this   │
│ ( ) My own API key — add it in Settings      │
│ ( ) No AI — matching still works             │
├──────────────────────────────────────────────┤
│ [ Continue ]   Sign out       Privacy · Terms│  sticky footer
└──────────────────────────────────────────────┘
```

- The sticky footer keeps **Continue always on screen** (fixes audit A7).
- Each fact is one line plus a "More" disclosure carrying the full USERFLOW text, so nothing is lost (P2).
- Nothing is preselected. When Continue is disabled, the reason shows beside it ("Choose how Beacon uses AI").

## 5. "Building your radar" (`customising`)

Driven by real state. It never fakes progress and never runs past about 8 s.

```
              ◉   the beam sweeps the ring once per completed stage
                  (reduced motion: static ring + ticks)
        Building your radar, Aarav
        ✓ Profile saved
        ✓ 4 packs · 245 sources already indexed
        ◌ Ranking listings for you…          poll GET /v1/feed/summary every 1 s
        → 142 fits ready                      count-up when warmingUp === false
```

- Stages: `onboardingCompleted` saved → packs confirmed → poll the summary until `warmingUp === false` or 8 s pass.
- On ready, hold 600 ms on "142 fits ready", then go to `/radar` (replace). The ring hands off to the Radar headline
  number (shared element, MOTION.md).
- At 8 s: "Taking a little longer — your radar will keep filling in." Continue anyway. The Radar's warming strip
  (USERFLOW §1.7) takes over.
- Screen readers get one polite announcement per stage.

## 6. Spotlight tour (first `/radar`)

**Offered, then guided.** When the radar is `ready` with ≥ 5 rows, no skeletons, and no sheet or banner open, a small
card appears bottom-left (desktop) or above the tab bar (mobile): "**Want a 30-second tour?** [Show me around]
[I'll explore]". Dismissing it counts as skipped. It never auto-offers again (Apple HIG), but stays in the user
menu, the Me page, the `?` sheet and ⌘K ("Show me around").

**Look.** The page dims under a scrim, and a rounded cut-out (radius 14, 8 px padding) shows the target, which
**stays interactive**. The card is max 320 px, anchored with an arrow that flips to stay on screen. It shows
"2 of 5", a bold title, ≤ 20 words of body, [Back] [Next →] and "Skip tour". **It must look different from product
UI** (NN/g): the visual-system agent supplies a tour surface (e.g. `e3` glass with a distinct accent edge). The
cut-out springs between targets (≤ 300 ms). Reduced motion: an instant jump.

| # | Target | Title · body (final copy) | Advances on |
|---|---|---|---|
| 1 | Headline + lens chips | **What changed, at a glance.** "This line tells you what's new since your last visit. Tap a chip to jump straight there." | Next |
| 2 | First row's fit ring | **Your fit, 0–100.** "80+ is a Strong fit. Open any listing to see exactly why it scored that way." | Next |
| 3 | First row's Save action | **Keep the good ones.** "Press S or tap Save. It goes straight to your Tracker." | **the real save** (or Next). After saving: "Saved — it's in your Tracker now." |
| 4 | Filter rail (mobile: the Filters button) | **Tune what reaches you.** "These filters are for right now. Your long-term preferences live in Profile." | Next |
| 5 | Nav (Deadlines, Tracker) + search | **Everything is one key away.** "Deadlines and your Tracker live here. Press ⌘K to search or do anything." | Done |

Mobile (4 steps): headline → ring → "Swipe right to save, left to hide" on the first row (interactive) → tab bar.

**Keyboard:** `→`/`Enter` next, `←` back, `Esc` skip. Focus moves into the card each step and back to the target
after Done. **Rules:** it pauses on route change, and "Resume tour" stays in `?`. It never runs with the offline or
error banner up. It never shows twice: stored per user server-side (UX-RESTRUCTURE §6, ask A2; fallback
`localStorage['beacon:ui:<userId>']`).

## 7. Coach marks (pull revelations, first visit per screen)

One mark per screen. It shows about 1 s after content renders on the first visit (never over skeletons): a pulse dot
on one element plus a one-line card with "Got it". It is dismissed by any interaction with its target and stored per
user. At most one per page view, and none in the same session as the tour.

| Screen | Anchor | Copy |
|---|---|---|
| ListingPage | "How we scored this" | "Every point is shown here. Disagree? Adjust the weights." |
| Deadlines | Agenda / Calendar switch | "Prefer a calendar? Switch views here." |
| Tracker | first card | "Drag between stages, or press M to move." |
| TrackerItemPage | Next step card | "Beacon tells you when to follow up — and when to move on." |
| Sources | the Add a source field | "Paste any careers page. We'll find the cheapest way to watch it." |
| Alerts | New alert | "Write an alert like a sentence. We'll show how often it would have fired." |
| Profile | first skill's level bars | "Set Learning, Working or Strong — it changes your fit." |

## 8. Measures (for the viva and for tuning)

Timestamps only, with no third-party analytics: per-step answered/skipped (already in `answers`), `completedAt`,
`tour.completedAt | dismissedAt`, `firstSaveAt`. Targets: median completion under 150 s, at least 90% of starters
reach `/radar`, and at least 60% save a listing in the first session.
