# UX restructure: authoritative spec (v2, research-based)

Status: **authoritative** from 2026-10-27 (night). It replaces the v1 draft. Companions:
`docs/UX-RESEARCH.md` (evidence, audit, principles P1–P15) · `docs/ONBOARDING.md` (step list, tour, coach marks) ·
`docs/DESIGN.md` v2 + `docs/DESIGN-MIGRATION.md` (colour, depth, motion tokens, owned by the visual-system agent).
**This document owns structure, information architecture, hierarchy, flows and copy. It never sets colours.** Where
it says "accent", "e2" or "glass", use the DESIGN v2 token or utility of that name.

Owner, verbatim: *"the dashboard looks too professional and too cluttered… restructure the whole thing so it is very
user friendly and not an overload, while all info is still present. If I click on an internship why does it open in
a small sidebar? I want it to open as a full page and then go back. Everything must be seamless and professional;
onboarding like the best products; loading animations everywhere; tech students only."* After the first declutter
pass: *"the UI is too, too basic now."*

**Binding owner constraints**

1. A listing opens as a **full page**, with **Back** to the list.
2. **Keep the Radar's left filter rail.**
3. **Rich, not basic**: depth, colour, motion.
4. **Uncluttered yet complete**: no overload, and all information still present.
5. **Tech students only.**
6. **Conversational onboarding** like the best products, plus a **spotlight tour**.
7. **Seamless loading**: loading animations everywhere, never a blank screen.

**Owners.** Each screen section ends with a checklist addressed to one agent. Don't report a screen done until every
box is ticked and before/after screenshots (desktop 1440 + iPhone 390, light + dark) are in `docs/ux-audit/after/`.

| Tag | Agent | Screens |
|---|---|---|
| **[SHL]** | shell / login / welcome / admin | §2.1 Shell + Me page, §2.15 Admin, §2.16 Login + Welcome, tour engine (§3) |
| **[RAD]** | radar / listing / deadlines | §2.2 Radar, §2.3 ListingPage, §2.4 Deadlines |
| **[SAT]** | sources / alerts / tracker | §2.5–2.7 Sources, SourcePage, PackPage · §2.8–2.9 Alerts, AlertEditorPage · §2.10–2.11 Tracker, TrackerItemPage |
| **[ONB]** | onboarding / profile / settings / notifications | §3 Onboarding, §2.12 Profile, §2.13 Settings, §2.14 Notifications |

---

## 0. Decisions (with evidence)

`P#` = principle in UX-RESEARCH §5, `A#` = audit finding in UX-RESEARCH §4.

| # | Decision | Why (evidence) | Rejected |
|---|---|---|---|
| D1 | **Detail is a full-page route** (`/radar/:id`, `/tracker/:id`, `/sources/:id`, `/sources/packs/:id`, `/alerts/new`, `/alerts/:id`). The list query stays cached. **Back restores scroll, selection and focus** within 30 min, then resets to the top | Owner constraint 1. Stripe's list → detail route with breadcrumbs. NN/g: pogo-sticking cost, so save the position for 30–60 min (P4, P5) | Side drawer (owner rejected it; it crowds 1280 px). Split view (needs ≥ 1440 px to breathe; built for email-style rapid switching, which prev/next covers). Modal (Apple: modality only for brief tasks) |
| D2 | **Triage without going back:** the detail header has prev/next ("3 of 142") over the originating list, plus `j`/`k`. Hide on the detail page auto-advances to the next listing with undo | Keeps the speed a split view would give (Linear's keyboard flow, Gmail's archive-advance). P5 | Making users press Back between every listing |
| D3 | **Save = Tracker › Saved.** One verb. Saving a listing creates or keeps its tracker item at *Saved*. "Add to tracker" disappears as a separate action. `a` now means **Mark applied** | Simplify, Huntr (Wishlist) and Teal all treat saving as the first tracker stage. A10: three names for one intent (P8) | Keeping Save and Track as separate concepts |
| D4 | **Filter rail** (kept, owner constraint 2): Views on top, **5 facets expanded** (Fit, Type, Deadline, Where, Stipend) and **5 collapsed** with value summaries (Grad year, Company, Source, Freshness, Show). Reset per facet and Reset all. Counts only when true. A link to Preferences | Internshala, LinkedIn and Handshake converge on type, location/remote, stipend and date as the top student facets. NN/g: ≤ 2 levels, collapsed headings must describe what's inside. Baymard: counts and applied overview (P2, P6) | All 9 facets expanded (clutter). A top-bar chip row instead of the rail (owner wants the rail) |
| D5 | **Fit moves into the rail** as band presets (Strong 80+ · Good 60+ · Worth a look 40+ · Everything), with "Custom" revealing the slider. **No "Tune" popover, no top-bar slot.** Sort and View sit in the list toolbar | One home per control (P3). Fit is the main lens, so it must be visible, not two clicks deep. Linear puts filters and display options in the view header | v1's Tune popover (hides the most important control). Slider and preset both visible (two paths) |
| D6 | **Row = 5 elements + 1 state marker**: logo (with type cue) · title · meta line ending in **one signal** · deadline chip · fit ring with band. **Hover reveals ≤ 3 actions in a reserved slot** that never covers data. Touch: `⋯` plus swipe | Wellfound's one meta line. Linear: "not every element should carry equal visual weight". WCAG visible-controls: hover is never the only path (P8, P9) | Internshala-style 11-field cards. Gmail-style hover that replaces the date (deadline is decision data) |
| D7 | **Fit in words first:** row = ring + band + top reason. Detail = verdict sentence → What matches / What's missing checklist → "How we scored this" bars (collapsed) → tips. Ghost risk (medium/high) or hard-fail **takes the signal slot** instead of the reason | LinkedIn "How you match" (checklist, high/medium/low). Jobright's "Potential Gaps". Honest-states principle (P7) | Number only. Bars first (they explain the maths, not the decision) |
| D8 | **Headline header, not a "Today band":** the page H1 *is* the sentence ("12 new fits since yesterday") with ≤ 3 lens chips. Not sticky, not dismissible, no extra band | P1 (answer first). Baymard: promoted filters raise use, and lens chips are promoted filters, also present in the rail. One block instead of strip + band + header | A separate dismissible band above a page title (two headers, costs about 120 px every visit) |
| D9 | **Deadlines is agenda-first** (Today · Tomorrow · This week · Next week · Later · No fixed deadline) **under a 14-day density strip**. The 4-week calendar grid is one click away ([Agenda \| Calendar], remembered) | Things 3 "Upcoming" and calendar Schedule views: "what's next?" is a sort problem. The grid truncates (3 pills + "+N"). The strip keeps SPEC's deadline-first timeline feel (P1) | Calendar grid by default |
| D10 | **Tracker columns:** Saved · Applied · OA / Test · Interview · Offer, then a collapsed **Closed** column (Rejected · Ghosted). Mobile: stage tabs plus one list, with the first card in the top 40% of the screen | Huntr's 5 defaults. Online assessments are a real stage in Indian tech hiring. A4: Offer was hidden under "More", and the mobile chrome took 43% of the screen | v1's 4 + "More" (hid OA and Offer). All 7 open (wide, and dwells on bad outcomes) |
| D11 | **Mobile: 4 tabs — Radar · Deadlines · Tracker · Me.** **Me is a page** (`/me`), not a sheet. Detail pages **swap the tab bar for an action bar** (Apply · Save · ⋯) and show Back on top | Apple HIG: tabs are navigation, not actions. NN/g: keep frequent destinations visible, and hiding rarely used ones costs little. LinkedIn and Indeed pin Apply on mobile detail (P15) | 5 tabs with Alerts. Me as a sheet (A11). Tab bar + action bar stacked (120 px of chrome) |
| D12 | **Desktop keeps top-bar navigation** (Radar · Deadlines · Tracker │ Sources · Alerts), so **the left column belongs to the Radar rail alone** | Two left columns (nav + rail) is the heaviest layout. Vercel and Linear use a sidebar because they have no filter rail. Owner constraint 2 | A left nav sidebar |
| D13 | **Sources:** keep the tabs (`/sources`, `/sources/packs`), but **"Your sources" lists only the student's own sources** (6, not 251). Pack sources live on PackPage. Search spans both ("Is Stripe already watched?") | A3: 245 pack rows buried the 6 that need care. Pack sources are managed per pack, not per row | One page with sections (the 7-card pack grid makes it long). The 251-row mixed table |
| D14 | **One home per setting:** AI mode/provider/key → Settings › AI & keys. Resume-to-AI consent → Settings › Privacy. Deadline reminders and follow-up nudges (on/off, days) → Alerts › Built-in. Delivery (push device, quiet hours, digest, time zone, nudge pushes) → Settings › Notifications. **Fit weights → Profile › How Beacon weighs a fit.** Every other mention is a one-line summary plus a link | NN/g: avoid multiple paths. A8 (AI choice in two places), A9 (weights unreachable) (P3) | Duplicated controls "for convenience" |
| D15 | **Onboarding: resume first, one question per page, skip anything known.** The `interests` page folds into `types`. Progress through the existing `PATCH /v1/profile/onboarding` | Superhuman (defaults: 30% → 98% completion), Linear (about 1 minute), Typeform, NN/g wizards. A6: one long form (P11) | Education before resume (wastes a question on the common path) |
| D16 | **Tour: offered, 5 steps, one real action** (save a listing), replayable, never auto-repeated. **One coach mark per screen** on first visit | NN/g: tutorials are overused and coach marks should be one at a time. Apple: optional and findable. Superhuman: learn by doing (P10, P12). Owner constraint 6 | v1's 9-stop tour on first load |
| D17 | **Hard element budgets** (§1.4) define "uncluttered". **Required rich ingredients** (§1.3b) define "not basic" | Owner constraints 3 and 4. Linear refresh: density without overwhelm through unequal weight (P8) | Removing features to declutter |
| D18 | **Loading ladder:** cached → instant. Skeleton after 150 ms that mirrors the layout, held ≥ 300 ms, then a crossfade. Determinate progress past 10 s. **Never a blank route** | Apple HIG: "finishes before people become aware of it". NN/g: frame-only skeletons read as broken. A1: three screens captured blank (P13). Owner constraint 7 | Spinner screens. Instant skeleton flashes on fast loads |
| D19 | **Confirm only the irreversible** (delete account, delete source). Everything else is optimistic with an undo toast | NN/g confirmation dialogs (P14) | "Are you sure?" on hide, unsave, move, pack off |
| D20 | **Peek stays small:** hovering or focusing the fit ring shows the top 3 reasons in a popover (`FitPeek`). There is no Space-peek drawer | A pull revelation that answers "why 86?" without leaving the list. It doesn't bring back the side panel the owner rejected | A Linear-style peek panel |

### Information architecture

```
Signed out   /  ·  /login  ·  /privacy  ·  /terms
First run    /welcome ─▶ /onboarding/:step ─▶ /radar  (+ tour offer)
Daily        Radar      /radar ───────────────▶ /radar/:listingId
             Deadlines  /deadlines ───────────▶ /radar/:listingId
             Tracker    /tracker ─────────────▶ /tracker/:id ──▶ /radar/:listingId
Watch        Sources    /sources | /sources/packs ─▶ /sources/:id · /sources/packs/:id
             Alerts     /alerts ──────────────▶ /alerts/new · /alerts/:id
You          /me (phone hub) · /profile · /settings/:tab · /notifications · /admin (admins only)
```

