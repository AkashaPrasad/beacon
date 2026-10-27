# Beacon — User flows

Companion to `docs/DESIGN.md` (components, copy voice, layouts). Strings in quotes are final copy. Bracketed
`[Labels]` are buttons. The alert channels are **web push and in-app only** (BRIEF #1).

**Flow principles**

1. Ask only for what changes the ranking, explain why each question is asked, and prefill everything we can parse.
2. Only sign-in and the consent choice are mandatory. Every onboarding step can be skipped, and every answer can be edited later.
3. Progress is saved after every step (`onboarding.step` on the user), so closing the tab resumes at the same step.
4. The radar is never empty: shared packs are already indexed, so useful rows show up within seconds, and personal work streams in later.
5. Permission prompts (notifications) come only after the user has done something that makes them useful.
6. Time budget for the first run: **under 3 minutes** from landing to a ranked radar (SPEC §3.1 A).

---

## 1. First run

```
Landing ──[Continue with Google]──▶ Google OAuth ──▶ Consent (1 screen) ──▶ 1 Resume ──▶ 2 Preferences ──▶ 3 Sources
                                         │ returning user                       (skip)        (skip)            (skip)
                                         └──────────────────────────────────────────────────────────────▶ Radar (warming up) ──▶ Tour (4 steps)
```

### 1.1 Landing → sign-in

- The landing hero has one sentence and one button: [Continue with Google] (DESIGN §6.3). Signed-in visitors are redirected to `/radar`.
- Sign-in uses Google OAuth with a redirect flow (no popup), returning to `/auth/callback`, which sets the httpOnly JWT cookie. A `returnTo` value
  survives the round trip, for example for a shared listing link.
- States:
  - In progress: the button shows a spinner and the text "Opening Google…".
  - Cancelled: "Sign-in was cancelled. [Try again]".
  - Error: "Google sign-in didn't complete. Try again, or use a different browser if it keeps failing. [Try again]".
  - Returning account: skip to §2 (or back into onboarding at the saved step).

### 1.2 Consent: one screen, honest

This screen is shown once, and again whenever the consent text version changes. Layout: `prose-max` column, title in `display`, body in `body-lg`.

> **Before we start**
>
> Beacon reads your resume and preferences to rank opportunities for you. Here is exactly what happens to them.
>
> - **What we store:** your Google name, email and photo, your resume file and the profile we parse from it, your
>   preferences, saved listings and tracker. It is stored in MongoDB Atlas (Mumbai region), and files are encrypted at rest.
> - **What we never do:** sell your data, show ads, or share your profile with companies.
> - **You stay in control:** export everything as JSON or delete your account at any time from Settings.
>
> **How should Beacon use AI?** You can change this later in Settings.
>
> ( ) **Use Beacon's AI.** Your resume text and the listings you open are sent to Meta's Model API to
>     extract skills, explain fits and suggest tailoring tips. *Meta's free contributor tier may use prompts to
>     improve its models.*
>     ☐ I agree that my resume text is sent to Meta for this. *(required for this option)*
>
> ( ) **Use my own API key.** Any OpenAI-compatible provider. You'll add the key in Settings. Until then,
>     Beacon runs without AI.
>
> ( ) **Don't use AI.** Matching uses embeddings and rules only, so everything except tailoring tips still works.
>
> [Continue]  · [Sign out]   [Privacy](/privacy) · [Terms](/terms)

Rules:

- **Nothing is pre-selected.** [Continue] is disabled until a choice is made, and until the checkbox is ticked for option 1.
- The AI-off copy must match the deployment. If `EMBEDDING_PROVIDER` is an external API, add "Embeddings are computed by
  ‹provider›" to options 2 and 3, and never claim "nothing leaves our server" unless that is true.
- Store `{consentVersion, aiMode, resumeToAi: boolean, at}` on the user. The Privacy settings page shows the same choice.
- Keyboard: radios are reachable with arrows and `Enter` continues. Screen readers get the bullet list as a list.

### 1.3 Onboarding frame

- `StepHeader`: "1 Resume · 2 Preferences · 3 Sources" with a 2 px `accent-strong` progress line, [Back] and [Skip for now] (ghost),
  and the primary [Continue]. `Enter` continues when focus is not in a multi-line field, and `Esc` does nothing (to prevent accidental exits).
- The step title is in `display` (Instrument Serif) with a one-line "why" in `body-lg fg-secondary`.
- Desktop uses two columns (inputs on the left, live preview on the right). Mobile uses one column with a sticky bottom action bar.

### 1.4 Step 1 — Resume

**Title:** "Start with your resume" · **Why:** "We read it once to learn your skills, education and graduation year. You can
edit everything."

| Element | Behaviour |
|---|---|
| Drop zone | PDF or DOCX up to 5 MB. Drag, click or paste. Text: "Drop your resume, or [choose a file]" · "PDF or DOCX, up to 5 MB" |
| Upload | Shows a progress bar on the file chip, then "Reading your resume…" |
| Parsed preview (right column) | Sections stream in as each is ready: **Name & links → Education (degree, institution, grad year) → Skills (chips) → Experience → Projects**. Each section renders as a skeleton first, then as the parsed content. Every field is inline-editable, and skills chips can be removed or added (taxonomy combobox) |
| Deterministic first | The rules parser (unpdf/mammoth → sections → taxonomy) returns in ≤ 3 s. That result alone is enough to continue |
| AI enrichment (only if consented) | Arrives later. Changed fields get an `accent-subtle` highlight and the caption "Refined with AI · [Undo]". It never blocks [Continue] |
| Missing essentials | If no grad year is found, the Education section shows an inline required field: "Graduation year — we couldn't find it" |
| Manual fallback | The "Fill it in manually instead" link is always visible under the drop zone |

Manual fallback form (also used when parsing fails), in this order: **Graduation year** (required) · **Degree and
field** (optional) · **Institution** (optional, combobox) · **Skills** (≥ 3 suggested; combobox with taxonomy suggestions) ·
**Links**: GitHub, LinkedIn, portfolio (optional) · **Experience**: "Have you done an internship before?" Yes/No (optional).
The name and email are prefilled from Google and not asked again.

Errors:

- Scanned or image-only PDF: "This PDF looks like an image, so we couldn't read its text. Fill in the essentials instead — it
  takes about a minute. [Fill in manually]". Offer "[Try a DOCX]" too.
- Wrong type or too large: "That file is a ‹type›/‹size›. Beacon reads PDF or DOCX up to 5 MB."
- Upload failure: "Upload didn't finish. Check your connection and [try again]." The file chip remains, with Retry.

**Continue** requires the graduation year plus at least one skill (from the parse or entered manually). **Skip for now** goes to step 2. The radar then
ranks by preferences only, and shows a persistent strip: "Add your resume to get fit scores that mean something. [Add resume]".

### 1.5 Step 2 — Preferences

**Title:** "What are you looking for?" · **Why:** "These decide what reaches your radar. Nothing here is permanent."

The questions are asked in this order, with prefills from step 1. A live counter in the footer, "≈ 1,240 open listings match so far" (shared
index, debounced 300 ms), shows the effect of each answer.

| # | Question | Control | Required | Prefill / default |
|---|---|---|---|---|
| 1 | **Opportunity types** — "Pick all that apply" | Toggle cards with icons: Internship · Full-time · Hackathon · Scholarship / Fellowship · Research · Open-source programs | at least 1 | Grad year ≥ next year: Internship + Hackathon. Otherwise Full-time + Internship |
| 2 | **Roles** — "Which kinds of work?" | Combobox chips (Backend, Frontend, Full-stack, Data, ML / AI, Mobile, DevOps / SRE, Security, Design, Product, Research, Other…) | optional | Suggested from parsed skills; up to 5 |
| 3 | **Where** — "Where can you work?" | Segmented: Remote only · Remote or hybrid · Any. Cities combobox (Indian metros first, "Anywhere in India", "Outside India"). Switch: "Open to relocating" | optional | Any · none · off |
| 4 | **Graduation year and degree** | Year select + degree level (UG / PG / PhD / Other) | year required (prefilled) | From resume |
| 5 | **Stipend floor** — "Hide paid listings below…" | Slider ₹0–₹1,00,000/mo in ₹5k steps, labelled "No minimum" at 0. Switch: "Also hide unpaid or unspecified" | optional | No minimum · off |
| 6 | **Work authorisation** — "Where can you work without sponsorship?" | Country chips | optional | India |
| — | More (collapsed): Languages · Experience band | Chips | optional | From resume |

Hard constraints from these answers act as filters or caps, and are shown as such (SPEC §4). They are never applied silently.
**Skip for now** keeps the defaults shown.

### 1.6 Step 3 — Sources

**Title:** "Where should Beacon look?" · **Why:** "Packs are curated, shared lists that are already being watched. Add any careers
page on top."

- Pack list (from `seed/source-packs.json`). Each row has a switch, the name, the source count in mono and five favicons:

  | Pack | Sources | Pre-selected when |
  |---|---|---|
  | Top Indian product companies | 48 | Internship or Full-time |
  | FAANG+ and global tech hiring in India | 106 | Internship or Full-time |
  | YC / early-stage startups hiring interns | 66 | Internship |
  | Hackathons — India & global | 25 | Hackathon |
  | Scholarships & fellowships for engineering students | 31 | Scholarship / Fellowship |
  | Remote-friendly startups | 45 | "Remote only" or "Remote or hybrid" |
  | Open-source programs & mentorships | 17 | Open-source programs (or Research) |

- **Add your own URL** (optional, repeatable): an input with live detection (debounced 400 ms), using the same component as the Sources modal.
  - Detecting: "Detecting…"
  - Success: "Detected: Greenhouse board `stripe` → 142 jobs" with [Add]
  - Crawl fallback: "No job board API here. We'll read the page instead (uses crawl credits). [Add anyway]"
  - Failure: copy #10 from DESIGN §8
- Footnote in `caption fg-tertiary`: "Packs are refreshed for everyone, so they don't use your crawl budget."
- Primary button: **[Start my radar]**. With no pack on and no URL added: "Turn on at least one pack or add a URL, or
  [skip] and choose later in Sources."

### 1.7 First radar — "warming up", then a tour

The radar opens immediately. Shared packs are already indexed, so only the profile embedding, the matching and any personal sources are
pending. State machine and exact UI:

| State | Trigger | UI |
|---|---|---|
| `reading` | profile embedding job queued | 8 skeleton rows. Strip: "Reading your profile…" |
| `ranking` | embedding done, match jobs running per pack | Strip: "**Your radar is warming up.** Ranking 4 of 7 packs · checking 1 of your sources" with a determinate 2 px progress bar. Rows stream in at their rank (DESIGN §5, live-arriving rows). [Show progress] opens a mono checklist |
| `ready` | all match jobs done (personal sources may still be crawling) | The strip becomes "Radar ready: **142** fits. Personal sources keep updating in the background." and auto-hides after 8 s. The tour starts (below) |
| `ready-empty` | done, 0 rows above the threshold | Empty state: "**Nothing above 60 yet.** 38 listings score 40–59. [Lower to 40] [Add more packs]" |
| `ready-none` | done, 0 rows at all (types too narrow) | Empty state: "**No open listings match your types and location yet.** [Edit preferences] [Add a source]" |
| `source-failed` | a personal source fails | A checklist row: "Acme careers: couldn't read the page (403). [Fix in Sources]". It never blocks, and appears once as an in-app notification |
| `slow` | `ranking` lasts more than 30 s | Strip adds: "Taking longer than usual. You can keep browsing; rows will keep arriving." |

Checklist ([Show progress]), with lucide icons, no emoji, and `mono-sm` throughout:

```
✓ Top Indian product companies      48 sources · 412 listings ranked
✓ Hackathons — India & global       25 sources ·  61 listings ranked
◌ YC / early-stage startups         ranking…
◌ acme.dev/careers                  crawling page 3 of ~8
```

Screen readers get a polite announcement at most every 5 completed items, plus "Radar ready: 142 fits." Rows arriving in the
background are not announced individually.

**Coach-mark tour.** It starts when the radar is `ready` and at least 5 rows are visible. It never starts while skeletons are showing.
There are 4 steps, each a popover with "N of 4", [Next] (`→`), [Back] (`←`) and [Skip tour] (`Esc`). The target gets a 2 px `accent-strong`
outline, and there is no dark overlay, so the UI stays usable. Clicking anywhere else pauses the tour, and "Resume tour" stays in the `?` menu.

| # | Anchor | Copy |
|---|---|---|
| 1 | Score ring of the first row | "**This is your fit, 0–100.** Press `Enter` on any row to see exactly why." |
| 2 | The first row's action cluster | "**Triage from the keyboard.** `J` `K` move · `S` save · `H` hide · `A` add to tracker." |
| 3 | Fit-threshold slider and filter rail | "**Tune what reaches you.** Fit ≥ 60 hides long shots. Filters and saved views live here." |
| 4 | Search field / palette hint | "**Press `⌘K` for everything.** Search listings, jump anywhere, run any action." [Done] |

Mobile tour (3 steps): ring → "Swipe right to save, left to hide" (on the first row) → tab bar ("Deadlines and your tracker
live here"). Store `tour: {completedAt | dismissedAt, step}` on the user server-side, so it never shows twice across
devices.

---

## 2. Notification permission (web push)

**It is never requested on first load, during onboarding, or before the user has acted.** The browser prompt only ever opens
from a click on our own button (a user gesture), after a soft ask.

| Trigger | Soft ask | On [Turn on] | On [Not now] |
|---|---|---|---|
| **First save** (`s`, swipe, or button) | After the "Saved" toast, an inline card appears under the toolbar, once: copy #17 "Get a push notification when a Strong fit opens? You can change this any time." [Turn on] [Not now] | `Notification.requestPermission()`. If granted: subscribe (VAPID), create the default rule "Fit ≥ 80, any type → Push, instantly", and toast "Push is on. Edit what triggers it in Alerts." | The card hides. Don't ask again for 14 days or until a push rule is created |
| **First alert rule with Push** | Inside the rule builder, the Push token shows "Needs permission · [Allow notifications]" | Same request, scoped to this rule | The rule is saved with In-app only. Caption: "Push is off for this rule." |
| Permission previously **denied** | Never ask again in-product | — | Settings > Notifications shows "Notifications are blocked in this browser. [How to unblock]" (per-browser help popover) |
| **iOS Safari, not installed** | Replace the ask with "To get notifications on iPhone, add Beacon to your Home Screen (Share → Add to Home Screen)." | — | — |

Settings > Notifications has [Send a test notification]. Quiet hours queue pushes until they end, and deadline reminders
inside quiet hours are moved to the end of the quiet period.

---

## 3. Daily use (returning user)

### 3.1 Arrival

- `/` with a valid session redirects to `/radar`, restoring the last view (List / Timeline / Board), saved filters and density. Scroll
  starts at the top.
- **Since-last-visit strip** (DESIGN §6.2), shown when `N > 0 || M > 0`:
  "Since Tue 22 Oct: **9** new fits · **3** deadlines this week. [Show new] ×"
  - N = listings first seen after `lastSeenAt` with fit ≥ the user's threshold, excluding hidden ones.
  - M = saved, tracked or ≥-threshold listings with a deadline in the next 7 days.
  - `lastSeenAt` updates when the tab is hidden or the session ends, after at least 20 s of activity.
  - [Show new] applies a temporary "New since Tue" filter chip, and `×` dismisses the strip until the next visit.
  - After 14 or more days away: "Welcome back. In 3 weeks: **46** new fits, **9** saved listings closed. [Show new] [Archive closed]".
- Unread in-app notifications show as a count on the bell. Nothing pops up on arrival.

### 3.2 Triage loop (the core habit, about 2 minutes)

1. `j`/`k` through the feed. The drawer follows the cursor when it is open (`Enter` or `]`).
2. `s` save · `h` hide (undo toast) · `a` add to tracker as **Saved**.
3. Open interesting rows and read the fit breakdown, gaps and tips.
4. `⌘Enter` or [Apply ↗] opens the apply link in a new tab. **When the user comes back** (`visibilitychange` to visible within
   2 h), the drawer shows an inline prompt (not a modal): "Did you apply to Platform Engineering Intern? [Yes, mark Applied]
   [Not yet]". Yes moves the item to **Applied** with today's date (undo toast), and starts the nudge clock (§4).
5. Hidden listings are kept for 90 days in "Hidden" (palette → "Show hidden") so a mis-hide can be undone later.

### 3.3 Deadlines

- Reminders at 7d / 3d / 1d (each switchable) for saved and tracked items. They go to push (if on) and in-app, using copy #21.
- The Deadlines view defaults to the next 4 weeks. `t` jumps to today. Dragging a pill to the dock (or pressing `a`) tracks it.
- Rolling or unknown deadlines appear in a "No fixed deadline" group at the end of the list view. They are never placed on the grid.

### 3.4 Alerts

- Rules are evaluated when new listings are scored. A match sends a push (if the rule has Push and permission is granted) plus an in-app item.
- At most 1 push per listing. Pushes per day are capped at 10, and the overflow goes in-app with "and 4 more in Beacon".
- The digest (Settings > digest time) is an in-app card at the chosen time ("Today: 6 new Strong fits · 2 deadlines tomorrow"),
  plus one optional push summary. There is no email (BRIEF #1).

---

## 4. Tracker nudges and the "move on" flow

### 4.1 Timers

| Stage | Clock starts | Nudge | Escalation |
|---|---|---|---|
| Applied | applied date | **+10 days**, no status change and no "reply" logged → follow-up nudge | **+30 days** → ghosted nudge |
| OA / Test | stage entered | OA deadline (if set) −1 day → reminder | none |
| Interview | last interview date | +7 days → "Any news from ‹company›?" | +21 days → ghosted nudge |
| Offer | — | Offer deadline (if set) −3 days / −1 day | none |

Delivery: in-app notification, a `BellDot` (warning) on the card, and a push only if the user enabled "Tracker nudges" in
Notifications (off by default). At most 1 nudge push per day, and the rest stay in-app.

### 4.2 Follow-up nudge (+10 days)

"No reply from Northwind Labs in 10 days. A short follow-up often gets one." [Copy template] [I followed up] [Snooze 3
days] [Got a reply]

- **[Copy template]** opens the card drawer at an editable template prefilled with the role, company, applied date and one line
  from the profile:
  "Subject: Following up on my application — Platform Engineering Intern · Hi ‹name/team›, I applied for the
  Platform Engineering Intern role on 14 Oct and wanted to check on its status. I'm still very interested, especially in
  ‹one line from the JD›. Happy to share anything else that helps. Thanks, ‹name›". The user copies it to the clipboard
  (toast "Copied") and sends it themselves. **Beacon never sends email.**
- **[I followed up]** logs the event on the card timeline and re-checks in 7 days.
- **[Snooze 3 days]** postpones the nudge. **[Got a reply]** opens the status picker (OA / Interview / Rejected / Offer).

### 4.3 Ghosted nudge (+30 days) and "move on"

"30 days without a reply. Most roles that go quiet this long don't come back." [Move to Ghosted] [Keep waiting]

1. **[Move to Ghosted]**, or dragging to Closed → Ghosted, moves the card. The column count updates, and the toast reads "Moved to Ghosted. [Undo]".
2. An optional one-tap reflection appears inline in the drawer (skippable, never a modal): "What happened?" with the chips
   *No reply · Rejected after OA · Rejected after interview · Withdrew · Role closed*. This feeds the analytics (response rate
   per source, median reply time), so the student learns where applying pays off.
3. **Move on**: directly below, "Still open and similar: 3" shows `RadarRow`s with high fit at other companies, each with
   [Save] and [Track]. A secondary link offers "Hide new listings from Northwind Labs for 90 days" (only after Ghosted, never after Rejected).
4. **[Keep waiting]** snoozes for 14 days, after which it asks once more and then stops asking.
5. If a reply arrives later, dragging the card back (or `m` → Interview) restores it. The analytics recount, and the ghosted event
   stays in the card history.

Rejected follows the same flow minus the ghosted nudge. The toast reads "Moved to Rejected. [Undo]", followed by the same reflection and "Still open and similar".
There is no celebratory or consoling animation for any outcome.

---

## 5. Other flows

### 5.1 Add a source (Sources page)

[+ Add source] opens a dialog (a full-screen sheet on mobile). The user pastes a URL, detection runs (§1.6 copy), and the dialog shows the type, interval
and preview. [Add source] adds it, the row appears at the top with "Checking…", and it becomes healthy, slow or failing within a minute.
A failing row expands to show the reason and the fix ([Retry now] / [Edit URL]). When the daily credit cap is hit: copy #18. Shared
packs keep updating.

### 5.2 Bring your own key (Settings > AI & keys)

The user picks a provider preset or "Custom (OpenAI-compatible)", then enters the base URL, model and key, then clicks [Test key].
- Success: "✓ Works · 214 ms" and [Save key]. The key is stored encrypted, shown masked (`sk-…3f9a`), with [Replace] and [Remove].
- 401: "The provider rejected this key."
- 404 model: "This provider has no model called ‹x›."
- Timeout: "No response within 15 s. Check the base URL."

Removing the key falls back to the consent choice from §1.2.

### 5.3 Export and delete (Settings > Privacy & data)

- **Export:** [Export my data] → "Preparing your export…" → the file downloads (`beacon-export-YYYY-MM-DD.json`), with the toast "Export
  downloaded".
- **Delete:** [Delete account] opens an Alert Dialog with copy #23 and a field to type DELETE. Then come sign-out, the landing page and the toast "Your account and data
  were deleted."

### 5.4 Offline and errors

- Offline: a top strip with copy #22. Actions are queued optimistically with a pending dot, and replayed in order on reconnect.
- A list error keeps the cached rows visible with a strip: "Couldn't refresh. Showing results from 10:42. [Retry]".
- A full error with no cache: copy #5 with [Retry]. Errors never show raw stack traces. A "Copy error details" link copies the request id.

---

## 6. Exact empty states

| Screen / state | Title | Body | Primary / secondary |
|---|---|---|---|
| Radar · warming up | Your radar is warming up. | Checking 18 sources — new fits appear here as each one finishes. | [Show progress] |
| Radar · nothing above threshold | Nothing above 80 right now. | 14 listings score 60–79. | [Lower to 60] |
| Radar · filters too narrow | No listings match these filters. | Remote + ₹50k floor + 2026 grads is narrow. | [Clear stipend floor] · [Reset filters] |
| Radar · no resume | (strip, not empty) | Add your resume to get fit scores that mean something. | [Add resume] |
| Radar · all triaged | You're through today's radar. | 0 new fits since your last visit. New listings usually land in the morning. | [Show hidden] · [Lower threshold] |
| Search · no results | No listings match “‹query›”. | Try fewer words, or search all types. | [Search all types] |
| Deadlines · empty | No deadlines in the next 4 weeks | for these filters. | [Show all types] · [Show 8 weeks] |
| Tracker · empty | Nothing tracked yet. | Press `A` on any listing, or drag one here from Deadlines. | [Go to Radar] |
| Tracker · column empty | (inline, `caption fg-tertiary`) | "Nothing in Interview yet." | — |
| Tracker · analytics, < 3 applications | (header shows "—") | Response rate appears after 3 applications. | — |
| Sources · no personal sources | Your packs cover 338 sources. | Add a careers page to watch one more company. | [Add source] |
| Sources · all packs off | No sources are on. | Your radar has nothing to watch. | [Turn on recommended packs] |
| Alerts · no rules | No alert rules. | Start with one: notify me when a Strong fit internship opens. | [Create this rule] · [Build my own] |
| Notifications · empty | All caught up. | Deadline reminders and nudges will show up here. | — |
| Profile · no projects | No projects yet. | Projects are the strongest signal for internships. Add one or two. | [Add project] |
| Drawer · similar opportunities empty | (section hidden) | — | — |
| Hidden · empty | Nothing hidden. | Listings you hide stay here for 90 days. | — |

All empty states use shadcn Empty with a 20 px lucide icon in a 40 px `surface-sunken` tile, the title in `h3` (full-page ones in
`display`), the body in `body fg-secondary` (≤ 20 words), and at most one primary and one secondary action.

---

## 7. What we ask, when (summary)

| When | We ask | Required | Skippable | Where to change it later |
|---|---|---|---|---|
| Landing | Google sign-in | yes | no | — |
| Before onboarding | AI and data choice (+ resume-to-AI consent if AI is chosen) | yes | no | Settings > Privacy, AI & keys |
| Step 1 | Resume (or manual: grad year + skills) | grad year + 1 skill to continue | yes | Profile |
| Step 2 | Types → roles → where → grad year → stipend floor → work authorisation | types (prefilled) | yes | Profile > Preferences; filter rail |
| Step 3 | Packs + own URLs | no | yes | Sources |
| First radar ready | Tour (4 steps) | no | yes (`Esc`) | `?` menu → Resume tour |
| After first save, or first push rule | Push permission (soft ask → browser prompt) | no | yes | Settings > Notifications |
| After apply-link return | "Did you apply?" | no | yes | Tracker |
| On ghosted / rejected | "What happened?" | no | yes | Card history |