| Object | Verbs (one name each, everywhere) |
|---|---|
| Listing | Open · **Save** (to Tracker) · Hide · Apply ↗ · **Mark applied** |
| Tracker item | Move to… · Add note · Follow up · Remove |
| Source | Add · Pause · Refresh now · Edit · Delete |
| Pack | Turn on · Turn off |
| Alert | New alert · Pause · Send a test · Duplicate · Delete |
| Notification | Open · Mark read |

---

## 1. Global rules

### 1.1 Page-based navigation

**Page types**

| Type | Use for | Layout |
|---|---|---|
| List page | Radar, Deadlines, Tracker, Sources, Alerts, Notifications, Admin | Headline (§1.2) → sticky toolbar → list. Max width 1280 |
| Detail page | Listing, tracker item, source, pack | Back bar → title block → two columns: **main = dynamic** (fit, next step, runs), **side = static facts and actions** (Stripe). Max width 1100 (main 680 · gap 40 · side 340). One column under 1024 |
| Editor page | New/edit alert | Back bar → one form column with a live preview beside it (desktop) or below it (phone) |
| Settings page | Profile, Settings | Sectioned `e2` panels, label left and control right, autosave |
| Overlay | **Tiny tasks only:** confirm a destructive action, pick a value, quick note, Move to…, add an application manually, the phone filter sheet, the bell popover, the palette | Dialog, sheet or popover. Never a reading surface |

**Back and list memory** (one mechanism for every list; promote `features/sources/lib/list-memory.ts` to
`@/lib/list-memory` and reuse it):

1. **On open:** `rememberOpened(listKey, id, scrollers)` stores `{id, scroll offsets (window + virtualiser + board), at}`
   in `sessionStorage`. The row is a real `<a href>`, so ⌘/Ctrl-click and middle-click open a new tab.
2. **Navigate** with `navigate(to, { state: { listKey }, viewTransition: true })`.
3. **Back** (`useBackNavigation(parent)`): if the previous history entry is in-app, `navigate(-1)` (a POP).
   Otherwise (deep link, push, new tab), go to the parent route.
4. **On POP within 30 min:** restore offsets before paint, select and focus the row (`preventScroll`), then a 600 ms
   selection highlight (none with reduced motion). **After 30 min, or when filters changed:** start at the top. If new
   rows arrived meanwhile, show "3 new since you left · Show" at the top (NN/g).
5. **Back bar:** `‹ Back to Radar` (label = the list's name) · breadcrumb (`Radar / Internships`) · title · prev/next.

**Prev/next.** Derived from the originating list's cached order (`location.state.listKey`). "3 of 142" in mono.
When it reaches the last loaded row, fetch the next page. Hidden on deep links. Keys: `j`/`k` (and `←`/`→` outside
fields) step through the list, and `Esc` goes back.

**Transitions.** Row → page morphs the logo, title and ring as a shared element (View Transitions, `layoutIds.listing*`).
The rest fades and rises 8 px. Back reverses it. Reduced motion: 120 ms crossfade.

**Prefetch.** Hovering ≥ 80 ms or focusing a row prefetches its detail. A detail page prefetches its neighbours, so
`j`/`k` is instant.

### 1.2 One glance → one decision

Every list page opens with **one headline**: a sentence containing the number that matters, in the display style. It
gets ≤ 1 secondary line, ≤ 3 lens chips, and **exactly one primary action per page** (DESIGN v2: one `primary`,
which glows once on mount). Secondary actions go in the toolbar or a `⋯` menu.

| Page | Headline (with data) | Secondary line | Calm or empty headline |
|---|---|---|---|
| Radar | "12 new fits since yesterday" (eyebrow "Good evening, Aarav") | lens chips | "You're up to date — 142 fits on your radar." |
| Deadlines | "3 deadlines this week" | "2 are saved · the next closes tomorrow" | "Nothing due this week — nice." + next upcoming |
| Tracker | "5 applied · 2 need a follow-up" | "Heard back from 4 of 8 (50%) · usually in 11 days" | "Nothing tracked yet." |
| Sources | "Beacon is watching 251 sources for you" | "6 of yours · 4 packs · 1 needs attention" | "Add a source to light up your radar." |
| Alerts | "2 alerts on · 14 matches this week" | — | "No alerts yet." |
| Notifications | "5 new since this morning" | — | "All caught up." |
| Admin | "All systems normal" / "2 sources failing" | "Updated 12 s ago" | — |

### 1.3 Chrome and navigation

- **Desktop top bar** (48 px, glass): brand · **Radar · Deadlines · Tracker** │ **Sources · Alerts** (the second
  group is quieter) · search (`⌘K`) · bell · avatar. Nothing else: **no page controls in the top bar**, and the
  `topbar` slot is retired from Radar.
- **Left column:** only the Radar rail. Every other page uses the full content width within its max width.
- **Mobile:** top bar (title · search · bell), bottom tabs **Radar · Deadlines · Tracker · Me**. On detail pages the
  top bar becomes the Back bar, and the tab bar becomes the page's action bar (D11).
- **Banners:** at most one at a time, by priority: offline > error > warming up > nudge > soft ask. The rest wait.

### 1.3b Rich, not basic (required ingredients)

Declutter by hierarchy and grouping, never by stripping design. Every screen must have these. The visual-system
agent supplies the tokens; screen agents must not drop them:

| Ingredient | Where |
|---|---|
| Company logos (with a monogram fallback) | every row, card, page title and similar-list item |
| Fit ring with band colour + band word | rows, cards, detail verdict, tracker cards, similar lists |
| Type cue (icon + tint) | logo corner badge on rows; Type facet; Deadlines rows and pills |
| Deadline chip in words + urgency colour | rows, Deadlines, tracker cards, the detail side card (countdown) |
| Layered surfaces (DESIGN v2 `e1` page panels · `e2` raised cards, rail, side column, sticky toolbar · `e3` overlays) with the 1 px highlight | everywhere; **no nested cards** (DESIGN-MIGRATION step 2) |
| Display face for H1 and section headers | every page |
| Motion moments: headline number count-up · ring fill on first view · row → page shared element · first-load list stagger (12 rows max) · board drop spring · skeleton → content crossfade · hover lift and reveal | as listed; all reduced-motion safe |
| The beam motif | onboarding `customising`, the warming strip, the empty Radar |

### 1.4 Element budgets (the definition of "uncluttered")

| Unit | Budget |
|---|---|
| **List row** | ≤ **5 elements** + ≤ 1 state marker. ≤ 2 lines on desktop, ≤ 3 on phones. ≤ **3** hover actions |
| **Card** (tracker, pack, rule) | ≤ 5 elements + one control (switch or `⋯`) |
| **Page header** | 1 headline + ≤ 1 secondary line + ≤ 3 lens chips + ≤ 1 primary action |
| **Sticky toolbar** | ≤ 6 controls (count · applied chips as one group · Reset · Sort · View · one extra) |
| **Detail above the fold** (1440 × 900) | title block + fit verdict (or next step) + the actions card. ≤ 6 sections in total before "Show more" |
| **Type sizes per screen** | ≤ 4 (display/H1 · title · body · small), plus mono for numbers |
| **Accent use per viewport** | ≤ 2 (the primary action + the current selection). Status colours (fit bands, deadlines, health) are not accent |
| **Banners** | ≤ 1 visible (§1.3 priority) |
| **Disclosure depth** | ≤ 2 levels (P2) |

Anything over budget moves to the detail page, a labelled disclosure, `⋯` or ⌘K. **It is never deleted** (§5 maps
every feature).

### 1.5 Progressive disclosure and one home

- Disclosure labels say what's inside: "More filters", "How we scored this", "Show full description", "Details",
  "See stats", "Advanced". Never "More…" on its own.
- Each preference has **one** editable home (D14). Elsewhere show "AI: Beacon's AI · Change ›".
- The palette (`⌘K`) reaches every page, action and setting (WEB §7). New items: "Mark applied", "Show hidden",
  "Show me around", "Adjust fit weights", "New alert", "Add source", "Export my data".

### 1.6 Density, spacing, type, widths

- **Density:** comfortable by default. Compact is opt-in (Settings › Appearance) and changes row heights only, never the
  element budget.
- **Spacing:** 4 · 8 · 12 · 16 · 24 · 40 · 64. Inside a component 4–12, between groups 24, between sections 40, page top
  padding 40 (24 on phones). Side gutters 24 desktop and 16 phone.
- **Widths:** list pages ≤ 1280 (Radar = rail 264 + list). Detail ≤ 1100. Settings/Profile ≤ 1040. Notifications
  reading column 720. Onboarding 640. Prose ≤ 68ch.
- **Heights:** Radar row 72 / 52 (compact) · table row 44 / 36 · touch targets ≥ 44 · sticky toolbar 48.
- **Type:** body 15 (16 on phones), small 13, mono 12–13 for numbers (tabular). Display/H1 per DESIGN v2 (Geist 600 in
  the app, serif only in onboarding prompts and marketing). Weight shows hierarchy before size does.

### 1.7 Tone and microcopy

Voice: second person, short, specific, warm. Numbers beat adjectives, and there is no hype. Say what happened and what
to do next. Button labels are verb + object. No exclamation marks except a single "nice" moment. Never blame the
student. Be honest about limits ("No password reset yet").

| # | Context | String |
|---|---|---|
| 1 | Radar headline | "12 new fits since yesterday" |
| 2 | Radar, nothing new | "You're up to date — 142 fits on your radar." |
| 3 | Deadlines empty | "Nothing due this week — nice." |
| 4 | Save toast | "Saved to your Tracker. [Undo]" |
| 5 | Hide toast | "Hidden “Platform Engineering Intern”. [Undo]" |
| 6 | Apply return | "Did you apply to Platform Engineering Intern? [Yes, mark applied] [Not yet]" |
| 7 | Follow-up nudge | "No reply from Northwind Labs in 10 days. A short follow-up often gets one." |
| 8 | Ghosted nudge | "30 days without a reply. Most roles that go quiet this long don't come back." |
| 9 | Warming up | "We're reading your sources — fits appear here as each one finishes." |
| 10 | Source detected | "Found a Greenhouse board — 142 open roles. Free to watch." |
| 11 | Source failing | "Couldn't read this page (403). The site blocks crawlers — try its job-board link instead." |
| 12 | Source interval | "We'll check this page every 6 hours." |
| 13 | Threshold empty | "Nothing above 80 right now. 14 listings score 60–79. [Show Good fits]" |
| 14 | Filters too narrow | "No fits match these filters. Remote + ₹50k + 2026 grads is a narrow mix. [Clear stipend] [Reset filters]" |
| 15 | Error with cache | "Couldn't refresh. Showing what we had at 10:42. [Try again]" |
| 16 | Offline | "You're offline. Changes will sync when you're back." |
| 17 | Push soft ask | "Want a ping when a Strong fit opens? You can change this anytime. [Turn on] [Not now]" |
| 18 | Alert preview | "This would have sent you 6 alerts last week." |
| 19 | Tour offer | "Want a 30-second tour? [Show me around] [I'll explore]" |
| 20 | Delete account | "This permanently deletes your profile, resume, tracker and alerts. Type DELETE to confirm." |

USERFLOW §6 empty-state copy still applies where this table doesn't override it. Onboarding copy is in ONBOARDING §2.

### 1.8 Loading (seamless, never blank)

| Wait | Behaviour |
|---|---|
| Cached (persisted query cache) | Render instantly and revalidate quietly. A 2 px top progress line shows only if the refetch takes > 400 ms |
| < 150 ms | Nothing |
| ≥ 150 ms, first load | **Layout-true skeleton** (same rows, columns and headline block as the real page), held ≥ 300 ms, then a 150 ms crossfade to content. Shimmer per DESIGN v2; static under reduced motion |
| Route change | Keep the old page ≤ 200 ms (transition), then the new page's skeleton. **The shell never unmounts** |
| Filter or sort change | Keep the rows (`keepPreviousData`), dim to 60%, show the top progress line. No skeleton swap |
| Action (save, move, toggle) | Optimistic. Pending → a small dot on the item, never a disabled screen |
| Button-triggered request | Inline progress inside the button with the label kept ("Testing key…"). The button keeps its width |
| 2–10 s process | Looped indicator + specific text ("Detecting…", "Reading your resume…") |
| > 10 s process | **Determinate** with steps ("Ranking 4 of 7 packs", "Crawling page 3 of ~8") |

**Never:** a blank route (A1), a spinner-only screen, frame-only skeletons, a skeleton for a < 150 ms load.
Every list page's first paint (shell + headline skeleton + toolbar + rows) lands **≤ 100 ms** after navigation.

### 1.9 Tech-only framing

Role and skill pickers show tech families first (Backend, Frontend, Full-stack, Mobile, Data, ML / AI, DevOps / Cloud /
SRE, Security, Systems / Embedded, Research, Product / UX for tech), and non-tech goes behind "Other". Examples and
placeholders use tech listings (Platform Engineering Intern, GSoC, Smart India Hackathon), stacks (Go, React,
PyTorch) and OAs. No generic career language.

### 1.10 Mobile

- 4 tabs (D11). Badges only for critical counts (Tracker: follow-ups due). The bell carries the unread count.
- Detail pages: Back bar on top, action bar at the bottom (44 px targets, safe area). Edge-swipe back is native.
- Filters: a chip bar (Baymard: 2–3 visible, horizontal scroll with an edge fade) + the "Filters · N" sheet (90%
  snap) whose primary button shows the live count ("Show 42 fits").
- Rows swipe (right = Save, left = Hide), and `⋯` opens the action sheet. Long-press drag stays off.

### 1.11 Empty and error states

- **Empty** = status + learning cue + one primary path, and a secondary at most (NN/g). **Filter-aware:** when filters are
  active, the empty state names them and offers to clear the narrowest one (Stripe).
- **Error:** keep cached content visible with an inline strip (#15). With no cache, show an in-page error (title,
  one-line cause, [Try again], "Copy error details" with the request id). Never a raw stack.
- **Partial failure:** say what failed and keep the rest ("Acme careers couldn't be read — the rest of your radar is up to date").

### 1.12 Keyboard (delta from DESIGN §11)

| Key | Where | Action |
|---|---|---|
| `j`/`k` (`↓`/`↑`) | lists | next / previous row |
| `j`/`k`, `←`/`→` | detail pages | next / previous item in the originating list |
| `Enter`/`o` | lists | open the full page |
| `Esc` | detail pages | Back |
| `s` | listing | Save / unsave (to Tracker) |
| `a` | listing | **Mark applied** (creates or moves the tracker item to Applied, dated today) |
| `h` | listing | Hide (undo). On a detail page, advances to the next listing |
| `⌘↵` | listing | Apply ↗ |
| `f` | Radar | focus the rail (first facet) |
| `[` | Radar | collapse/expand the rail |
| `1` / `2` / `3` | Radar | List · Deadlines (navigates) · Board |
| `v` | Deadlines | Agenda ↔ Calendar |
| `t` | Deadlines | jump to today |
| `m` | Tracker, tracker item | Move to… |
| `n` | Tracker, Alerts, Sources | Add application · New alert · Add source |
| `?` | anywhere | shortcut sheet, plus "Show me around" |

### 1.13 Accessibility

WCAG 2.2 AA. Every hover reveal is also reachable by focus and by `⋯`. Fit is a number plus a band word (never colour
alone). Deadline chips are words. The rail is a landmark (`aside aria-label="Filters"`) with facet groups as
`fieldset`/`legend`. List memory restores focus. Tour and coach marks trap and return focus. Live regions are polite,
and rows arriving in the background are never announced one by one.

---

## 2. Screens

Wireframes show structure, not styling. Glyphs (✓ ✗ ⚠ ⊘ ◔ ▣ ● ◌ ▸ ↗) stand for lucide icons (DESIGN §8), never text
characters or emoji. `[X]` is a button or control, `(86)` a fit ring, `[N]` a company logo, and `e2`/glass name DESIGN v2
surfaces. Widths are indicative and bounded by §1.6.

### 2.1 Shell + Me page **[SHL]**

```
Desktop
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ Beacon   Radar  Deadlines  Tracker  │  Sources  Alerts          [⌕ Search or jump…  ⌘K]  [bell 5] (AM) │ 48, glass
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
 (AM) menu: Profile · Settings · Show me around · Keyboard shortcuts ? · Theme ▸ · Admin (admins) · Sign out
 [bell] popover: 5 newest unread · Mark all read · See all ›                    (tiny task, e3)

Mobile list page                      Mobile detail page                 Me (/me)
┌──────────────────────────────┐      ┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ◉ Radar          [⌕] [bell 5]│      │ ‹ Radar        3 of 142  ‹ › │   │ ◉ You            [⌕] [bell 5]│
├──────────────────────────────┤      ├──────────────────────────────┤   ├──────────────────────────────┤
│                              │      │                              │   │ (AM) Aarav Mehta             │
│ content                      │      │ content                      │   │ B.Tech CSE · 2027   Profile ›│
│                              │      │                              │   │ WATCH                        │
│                              │      │                              │   │ Sources     1 needs attention›│
├──────────────────────────────┤      ├──────────────────────────────┤   │ Alerts             2 on     ›│
│ Radar Deadlines Tracker  Me  │      │ [  Apply ↗   ] [Save]  [⋯]   │   │ INBOX                        │
└──────────────────────────────┘      └──────────────────────────────┘   │ Notifications      5 new    ›│
                                                                          │ APP                          │
                                                                          │ Settings                    ›│
                                                                          │ Show me around              ›│
                                                                          │ Admin (admins)              ›│
                                                                          │ Sign out                     │
                                                                          ├──────────────────────────────┤
                                                                          │ Radar Deadlines Tracker  Me  │
                                                                          └──────────────────────────────┘
```

- [ ] Top bar exactly as drawn. Nav in two groups. Retire the `topbar` slot for Radar (fit, sort and view move to the rail and toolbar).
- [ ] Retire the `drawer` slot and `ResponsiveDrawer` for listings and tracker items (D1). Keep `ResponsiveDrawer` only if another tiny-task overlay needs it.
- [ ] Ship `useBackNavigation(parent)` and promote list memory to `@/lib/list-memory` (§1.1). Write a short usage note in WEB.md.
- [ ] Mobile tab bar: 4 tabs (Radar · Deadlines · Tracker · Me). **Me is a route `/me`** (status hints as drawn). Remove the Me sheet. The Me tab is active on `/me`, `/sources*`, `/alerts*`, `/profile`, `/settings*`, `/notifications`, `/admin`.
- [ ] Detail routes (`/radar/:id`, `/tracker/:id`, `/sources/:id`, `/sources/packs/:id`, `/alerts/new`, `/alerts/:id`) render a Back bar on phones and hide the tab bar. Pages supply their action bar through a `bottombar` slot.
- [ ] Bell: popover on desktop (newest 5, Mark all read, See all). Tap on phones → `/notifications`.
- [ ] Banner arbiter: one banner at a time (§1.3 priority).
- [ ] The shell never unmounts on route change. Each lazy route shows its own skeleton inside the shell within 100 ms (A1).
- [ ] Tour engine + coach-mark host (`<Spotlight>`, `<CoachMark id>`) and the "Show me around" entry points (§3, ONBOARDING §6–7).
- [ ] Palette: add the commands in §1.5.

### 2.2 Radar `/radar` **[RAD]**

```
Desktop ≥ 1280
┌ top bar ────────────────────────────────────────────────────────────────────────────────────────────────┐
├────────────────────────┬────────────────────────────────────────────────────────────────────────────────┤
│ VIEWS                  │ Good evening, Aarav                                               (eyebrow)    │
│ ● My radar             │ 12 new fits since yesterday                                       (display)    │
│ ○ Dream companies      │ [New · 12]  [Due this week · 3]  [Follow-up due · 1 ›]            lens chips   │
│ ○ Remote ML            │                                                                                │
│ + Save view            │┌ toolbar (sticky, glass) ──────────────────────────────────────────────────────┐│
│ ────────────────────── ││ 142 fits · [Internship ×] [Remote ×] [≥ ₹20k ×]  Reset      Best fit ▾  [≡|▦] ││
│ FIT                    │└───────────────────────────────────────────────────────────────────────────────┘│
│ ( ) Strong  80+        │ ● [N]  Platform Engineering Intern              [Save][Hide][Apply↗] 6d left (86)│
│ (•) Good    60+        │        Northwind Labs · Remote · ₹45k/mo · ✓ Go, Postgres match           Strong│
│ ( ) Worth a look 40+   │   [M]  ML Research Intern                                           9d left  (91)│
│ ( ) Everything         │        Meridian AI Lab · Bengaluru · ₹60k/mo · ✓ PyTorch, papers          Strong│
│     Custom…            │ ▣ [D]  Monsoon Hack 2026                                            3d left  (78)│
│ TYPE                   │        Devfolio · Online · ₹2L prizes · ✓ Next.js                           Good │
│ ☑ Internship           │   [A]  Data Analyst Intern                                         14d left  (64)│
│ ☐ Full-time            │        Acme Analytics · Pune · ₹25k/mo · ⚠ Possibly stale                   Good │
│ ☑ Hackathon            │   [K]  Kaveri Foundation Scholarship                                Rolling  (58)│
│ ☐ Scholarship          │        Kaveri Foundation · India · ₹50k/yr · ✓ CSE, 2027      Worth a look       │
│ ☐ Research             │   …  (virtualised)                                                             │
│ ☐ Open source          │                                                                                │
│ DEADLINE               │                                                                                │
│ (•) Any ( ) 7d ( ) 14d │                                                                                │
│ ( ) 30d   ☐ Rolling too│                                                                                │
│ WHERE                  │                                                                                │
│ [Remote][Hybrid][On-site]                                                                               │
│ Cities ⌕ [Bengaluru ×] │                                                                                │
│ STIPEND                │                                                                                │
│ ≥ ₹20k  ───●──────     │                                                                                │
│ ☐ Hide unpaid          │                                                                                │
│ ▸ Grad year     2027   │                                                                                │
│ ▸ Company       Any    │                                                                                │
│ ▸ Source        Any    │                                                                                │
│ ▸ Freshness     Any    │                                                                                │
│ ▸ Show       Not hidden│                                                                                │
│ ────────────────────── │                                                                                │
│ Reset all          «   │                                                                                │
│ Filters are for now.   │                                                                                │
│ Edit preferences ›     │                                                                                │
└────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘
 rail 264 (e2, own scroll) · list ≤ 1016 · ● = New marker · ▣ = Saved marker · [Save][Hide][Apply↗] appear on hover/focus only
```

```
Mobile                                   Filter sheet (90 %)
┌────────────────────────────────────┐   ┌────────────────────────────────────┐
│ ◉ Radar                [⌕] [bell 5]│   │ Filters                      Reset │
├────────────────────────────────────┤   │ FIT [Strong][Good+][40+][All]      │
│ Good evening, Aarav                │   │ TYPE [Internship ✓][Hackathon ✓] → │
│ 12 new fits since yesterday        │   │ DEADLINE [Any][7d][14d][30d]       │
│ [New · 12] [Due soon · 3] [Follow… │   │ WHERE [Remote][Hybrid][On-site]    │
├────────────────────────────────────┤   │ Cities ⌕                           │
│ [Filters · 3] [Good+ ▾] [Best fit ▾]│  │ STIPEND ≥ ₹20k ───●────            │
│ [Internship ×] [Remote ×] [≥₹20k ×]│   │ ▸ More filters                     │
├────────────────────────────────────┤   │   grad year · company · source ·   │
│ ● [N] Platform Engineering    (86) │   │   freshness · show                 │
│       Intern                Strong │   ├────────────────────────────────────┤
│       Northwind · Remote · ₹45k    │   │ [         Show 42 fits         ]   │
│       ✓ Go, Postgres  6d left   ⋯  │   └────────────────────────────────────┘
├────────────────────────────────────┤
│   [M] ML Research Intern      (91) │
│       …                            │
├────────────────────────────────────┤
│ Radar  Deadlines  Tracker   Me     │
└────────────────────────────────────┘
```

**Row anatomy (D6).** ① Logo 40 (32 compact) with the type cue badge on its corner. ② Title (body, 500 weight, one line;
visited rows render a step quieter, like LinkedIn's "Viewed"). ③ Meta line (small, secondary): company · place/mode ·
pay (stipend, prize or "Unpaid"; omitted when unknown) · **one signal**. Signal precedence: *hard-fail* ("⊘ Not
eligible: 2026 grads only") > *ghost medium/high* ("⚠ Possibly stale" / "Likely ghost") > *top reason* ("✓ Go,
Postgres match"). ④ Deadline chip in words ("6d left", "Closes today", "Opens 3 Nov", "Rolling", "Closed 2d ago";
omitted when unknown). ⑤ Fit ring 36 (28 compact) with the band word below (tooltip in compact). **State marker** (left
gutter, 12 px): tracker stage glyph (Applied, OA, Interview, Offer) > Saved > New. **Hover/focus slot** (reserved,
empty at rest): Save `S` · Hide `H` · Apply ↗ `⌘↵`, each with a tooltip showing its key. The keyboard cursor row uses
the DESIGN v2 selected style. Ring hover/focus → `FitPeek` with the top 3 reasons (D20).

**Rail (D4, D5).**
- **Views:** "My radar" (your preferences, the default) + saved views (≤ 5 shown, then "More views"). **"+ Save view"**
  appears only when the current filters differ from the active view. Rename/Delete via `⋯`. Onboarding creates
  "Dream companies" when companies were picked.
- **Expanded:** Fit (presets + Custom slider; the default is the user's threshold) · Type (icons) · Deadline (Any, 7, 14,
  30 days + "Include rolling") · Where (Remote / Hybrid / On-site multi-select + cities combobox) · Stipend (slider,
  "No minimum" at 0, "Hide unpaid").
- **Collapsed** (the header shows the current value): Grad year (prefilled from Profile) · Company (search, multi) ·
  Source (search, multi) · Freshness (Any, Posted today, 7d, 30d, **New since last visit**) · Show (Saved only · Include
  hidden · Include closed).
- Active facets get a per-facet `×`. Footer: Reset all (disabled at defaults) · collapse `«`. Caption: "Filters are for
  now. Edit preferences ›" → `/profile#looking-for`.
- **Counts:** only when conditional counts exist (API ask A1). Until then, show Type counts only when no other filter is
  active (`summary.byType`). **Never show stale or unconditional counts next to options.**
- Collapsed rail (`[`, persisted): a 56 px icon strip with an active dot per facet. Clicking a facet opens it as a flyout.
- Breakpoints: ≥ 1024 open by default. Below 1024 it becomes "Filters · N" + sheet.

**Toolbar:** count (mono, counts up) · applied chips (removable; one row, overflow "+3") · Reset · Sort (Best fit ·
Closing soon · Newest) · View (List | Board, where Board groups by type with the same card anatomy). Search runs
through the palette (`/`, `⌘K`): "Search radar for ‘rust’" adds a `“rust” ×` chip.

**Lens chips** appear only when count > 0. *New* → Freshness "New since last visit". *Due this week* → Deadline 7d.
*Follow-up due* → `/tracker?filter=follow-up`. They apply as removable chips and also exist in the rail (Baymard).

**States.** Warming: the headline reads "Your radar is warming up" with a determinate strip ("Ranking 4 of 7 packs ·
checking 1 of your sources") + [Show progress] (USERFLOW §1.7 checklist), and rows stream in at their rank.
Threshold empty (#13), filters too narrow (#14), all triaged, no-resume strip (USERFLOW §6), error with cache (#15),
offline (#16). The push soft ask (#17) shows once, under the toolbar, after the first save. The apply-return prompt
(#6) shows inline under the toolbar when the student returns to Radar.

- [ ] First paint ≤ 100 ms: shell + headline skeleton + toolbar + 8 layout-true row skeletons. **Never blank** (A1).
- [ ] Row click / `Enter` / `o` → `/radar/:id` full page. Rows are `<a href>`. No drawer anywhere.
- [ ] List memory: remember on open, restore on POP ≤ 30 min (window + virtualiser offset), focus + 600 ms highlight, "N new since you left".
- [ ] Headline + eyebrow greeting + ≤ 3 lens chips (count > 0 only). The headline number counts up. No separate Today band; remove it if built.
- [ ] Sticky glass toolbar exactly as specified. No Tune popover. Nothing in the top bar.
- [ ] Rail: Views (dirty-state Save view), 5 expanded + 5 collapsed with value summaries, per-facet ×, Reset all, preferences link, collapse to icons, counts rule.
- [ ] Fit presets with Custom slider. Changing fit updates the row list live (keepPreviousData, 60% dim, top progress line).
- [ ] Row = 5 elements + state marker. Signal precedence. Hover slot never covers the deadline or ring. Visited style. `FitPeek` on the ring.
- [ ] **Save = Tracker › Saved** (D3, API ask A3). Toast #4. `a` = Mark applied. The "Add to tracker" button is gone, and its tests are updated.
- [ ] Hide → toast #5 with undo. Hidden rows reappear under Show › Include hidden, dimmed with an "Unhide" action.
- [ ] Mobile: 3-line row, `⋯` action sheet (Save, Hide, Apply, Mark applied, Copy link), swipe right/left, chip bar + filter sheet with the live count button.
- [ ] Board view keeps the same card anatomy and element budget.
- [ ] States as listed, with filter-aware empties.
- [ ] Tour anchors: `data-tour="headline" | "ring" | "save" | "rail" | "nav"` (first row for ring and save).
- [ ] Keyboard per §1.12, all listed in `?`.

### 2.3 ListingPage `/radar/:listingId` **[RAD]**

```
Desktop
┌ top bar ────────────────────────────────────────────────────────────────────────────────────────────┐
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ‹ Back to Radar     Radar / Internships                                           ‹  3 of 142  ›     │
│                                                                                                     │
│ [LOGO]  Platform Engineering Intern                                                   (display)     │
│  56     Northwind Labs · Remote (India) · Internship · 6 months · posted 2d ago                     │
│                                                                                                     │
│ ┌ main 680 ─────────────────────────────────────────────┐   ┌ side 340 (sticky, e2) ──────────────┐ │
│ │ (  86  )  Strong fit                                  │   │ [   Apply on Greenhouse ↗   ]       │ │
│ │   72 px   Your Go and Postgres cover 4 of 5 required  │   │ [▣ Saved]  [Hide]   [⋯]             │ │
│ │           skills, and 2027 grads are eligible.        │   │   ⋯ Mark applied · Copy link ·      │ │
│ │                                                       │   │     Report a broken link            │ │
│ │ WHAT MATCHES                WHAT'S MISSING            │   │ ─────────────────────────────────── │ │
│ │ ✓ Go · Postgres · Docker    ✗ Kubernetes (required)   │   │ Closes in 6 days                    │ │
│ │ ✓ Class of 2027 eligible    ✗ Terraform (nice to have)│   │ Mon 3 Nov · 23:59 IST               │ │
│ │ ✓ Remote — matches you                                │   │ ─────────────────────────────────── │ │
│ │ ▸ How we scored this                                  │   │ Eligibility                         │ │
│ │   (bars + contributions + ghost penalty + caps,       │   │ 2026–2027 grads · B.Tech/B.E. CSE   │ │
│ │    "Weights: default · Adjust weights ›")             │   │ ─────────────────────────────────── │ │
│ │                                                       │   │ Looks active                        │ │
│ │ TAILOR YOUR APPLICATION                          AI   │   │ Link checked 2 h ago · 200 OK       │ │
│ │ 1. Lead with your Go rate-limiter project…            │   │ ─────────────────────────────────── │ │
│ │ 2. Mention Postgres indexing work from …              │   │ Source  Northwind careers ›         │ │
│ │                                                       │   │ via Greenhouse · personal           │ │
│ │ ABOUT THE ROLE                                        │   └─────────────────────────────────────┘ │
│ │ prose ≤ 68ch, first ~12 lines … [Show full description]│                                         │
│ │                                                       │                                         │
│ │ SIMILAR OPEN ROLES                                    │                                         │
│ │ [B] Backend Intern · Atlan            9d left   (82)  │                                         │
│ │ [C] SDE Intern · CRED                12d left   (79)  │                                         │
│ │ [R] Platform Intern · Razorpay        5d left   (77)  │                                         │
│ └───────────────────────────────────────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
Mobile
┌────────────────────────────────────┐
│ ‹ Radar              3 of 142  ‹ › │
├────────────────────────────────────┤
│ [LOGO] Platform Engineering Intern │
│ Northwind Labs · Remote · 6d left  │
│ ┌────────────────────────────────┐ │
│ │ (86) Strong fit                │ │
│ │ Your Go and Postgres cover 4 of│ │
│ │ 5 required skills…             │ │
│ └────────────────────────────────┘ │
│ ✓ Go · Postgres · Docker           │
│ ✗ Kubernetes                       │
│ ▸ How we scored this               │
│ Tailor your application       AI   │
│ About the role …    Show more      │
│ Closes Mon 3 Nov · Eligibility ›   │
│ Looks active · Source ›            │
│ Similar open roles                 │
├────────────────────────────────────┤
│ [   Apply ↗    ]  [▣ Saved]  [⋯]   │  action bar (replaces tabs)
└────────────────────────────────────┘
```

**Order is fixed.** Main: verdict → matches/missing → How we scored this (collapsed) → tips → description → similar.
Side: actions → deadline → eligibility → ghost check → source. The verdict sentence is built from the fit result (top
matched-required skills, eligibility, location). In AI-off mode, tips read "Tailoring tips need AI. Turn it on in
Settings › AI & keys ›", and everything else works.

- [ ] Replace the placeholder (A2). Back bar with list name, breadcrumb, prev/next, `j`/`k`/`←`/`→`, `Esc` = Back (§1.1).
- [ ] Shared-element morph from the row (logo, title, ring). Reduced motion: crossfade.
- [ ] Skeleton: title block + verdict block + 3 section bars + side card, crossfading in. Never a spinner.
- [ ] Main/side split and order exactly as drawn. **Skills matched/missing move to the main column** as the checklist (P7).
- [ ] "How we scored this" collapsed by default, with ring-fill and bar animations on expand. "Adjust weights ›" → `/profile#weights` (fixes A9).
- [ ] Actions card: Apply ↗ is the page's one primary. Save shows state ("▣ Saved", or the tracker stage when tracked: "In Tracker · Applied ›"). Hide auto-advances (D2) with undo. `⋯` holds Mark applied, Copy link, Report a broken link.
- [ ] Apply return prompt (#6) inline under the title block when the student comes back within 2 h.
- [ ] Ghost check: "Looks active", "Possibly stale" or "Likely ghost", with reasons as a list. The score penalty is shown in the breakdown.
- [ ] Hard-fail: the verdict becomes "Not eligible: graduating 2027 only", with the ring in the low band and a `Ban` icon (DESIGN §3.3 rule kept).
- [ ] Similar: ≤ 6 rows, same row anatomy (compact). Clicking navigates and replaces prev/next context with "Similar to ‹title›".
- [ ] Mobile: one column, action bar, Back bar. Eligibility and source as rows that expand inline.
- [ ] Coach mark on "How we scored this" (ONBOARDING §7).
- [ ] 404/removed listing: "This listing was removed by its source. [Back to Radar] [See similar]".

### 2.4 Deadlines `/deadlines` **[RAD]**

```
Desktop (Agenda, default)
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3 deadlines this week                                          [Agenda | Calendar]  Types ▾  Saved only ☐ │
│ 2 are saved · the next closes tomorrow                                                              │
│ ┌ next 14 days ───────────────────────────────────────────────────────────────────────────────────┐ │
│ │ TUE 28  W 29   T 30   F 31   S 1   S 2   M 3   T 4   W 5   T 6   F 7   S 8   S 9   M 10          │ │
│ │ ┃●●     ●      ·      ●●     ░     ░     ●●●   ·     ●     ·     ·     ░     ░     ●             │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ TODAY · TUE 28 OCT                                                                    (sticky day)  │
│  23:59  closes in 5 h   [K]  Kaveri Foundation Scholarship                       (72)  [Save]       │
│                              Kaveri Foundation · Scholarship                                        │
│ TOMORROW · WED 29                                                                                   │
│  18:00                  [D]  Monsoon Hack 2026                    ▣ Saved        (78)               │
│                              Devfolio · Hackathon · online                                          │
│ THIS WEEK                                                                                           │
│  Fri 31                 [N]  Backend Engineering Intern           In Tracker · Applied   (86)        │
│ NEXT WEEK · LATER                                                                                   │
│  …                                                                                                  │
│ ▸ NO FIXED DEADLINE · 14 rolling                                                                    │
╰ while dragging a row:  ╭ Drop here to save to Tracker ╮                                             │
```

```
Mobile
┌────────────────────────────────────┐
│ ◉ Deadlines            [⌕] [bell 5]│
├────────────────────────────────────┤
│ 3 deadlines this week              │
│ ┌ 14-day strip (scrolls) ────────┐ │
│ │ T28 W29 T30 F31 S1 S2 M3 …     │ │
│ └────────────────────────────────┘ │
│ [Types ▾] [Saved only]             │
│ TODAY · TUE 28                     │
│ [K] Kaveri Scholarship        (72) │
│     Closes in 5 h · Scholarship    │
│ TOMORROW                           │
│ [D] Monsoon Hack 2026  ▣      (78) │
│     Closes 18:00 · Hackathon       │
├────────────────────────────────────┤
│ Radar  Deadlines  Tracker   Me     │
└────────────────────────────────────┘
```

**Row anatomy (5):** date/time column (mono; urgent ≤ 3 days in words: "closes in 5 h") · logo with type cue · title +
company/type line · status (Saved marker, tracker stage, or hover Save) · fit ring. The list includes fits at or above
the Radar threshold plus everything saved or tracked. "Saved only" narrows it.

- [ ] Headline (#3 when empty, plus "Next: Smart India Hackathon closes 12 Nov").
- [ ] 14-day density strip: dots per day (≤ 3, then "+n"), today line, weekend tint. Clicking a day scrolls the agenda to it. It's the timeline moment, so it's rich (depth, accent today).
- [ ] Agenda groups: Today · Tomorrow · This week · Next week · Later (≤ 8 weeks) · No fixed deadline (collapsed). Sticky day headers.
- [ ] [Agenda | Calendar] (`v`, remembered). Calendar = the existing 4-week grid (DESIGN §10.3), pills → ListingPage, "+N more" popover. Hidden below 768 px.
- [ ] Row/pill click → ListingPage with list memory (listKey `deadlines`). Back returns here.
- [ ] Drag a row or pill → dock "Drop here to save to Tracker" (D3 wording). `s` saves, `a` marks applied, `t` jumps to today.
- [ ] Filters: Types popover + Saved only. Fit threshold is inherited from Radar and shown as a chip ("Good+ ×").
- [ ] Skeleton: strip + 2 day groups × 3 rows. Empty and filter-aware states.
- [ ] Coach mark on the Agenda/Calendar switch.

### 2.5 Sources `/sources` · `/sources/packs` **[SAT]**

```
Desktop (Your sources)
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Beacon is watching 251 sources for you                              312 of 500 crawl credits used ⓘ │
│ 6 of yours · 4 packs · 1 needs attention                                                            │
│ ┌ Add a source (e2) ──────────────────────────────────────────────────────────────────────────────┐ │
│ │ [ Paste a careers page, job board or hackathon site…                               ]  [Add]     │ │
│ │ ✓ Found a Greenhouse board — 142 open roles. Free to watch.   Tag [Internship ▾] Every [6 h ▾]   │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ [Your sources 6] [Packs 4 of 7 on]                         [⌕ Is a company already watched?] Details ☐│
│ ✕ Failing   [A] Acme careers        Crawler      —     ●                                        ⋯   │
│             └ Couldn't read this page (403). The site blocks crawlers.   [Try again] [Fix the link] │
│ ● Healthy   [S] Stripe              Greenhouse   142   ●                                        ⋯   │
│ ◌ Slow      [N] Northwind careers   Crawler       18   ●                                        ⋯   │
│ ● Healthy   [D] Devfolio hackathons API           25   ●                                        ⋯   │
│ …                                                                                                   │
│ Plus 245 sources from 4 packs. They don't use your crawl credits.  See packs ›                      │
```

```
Mobile                                    Packs tab (desktop grid · mobile list)
┌────────────────────────────────────┐   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ◉ Sources              [⌕] [bell 5]│   │ ▦▦▦▦▦ logos  │ │ ▦▦▦▦▦        │ │ ▦▦▦▦▦        │
├────────────────────────────────────┤   │ Top Indian   │ │ FAANG+ in    │ │ YC startups  │
│ Watching 251 sources               │   │ product cos  │ │ India        │ │ hiring interns│
│ 6 yours · 1 needs attention        │   │ 48 · 1,711   │ │ 106 · 46,769 │ │ 66 · 3,842   │
│ [ Paste a careers page…   ] [Add]  │   │          [●] │ │          [●] │ │          [●] │
│ [Your sources 6] [Packs 4/7]       │   └──────────────┘ └──────────────┘ └──────────────┘
│ ✕ Acme careers            ●    ⋯   │
│   Couldn't read (403) · Fix ›      │
│ ● Stripe · 142 listings   ●    ⋯   │
│ ◌ Northwind · 18          ●    ⋯   │
│ 312 of 500 credits used today      │
├────────────────────────────────────┤
│ Radar  Deadlines  Tracker   Me     │
└────────────────────────────────────┘
```

- [ ] **Your sources lists personal sources only** (D13, A3). Footer line links to Packs. Search covers both, with a "From packs" result group showing "Watched in ‹pack›".
- [ ] Add a source field always visible at the top (live detect, paste-anywhere, `n` focuses it). Detection copy #10 / #11. Tag and interval appear only after detection (progressive).
- [ ] Row (5): health (icon + word) · logo + name (URL on hover/Details) · kind · listings count (mono) · enable switch, plus `⋯` (Refresh now, Edit, Pause, Delete). Failing rows expand inline with the reason and fixes (keep).
- [ ] "Details" toggle reveals Interval · Last check · Next check · Errors columns (persisted).
- [ ] The credit meter is one quiet line + popover (cap, reset time, "packs don't use credits", self-hosted backup note).
- [ ] Row click → SourcePage (list memory listKey `sources`).
- [ ] Packs tab: 7 cards (≤ 5 elements: logos, name, one line, counts, toggle). Toggle off → undo toast, no confirm. Card click → PackPage.
- [ ] Empty (no personal sources): "Your packs cover 245 sources. Add a careers page to watch one more company." [Add source].
- [ ] Skeleton: headline, add field, 6 rows. Coach mark on the Add field.

### 2.6 SourcePage `/sources/:id` **[SAT]**

```
Desktop
│ ‹ Back to Sources    Sources / Stripe                                                               │
│ [LOGO] Stripe                          ● Healthy                       [Refresh now]   [⋯]          │
│        boards.greenhouse.io/stripe · Greenhouse · personal                                          │
│ ┌ main ──────────────────────────────────────────────┐  ┌ side (e2) ─────────────────────────────┐  │
│ │ Healthy — checked 12 min ago. Next check in 5 h 48 m│  │ SETTINGS                               │  │
│ │ LISTINGS FOUND · 142                                │  │ URL        boards.greenhouse.io/stripe │  │
│ │ [S] Software Engineer Intern   9d left  (88)        │  │ Tag as     [Internship ▾]              │  │
│ │ [S] Backend Engineer, New Grad 21d left (81)        │  │ Check      [Every 6 h ▾]               │  │
│ │ … See all 142 in Radar ›                            │  │ Watching   [●]                         │  │
│ │ RECENT CHECKS                                       │  │ COST                                   │  │
│ │ 12:04  ✓ 3 new · 2 updated · 1.2 s                  │  │ Free — public Greenhouse API           │  │
│ │ 06:03  ✓ 0 new · 0.9 s                              │  │ ────────────────────────────────────── │  │
│ │ Yesterday 23:58  ✕ 503 from Greenhouse · retried ✓  │  │ Delete source…                         │  │
│ └─────────────────────────────────────────────────────┘  └────────────────────────────────────────┘  │
```
Mobile: one column (status → listings → checks → settings), with an action bar [Refresh now] [⋯].

- [ ] Status sentence first. Failing: reason + fix actions ([Try again] [Fix the link] [Switch to its job board]).
- [ ] Listings found use the Radar row anatomy (compact, top 8) + "See all N in Radar ›" → `/radar?sourceIds=<id>`.
- [ ] Recent checks: last 10 runs (time, result, new/updated, duration).
- [ ] Settings autosave. "Delete source…" uses a confirm dialog (irreversible: runs are lost, D19). Pause doesn't confirm.
- [ ] Pack (community) sources: settings read-only, with "Part of Top Indian product companies ›".
- [ ] Back with list memory. Prev/next over the sources list.

### 2.7 PackPage `/sources/packs/:id` **[SAT]**

```
│ ‹ Back to Packs    Sources / Packs / Top Indian product companies                                   │
│ ▦▦▦▦▦  Top Indian product companies                                               [ On ●]           │
│        Razorpay, CRED, Zerodha and other product companies · refreshed 1 h ago                      │
│ 48 sources · 1,711 listings · 46 healthy · 2 slow            See listings from this pack in Radar › │
│ [⌕ Search 48 sources]                                                                               │
│ ● Healthy  [R] Razorpay      Lever        52   1 h ago                                              │
│ ◌ Slow     [C] Cashfree      Crawler      31   4 h ago                                              │
│ …  (virtualised)                                                                                    │
```

- [ ] The pack-level toggle is the only control (undo on off). Rows are read-only, and click → SourcePage.
- [ ] Stats line, search, virtualised list. "See listings" → `/radar?sourceIds=…` (pack's sources).
- [ ] Mobile: same as a single column. The toggle sits in the header.

### 2.8 Alerts `/alerts` **[SAT]**

```
Desktop
│ 2 alerts on · 14 matches this week                                                   [+ New alert]  │
│ ┌ rule card (e2) ─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Tell me instantly when a Strong fit internship opens                  Push · In-app   [●]   ⋯   │ │
│ │ 9 matches this week  ▁▃▅▂▇▁▃  · last sent 2 h ago                                               │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Tell me daily about hackathons closing within 7 days                  In-app          [●]   ⋯   │ │
│ │ 5 matches this week  ▂▂▁▃▁▂▁  · last sent yesterday                                             │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ BUILT IN                                                                                            │
│ Deadline reminders   7 · 3 · 1 days before, for saved items     [7d ✓][3d ✓][1d ✓]          [●]     │
│ Follow-up nudges     after 10 days without a reply, and at 30 days                          [●]     │
│ Push is off in this browser.  [Turn on push]                    Delivery & quiet hours in Settings ›│
```
Mobile: the same cards stacked. "+ New alert" in the top bar as an icon button.

- [ ] Headline. Rule cards (≤ 5: sentence, channels, switch, sparkline + matches line, `⋯` with Edit · Duplicate · Send a test · Delete with undo). Card click → AlertEditorPage.
- [ ] **Built-in section is the single home** for deadline reminders (7/3/1 toggles) and follow-up nudges on/off (D14).
- [ ] Push state line (soft ask path, USERFLOW §2). Denied: "Notifications are blocked in this browser. How to unblock ›".
- [ ] Empty: "No alerts yet. Start with one: tell me when a Strong fit internship opens. [Create this alert] [Build my own]".
- [ ] Skeleton: 2 cards + built-in rows. Coach mark on New alert.

### 2.9 AlertEditorPage `/alerts/new` · `/alerts/:id` **[SAT]**

```
Desktop
│ ‹ Back to Alerts    Alerts / New alert                                                              │
│ New alert                                                                                           │
│ ┌ sentence (e2) ─────────────────────────────────────────────────┐  ┌ preview (e2, sticky) ───────┐ │
│ │ Tell me [instantly ▾] when a [Strong fit ▾] [internship ▾] opens │  │ This would have sent you    │ │
│ │ [+ due within…] [+ remote only] [+ company…] [+ stipend ≥…]     │  │ 6 alerts last week.         │ │
│ │ by  [Push ✓] [In-app ✓]                                         │  │ ▁▃▅▂▇▁▃                      │ │
│ │ Name (optional)  [Strong internships              ]             │  │ [N] Platform Eng… (86)      │ │
│ │ Pushes in quiet hours (23:00–08:00) wait until morning. Change ›│  │ [M] ML Research…  (91)      │ │
│ └─────────────────────────────────────────────────────────────────┘  │ [A] Data Analyst… (64)      │ │
│                                                      [Cancel]  [Save alert]                         │
```
Mobile: sentence, then preview below, with a sticky [Save alert].

- [ ] Sentence builder with progressive conditions ("+ Add a condition" chips). Each token is a popover picker (tiny task).
- [ ] Live preview from `POST /v1/alerts/preview` (debounced 300 ms): copy #18, 7-bar sparkline, ≤ 3 sample rows (click → ListingPage). With `warmingUp`: "Preview fills in once your radar is ready."
- [ ] Push token without permission: "Needs permission · Allow notifications" (USERFLOW §2).
- [ ] Existing alert: `⋯` has Send a test, Duplicate, Delete (undo). Unsaved changes → confirm on leave (data loss, D19).
- [ ] Save alert is the one primary. Back with list memory.

### 2.10 Tracker `/tracker` **[SAT]**

```
Desktop
│ 5 applied · 2 need a follow-up                                       [Board | Table]  [+ Add application] │
│ Heard back from 4 of 8 (50%) · usually in 11 days · best source: YC startups     See stats ▾       │
│ ┌ banner (one) ───────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 2 applications have gone quiet. Follow up?                                   [Review 2]   ×     │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ SAVED 3          APPLIED 3        OA / TEST 1      INTERVIEW 1      OFFER 1         │ CLOSED 2 ▸     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ Rejected 1     │
│ │[N] Backend   │ │[N] Platform  │ │[A] SDE Intern│ │[M] ML Research│ │[K] Frontend │ │ Ghosted 1      │
│ │Engineering…  │ │Engineering…  │ │Acme          │ │Meridian AI   │ │Intern        │ │                │
│ │Northwind Labs│ │Northwind Labs│ │              │ │              │ │Kestrel Pay   │ │                │
│ │7d left   (86)│ │◔ 11d · follow│ │OA due        │ │Interview 7d  │ │Reply by      │ │                │
│ │              │ │up        (86)│ │tomorrow (74) │ │ago      (91) │ │3 Nov    (88) │ │                │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ │                │
│ ┌──────────────┐ …                                                                   │                │
```

```
Mobile
┌────────────────────────────────────┐
│ ◉ Tracker          [+] [⌕] [bell 5]│
├────────────────────────────────────┤
│ 5 applied · 2 need a follow-up     │
│ ◔ 2 gone quiet · Review ›          │  compact banner (one line)
│ [Saved 3][Applied 3][OA 1][Interv… │  stage tabs (scroll)
├────────────────────────────────────┤
│ [N] Platform Engineering Intern (86)│
│     Northwind · ◔ 11d · follow up ⋯ │
│ [A] Data Analyst Intern        (64)│
│     Acme · Applied 33d · ghosted? ⋯ │
├────────────────────────────────────┤
│ Radar  Deadlines  Tracker   Me     │
└────────────────────────────────────┘
```

**Card (≤ 5):** logo · title (≤ 2 lines) · company · **one status line** (stage-specific: "7d left", "◔ 11d · follow
up", "OA due tomorrow", "Interview 7d ago", "Reply by 3 Nov") · mini fit ring (when linked to a listing). Hover: `⋯`
(Move to…, Open listing, Remove).

- [ ] Columns per D10: 5 active + collapsed **Closed** (56 px, counts; click expands to a column with [Rejected | Ghosted]). Offer is visible (fixes A4).
- [ ] Saved column = saved listings (D3). Removing a Saved card unsaves the listing (undo).
- [ ] Headline + one analytics line. "See stats" expands inline (applied, response rate, median reply, best sources with bars). Below 3 applications: "Response rate appears after 3 applications."
- [ ] One nudge banner. [Review 2] applies a "Needs follow-up" chip that highlights those cards. Each nudged card's status line carries ◔.
- [ ] DnD + keyboard (`m`, arrows), undo toasts, drop spring, the column count animates.
- [ ] Table view: Title · Company · Stage · Applied · Deadline · Last update · Fit · Source (sortable).
- [ ] Card click → TrackerItemPage (list memory `tracker`, incl. the board's horizontal scroll).
- [ ] Mobile: headline + compact banner + stage tabs + list. **The first card starts in the top 40% of the viewport** (A4). Add = `+` in the top bar.
- [ ] Add application → dialog (manual: title, company, URL, type, deadline). It's a tiny task, so a dialog is allowed.
- [ ] `?filter=follow-up` deep link (from the Radar lens chip).
- [ ] Skeleton: headline + 5 columns × 2 cards. Empty: USERFLOW §6 ("Press S on any listing, or drag one here from Deadlines." — updated wording for D3). Coach mark on the first card.

### 2.11 TrackerItemPage `/tracker/:id` **[SAT]**

```
Desktop
│ ‹ Back to Tracker    Tracker / Applied                                          ‹ 2 of 3 in Applied › │
│ [LOGO] Platform Engineering Intern                                          [Applied ▾]   [⋯]       │
│        Northwind Labs · applied 14 Oct (11 days ago)                                                │
│ ┌ main ───────────────────────────────────────────────┐  ┌ side (e2) ────────────────────────────┐  │
│ │ NEXT STEP                                           │  │ KEY DATES                              │  │
│ │ No reply from Northwind Labs in 11 days. A short    │  │ Saved      10 Oct                      │  │
│ │ follow-up often gets one.                           │  │ Applied    14 Oct          edit        │  │
│ │ [Copy follow-up] [I followed up] [Snooze 3 days]    │  │ Deadline   3 Nov                       │  │
│ │ [Got a reply]                                       │  │ OA / Interview  + add date             │  │
│ │ TIMELINE                                            │  │ LISTING                                │  │
│ │ ● Applied · 14 Oct                                  │  │ (86) Strong fit  ·  View listing ›     │  │
│ │ ○ Saved · 10 Oct                                    │  │ Apply link ↗                           │  │
│ │ NOTES                              autosaves        │  │ Source  Northwind careers              │  │
│ │ [ markdown-lite …                              ]    │  └────────────────────────────────────────┘  │
│ │ CONTACTS  + Add       DOCUMENTS  + Add (resume v3)  │                                              │
│ └─────────────────────────────────────────────────────┘                                              │
```
Mobile: one column (Next step → Timeline → Notes → Contacts → Documents → Key dates → Listing), with an action bar
[Stage ▾] [Copy follow-up] [⋯].

- [ ] The Next step card is the page's lead (nudge copy #7/#8, USERFLOW §4). With no nudge: "Nothing to do yet — we'll remind you on 24 Oct."
- [ ] The stage select in the header is the one primary control. Ghosted/Rejected → the inline reflection chips + "Still open and similar" rows (USERFLOW §4.3), never a modal.
- [ ] Copy follow-up opens the editable template in place (no dialog) with "Copied" feedback. Beacon never sends email.
- [ ] Notes autosave (debounced 600 ms, "Saved" tick). Contacts and documents: inline add rows.
- [ ] Prev/next within the same stage. Back with list memory. Coach mark on Next step.
- [ ] Manual (non-listing) items hide the Listing block and show the editable title/company/URL.

### 2.12 Profile `/profile` **[ONB]**

```
Desktop
│ Your profile                                         90% complete · add a project to finish   [⋯]  │
│ (AM)  Aarav Mehta ✎                                                                                 │
│       Full-stack student developer · B.Tech CSE · Class of 2027 · Bengaluru                         │
│       github.com/aarav · linkedin.com/in/aarav · aarav.dev                                          │
│ ┌ main (e2 panels) ───────────────────────────────┐  ┌ side (e2) ────────────────────────────────┐  │
│ │ SKILLS · 12                            Edit     │  │ WHAT YOU'RE LOOKING FOR (#looking-for)     │  │
│ │ [JavaScript ▮▮▮] [React ▮▮▮] [Go ▮▮] [Node ▮▮]  │  │ Internship · Hackathon · Open source  Edit │  │
│ │ [Postgres ▮▮] [Docker ▮] [Python ▮▮] +5 more    │  │ Backend · Full-stack                  Edit │  │
│ │ EDUCATION                              Edit     │  │ Remote or hybrid · Bengaluru          Edit │  │
│ │ Indus Valley Inst. of Tech · B.Tech CSE · 2027  │  │ Stipend ≥ ₹15k/mo                     Edit │  │
│ │ PROJECTS · 3                          + Add     │  │ Works in India                        Edit │  │
│ │ EXPERIENCE                            + Add     │  │ Dream: Razorpay, Stripe               Edit │  │
│ │ ▸ More: spoken languages · experience band      │  │ ▸ How Beacon weighs a fit (#weights)       │  │
│ └─────────────────────────────────────────────────┘  │   6 sliders · Reset to default             │  │
│                                                       │ RESUME  aarav-resume.pdf · read 7 Oct      │  │
│                                                       │ [Replace]  [Read it again]                 │  │
│                                                       │ What recruiters see ›                      │  │
│                                                       └────────────────────────────────────────────┘  │
```
Mobile: one column. Header, then Looking for (summary), then Skills, Education, Projects, Experience, Resume, Weights.

- [ ] Edit in place with autosave ("Saved" indicator). Completeness is one line in the header with the single next step.
- [ ] Skills: ≤ 8 chips + "+N more" (expands grouped by category). Level bars (Learning / Working / Strong).
- [ ] **What you're looking for is the one home for preferences**. Each Edit opens the matching onboarding question in `edit` mode (`FlowMode 'edit'`), returning to `/profile#looking-for`.
- [ ] **How Beacon weighs a fit (`#weights`) is the one home for the 6 sliders** (`PUT /v1/settings/weights`), with a live example ("Platform Engineering Intern would score 86 → 88") and Reset to default. ListingPage links here (A9).
- [ ] Resume card: Replace (re-parse with a diff highlight, "Refined with AI · Undo"), Read it again.
- [ ] "What recruiters see" stays a secondary preview, honestly labelled ("A preview of how your profile reads. Beacon never shares it.").
- [ ] Empty projects: USERFLOW §6 copy. Coach mark on the skill level bars.

### 2.13 Settings `/settings/:tab` **[ONB]**

```
Desktop                                                   Mobile
│ Settings                                              │  ┌──────────────────────────────┐
│ ┌ nav ─────────┐ ┌ Appearance ───────────────────────┐│  │ ‹ Me   Settings              │
│ │▌Appearance   │ │ (e2) Theme · Accent · Density     ││  │ Appearance                  ›│
│ │ AI & keys    │ │      (live row preview) · Text    ││  │ AI & keys                   ›│
│ │ Notifications│ │      size · Motion · Shortcuts    ││  │ Notifications               ›│
│ │ Privacy & data│ └───────────────────────────────────┘│  │ Privacy & data              ›│
│ └──────────────┘                                      │  └──────────────────────────────┘
```

| Tab | Holds (one home each, D14) | Shows as summary + link |
|---|---|---|
| Appearance | theme tiles, accent, density (live row preview), text size, motion, single-key shortcuts | — |
| AI & keys | AI on/off, provider (Beacon's AI / your own key), base URL, model, key (test, replace, remove), today's usage | "Resume text: allowed since 7 Oct · Change in Privacy ›" |
| Notifications | push on this device (permission state, Send a test), in-app on/off, quiet hours, digest time, time zone, **push for tracker nudges** | "Deadline reminders and follow-up nudges are set in Alerts ›" |
| Privacy & data | **Send resume text to the AI provider** (consent), Export my data, Delete account (quiet danger panel at the bottom, type DELETE) | "AI: Beacon's AI · Change in AI & keys ›" |

- [ ] Remove the duplicated AI-mode radio from Privacy (A8). Replace it with the summary line.
- [ ] Each group is one `e2` panel (title + one-line description), rows label-left / control-right, autosave with a "Saved" tick.
- [ ] BYOK states and copy per USERFLOW §5.2. Export/Delete per USERFLOW §5.3 (copy #20).
- [ ] Mobile: section list → pushed section page with a Back bar.

### 2.14 Notifications `/notifications` **[ONB]**

```
Desktop (reading column 720, centred)                     Mobile
│ 5 new since this morning              [Mark all read] │  ┌──────────────────────────────┐
│ [All] [Unread 5] [Deadlines] [Nudges] [Sources]        │  │ ‹ Me   Notifications         │
│ TODAY                                                  │  │ 5 new since this morning     │
│ • (bell) Strong fit: Platform Engineering Intern 1 h   │  │ [All][Unread 5][Deadlines]…  │
│          Northwind Labs · Remote · Fit 86              │  │ TODAY                        │
│ • (cal)  Closes tomorrow: ML Research Intern     3 h   │  │ • Strong fit: Platform…  1 h │
│          Meridian AI Lab · Fit 91                      │  │   Northwind · Fit 86         │
│   (inbox) Today: 6 new Strong fits · 2 due       9 h   │  │ …                            │
│ YESTERDAY                                              │  └──────────────────────────────┘
```

- [ ] A 720 px reading column with time and unread dot aligned to the column, not floating mid-page (A5). Fixed row rhythm.
- [ ] Row (≤ 5): unread dot · kind icon tile · title · one detail line · time (mono). Hover: Mark read. Click navigates (ListingPage, TrackerItemPage, SourcePage, Alerts) and marks read.
- [ ] Segmented filter: All · Unread · Deadlines · Nudges · Sources. Grouped by day. "Mark all read" is secondary (no primary on this page).
- [ ] Soft ask card at the top when eligible (it counts as the one banner). Empty: "All caught up." + "Deadline reminders and nudges will show up here."
- [ ] Skeleton: 2 day groups × 4 rows.

### 2.15 Admin `/admin` **[SHL]**

```
│ All systems normal                                                     Updated 12 s ago  [Refresh]  │
│ ┌ Users ──┐ ┌ Listings ─┐ ┌ Sources ──────────────┐ ┌ Queues ──┐ ┌ Crawler ─────────────────┐       │
│ │ 1,204   │ │ 58,311    │ │ 331 ● · 5 ◌ · 2 ✕     │ │ 340 wait │ │ Cloud · 312/500 credits   │       │
│ └─────────┘ └───────────┘ └───────────────────────┘ └──────────┘ └──────────────────────────┘       │
│ QUEUES                                         │ RECENT SOURCE RUNS                                  │
│ ingest   12 waiting · 2 active · 0 failed      │ 12:04  Stripe        ✓ 3 new   1.2 s               │
│ embed    …                                     │ 12:03  Acme careers  ✕ 403     0.4 s  ›            │
```

- [ ] Headline reflects health ("All systems normal" / "2 sources failing · ingest backlog 340").
- [ ] Tiles (count-up numbers, health words + icons) + two tables in the same calm row style. Auto-refresh every 30 s ("Updated 12 s ago"), plus manual Refresh.
- [ ] Failing run rows link to SourcePage. Mobile: 2-column tiles, tables become lists. Admin-only (403 page otherwise).

### 2.16 Login + Welcome **[SHL]**

- [ ] **Login** keeps its two columns (pitch + card). Continue with Google is the primary. Email/password with a register toggle in place. Honest note "No password reset yet — use Google if you forget it." Errors inline (USERFLOW §1.1). Mobile: one column, card first.
- [ ] **Welcome** (`/welcome`) per ONBOARDING §4: three one-line facts with "More" disclosures, the AI choice, **sticky footer so Continue is always visible** (A7), nothing preselected, reason shown beside a disabled Continue.
- [ ] Both pages: the skeleton is the real layout (prerendered for `/login`). No layout shift when the GIS script loads.

---

## 3. Onboarding, tour and coach marks **[ONB]** (flow) **[SHL]** (`/welcome`, tour engine)

The full step list, copy, anatomy and references are in **`docs/ONBOARDING.md`**. Summary of the binding parts:

- One question per page, prompt in the onboarding serif, one auto-focused input, `Enter` and number keys, thin progress
  "4 of 9", directional transitions, Back keeps answers, skip states its consequence, save after every answer.
- **Order:** email → name → **resume → found** → education → stack → types → roles → location → stipend → work-auth →
  companies → packs → review → customising. Anything known is auto-skipped. `interests` is folded into `types`.
- `customising` is driven by real state (≤ 8 s), then hands off to the Radar headline.
- **Tour:** offered (not forced) once the radar is ready. 5 steps (headline, ring, **save for real**, rail, nav + ⌘K).
  Mobile: 4 steps. Replayable from the avatar menu, `/me`, `?` and ⌘K. Never auto-repeated.
- **Coach marks:** one per screen on first visit (ListingPage, Deadlines, Tracker, TrackerItemPage, Sources, Alerts, Profile).

Checklist **[ONB]**
- [ ] `STEP_ORDER`: move `resume`, `found` before `education`. Remove the `interests` page and derive `answers.interests` from types. Add "Competitive programming" to stack. `stipend` only with Internship/Full-time. `work-auth` only for outside-India/global choices.
- [ ] `companies` preselects packs and creates the "Dream companies" saved view (`companies=` filter).
- [ ] Live effect line only when ≥ 20 (A6). Review page lists every answer with Edit and "Not set" for skips.
- [ ] Prompts per ONBOARDING §2 (final copy), eyebrow personalisation, keyboard per §3, motion per §3.
- [ ] `customising` real-state sequence with an 8 s ceiling and the handoff.
- [ ] Profile "Edit" for preferences reuses the question pages in `edit` mode.

Checklist **[SHL]**
- [ ] `/welcome` per ONBOARDING §4.
- [ ] `<Spotlight>` engine: scrim + interactive cut-out + distinct card + keyboard + pause/resume. Server-backed state (API ask A2) with a localStorage fallback.
- [ ] `<CoachMark>` host: one per page view, never with the tour, never over skeletons, stored per user.
- [ ] Tour offer card (#19), with "Show me around" in the avatar menu, `/me`, `?` and ⌘K.

---

## 4. Verification (QA + UX pass)

- [ ] Every route renders on desktop 1440 and iPhone 390, light and dark, with no console errors and axe serious/critical = 0.
- [ ] **No blank captures:** every screen shows a skeleton or content within 100 ms in the screenshot harness (A1).
- [ ] Back from every detail page returns to the same scroll position with the same row focused (Radar, Deadlines, Tracker, Sources, Packs, Alerts). After a simulated 31 min, it returns to the top.
- [ ] Prev/next and `j`/`k` on ListingPage and TrackerItemPage walk the originating list, including across a page boundary.
- [ ] Element budgets (§1.4) hold on Radar rows, tracker cards, the Sources list and Notifications at 1440 and 390.
- [ ] Every feature in §5 is reachable as described (a QA checklist run).
- [ ] Onboarding resume path completes in ≤ 9 counted pages. A tab closed mid-flow resumes on the same question.
- [ ] The tour runs once, can be replayed, and step 3 completes with a real save.
- [ ] Reduced motion: no shimmer, no parallax, and crossfades only.
- [ ] After screenshots in `docs/ux-audit/after/` with the same file names as `before/`.

---

## 5. Where every feature lives (SPEC §3.1 A–H)

| SPEC | Feature | Lives in (primary) | Also reachable |
|---|---|---|---|
| A | Sign-in (Google + email/password per BRIEF Addendum) | `/login` | — |
| A | Resume upload → parsed editable profile | Onboarding `resume` → `found` | Profile › Resume (Replace, Read it again) |
| A | Skills, education, grad year, projects, links | Onboarding `found`/`education`/`stack` | Profile main column |
| A | Preferred roles, locations, remote pref, stipend floor, work-auth | Onboarding `roles`/`location`/`stipend`/`work-auth` | Profile › What you're looking for (one home); Radar rail for temporary filters |
| A | Languages, experience band | Profile › More | — |
| A | Opportunity types | Onboarding `types` | Profile › Looking for; Radar rail › Type |
| A | Quick-start source packs | Onboarding `packs` | Sources › Packs; PackPage |
| B | Add any URL with auto-classify (ATS → API → RSS → crawl) | Sources › Add a source field | Onboarding `packs` "Missing a company?"; ⌘K "Add source"; `n` on Sources |
| B | Per-source interval, type tag, enable, last checked, listings found, health, error | Sources list (+ Details) | SourcePage (full history, settings) |
| B | Community vs personal sources | Sources tabs (Your sources · Packs) | PackPage |
| B | Daily crawl-credit cap + meter | Sources header line + popover | Admin › Crawler tile |
| C | Ranked by fit with explainers | Radar (Sort: Best fit), row signal | ListingPage verdict + checklist |
| C | Filters: type, deadline, location/remote, stipend, grad year, company, source, freshness | Radar rail | Phone filter sheet; lens chips; ⌘K |
| C | Saved filter views | Radar rail › Views | ⌘K › Views |
| C | Card: title, company + logo, location/remote, stipend, deadline countdown, fit ring | Radar row | Deadlines row, Board card |
| C | Posted date | ListingPage header ("posted 2d ago") | Sort: Newest; rail › Freshness; title tooltip on the row |
| C | 3 "why it fits", 1–2 gaps | ListingPage › What matches / What's missing | Row signal (top reason); `FitPeek` on the ring |
| C | Ghost-risk badge | Row signal (medium/high) | ListingPage › Ghost check (reasons) |
| C | Source badge | ListingPage side › Source | rail › Source; SourcePage |
| C | Save · Hide · Apply · Add to tracker | Row hover slot, `⋯`, swipe, `s`/`h`/`⌘↵` | ListingPage actions card; **Add to tracker = Save** (D3); `a` = Mark applied |
| C | Detail: description, eligibility, skills matched/missing, tailoring tips, similar, apply-link health | ListingPage | — |
| C | Keyboard `j/k/s/h/a`, `/`, `⌘K` | Everywhere per §1.12 | `?` sheet |
| D | Adjustable weights (Skills / Role / Location / Eligibility / Freshness / Stipend) | Profile › How Beacon weighs a fit (`#weights`) | ListingPage › How we scored this › Adjust weights; ⌘K |
| E | Channels (web push + in-app; email/Telegram removed by BRIEF #1) | AlertEditorPage › by [Push] [In-app] | Settings › Notifications (device + permission) |
| E | Rules builder, multiple rules | Alerts list → AlertEditorPage | ⌘K "New alert" |
| E | Digest time | Settings › Notifications | — |
| E | Deadline reminders 7d / 3d / 1d | Alerts › Built-in › Deadline reminders | Settings › Notifications shows a link |
| F | Kanban Saved → Applied → OA/Test → Interview → Offer → Rejected/Ghosted | Tracker board (Closed holds Rejected/Ghosted) | Table view; mobile stage tabs |
| F | Follow-up nudges (10 d) and ghosted (30 d) | Tracker banner + card status; TrackerItemPage › Next step | On/off: Alerts › Built-in; push: Settings › Notifications; Notifications centre |
| F | Notes, contacts, documents, applied date | TrackerItemPage | Apply-return prompt and Mark applied set the date |
| F | Outcome analytics (response rate per source) | Tracker › See stats | — |
| G | Ghost/stale signals and reasons | ListingPage › Ghost check | Row signal; score breakdown (penalty) |
| H | Theme, accent, density, font size, reduced motion | Settings › Appearance | Avatar menu › Theme; ⌘K |
| H | AI: Beacon default / BYOK (provider, model) / disable | Settings › AI & keys | `/welcome` choice (first run) |
| H | Resume-to-AI consent | Settings › Privacy & data | `/welcome` checkbox |
| H | Export (JSON), delete account | Settings › Privacy & data | ⌘K "Export my data" |
| H | Notification prefs, quiet hours, digest time, time zone | Settings › Notifications | — |
| — | Notification centre | `/notifications` | Bell popover; `/me` |
| — | Hidden listings (90 days) | Radar rail › Show › Include hidden | ⌘K "Show hidden" |
| — | Tour / shortcuts | Tour offer; `?` sheet | Avatar menu, `/me`, ⌘K "Show me around" |
| — | Admin overview | `/admin` (admins) | Avatar menu, `/me` |

---

## 6. API asks and dependencies

| # | Ask | Owner | Fallback until it lands |
|---|---|---|---|
| A1 | `GET /v1/feed/facets?<same query>` → conditional counts per facet option (fit bands, types, remote modes, deadline windows, freshness) | api | Type counts only when no other filter is active (`summary.byType`). No other counts |
| A2 | UI state in settings: `ui: { tour: { offeredAt, completedAt, dismissedAt, step }, coachMarks: string[], radar: { railCollapsed, view } }` via `PATCH /v1/settings` | api + shared | `localStorage['beacon:ui:<userId>']` |
| A3 | `POST /v1/listings/:id/save` also upserts the tracker item at `saved` and returns `trackerItemId`. `unsave` deletes it only while the stage is `saved` | api | One optimistic client mutation: save, then `POST /v1/tracker` (409 = already tracked, fine). Unsave: `DELETE /v1/tracker/:id` if the stage is `saved` |
| A4 | `trackerStage` on `FeedItemDTO` and `ListingDetail` (state marker, "In Tracker · Applied") | api | Join with the cached `GET /v1/tracker` by `listingId` |
| A5 | `FeedSummary.followUpsDue` and `nextDeadlineAt` (Radar and Deadlines headlines) | api | Derive from the cached tracker list and the feed |
| A6 | Onboarding: none. `PATCH /v1/profile/onboarding` already stores step + answers | — | — |
| A7 | Web routes: add `/me`. Retire the drawer slot for listings and tracker items. Support `/tracker?filter=follow-up` | [SHL], [SAT] | — |

---

## 7. What changed from v1, and why (the 10 biggest)

1. **Every detail is a page with memory** (D1, D2): Back restores scroll, selection and focus, and prev/next with `j`/`k`
   keeps triage fast. *Why:* owner constraint 1, and the main list–detail cost is losing your place (NN/g).
2. **Save = Tracker** (D3): one verb instead of Save / Add to tracker / Tracker "Saved", and `a` becomes Mark applied.
   *Why:* every tracker students use does this (Simplify, Huntr, Teal). Three names for one intent was the biggest IA
   confusion (A10).
3. **Pages open with the answer** (D8, §1.2): the H1 is the sentence ("12 new fits since yesterday") with ≤ 3 lens
   chips, replacing the Today band and the stat strips. *Why:* answer first (P1), with one header instead of three
   stacked ones.
4. **The rail is restructured, not removed** (D4, D5): Views on top, 5 expanded facets including Fit presets, 5
   collapsed with value summaries, honest counts, and a link to preferences. The Tune popover and top-bar controls are
   gone. *Why:* owner constraint 2, student-standard top facets, ≤ 2 disclosure levels, Baymard counts and overview.
5. **A 5-element row with one signal slot** (D6, D7): the reason, ghost risk or ineligibility shows on the row. Hover
   actions sit in a reserved slot, and state stays visible. *Why:* uncluttered yet complete (owner constraint 4,
   Wellfound's one meta line, WCAG visible controls).
6. **Fit is explained in words first** (D7): band + top reason on rows, and a verdict sentence plus a match/missing
   checklist before the bars. Weights are finally reachable in Profile. *Why:* LinkedIn "How you match" and Jobright's
   gaps. A9 left the SPEC §3.1 D sliders unreachable.
7. **Deadlines is agenda-first under a 14-day density strip** (D9), with the calendar one key away. *Why:* "what's next"
   is a sort problem (Things 3 Upcoming). The grid hid rows behind "+N more".
8. **Tracker shows what matters** (D10): OA/Test and Offer are visible, Rejected/Ghosted collapse into Closed, and the
   mobile chrome is cut so the first card lands in the top 40%. *Why:* A4. OAs are a core stage in Indian tech hiring.
9. **Mobile navigation by frequency** (D11): Radar · Deadlines · Tracker · Me, with Me as a real page, and detail pages
   swap the tab bar for a thumb-reach action bar. *Why:* Apple HIG (tabs are navigation), NN/g hidden-nav data, and the
   LinkedIn/Indeed mobile detail pattern.
10. **Onboarding and teaching follow the evidence** (D15, D16, ONBOARDING.md): resume first, one question per page,
    anything known skipped, real-state customising, a 5-step tour that is offered rather than forced with one real
    action, and one coach mark per screen. *Why:* Superhuman, Linear, Typeform and NN/g (tutorials are overused, pull
    revelations work), plus owner constraint 6.

Also binding: **one home per setting** (D14, fixes A8/A9), **Your sources scoped to the student's own** (D13, fixes
A3), and **never-blank loading** (D18, fixes A1).
