# Beacon UX research: what students find convenient, and why

Research run 2026-10-27 for the UX restructure (`docs/UX-RESTRUCTURE.md`). It covers the products students
already use, craft references for calm density, published usability evidence, and an audit of the current build
(`docs/ux-audit/before/`, 102 captures). It ends with 15 principles, which the restructure spec applies screen by screen.

**How to read the citations.** Each claim links its source. I fetched primary sources (NN/g, Baymard, Apple HIG,
Stripe docs, Linear's own posts, product help centres) where I could. Some pages blocked automated reading:
LinkedIn returned 429, Devpost 403, Unstop needs cookies, and some HIG pages render client-side, so I read them
through Apple's JSON endpoint. For those I used help-centre pages or secondary write-ups and marked them
*(secondary)*. Numbers from vendors are vendor-reported.

---

## 1. Products students use

| Product | List vs detail | Filters: where, how many visible | Row / card anatomy | Fit or match | Saved / applied / deadlines | Mobile |
|---|---|---|---|---|---|---|
| **LinkedIn Jobs** | Desktop: list on the left, detail on the right. The detail is also a full page at its own URL | A top filter bar shows the most-used filters as drop-down pills, and **All filters** opens everything on one screen ([Social Media Today](https://www.socialmediatoday.com/social-business/changes-linkedin-search-quick-guide), [Guideflow](https://www.guideflow.com/tutorial/how-to-filter-job-search-results-in-linkedin)) | Logo, title, company, location, one insight line | **How you match** compares your profile and resume with the required and preferred qualifications. Premium adds a categorical **high / medium / low** match level ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a7120158), [VentureBeat](https://venturebeat.com/social/linkedin-to-roll-out-1-click-apply-how-you-match-feature-for-job-seekers)) | "Actively reviewing applicants" means a recruiter reviewed applications in the last 2 weeks. The response-time label is hidden when the average is over 21 days ([LinkedIn Help](https://www.linkedin.com/help/learning/answer/a1655396)) | Detail opens full-screen |
| **Internshala** | List, then a detail page. No Apply or Save on cards; both live on the detail page | **Left sidebar:** Profile, Location, Work from home, Part-time, stipend slider, start date, max duration, plus toggles (job offer, fast response, early applicant, for women). Mobile bar: *As per my preferences · Profile · Location · WFH · Part time · Stipend · … · All filters* ([internshala.com](https://internshala.com/internships/computer-science-internship/)) | Title, company, "Actively hiring", logo, location, stipend, duration, skills (+N more), posted time | None | "Be an early applicant" badge. "Save this search as alert" sits next to the result count | Horizontal filter-chip bar |
| **Wellfound** | Rows grouped by category | Search first; personalised filters after sign-up | Logo, title, then **one meta line**: company • type/location • salary • equity • age. Save and Apply at the end of the row ([wellfound.com/jobs](https://wellfound.com/jobs)) | None | Responsiveness signals: "Top 5% of responders", "Responds within a few days" | — |
| **Handshake** | A card opens full job details | The 2025 redesign moved on-site/remote *into* the filters drop-down, so fewer filters are visible at the top ([Handshake updates](https://updates.joinhandshake.com/announcements/ann_ygNA8IAu7S1BQ)) | — | — | Bookmark on the card and beside Apply on the detail page ([Brown CareerLAB guide](https://career-center.brown.edu/sites/default/files/pdfs/A-Guide-to-Searching-for-Jobs-on-Handshake.pdf)) | — |
| **Simplify** | Matches and Job Board | "Preferences and dealbreakers" drive matches ([Simplify help](https://help.simplify.jobs/articles/2485664-using-your-job-matches)) | — | Ranked matches | **Saved and applied jobs land in the Job Tracker** (status, notes, contacts, follow-ups) ([Simplify+ guide](https://help.simplify.jobs/articles/8197013-the-complete-guide-to-simplify)) | — |
| **Huntr** | Board | — | — | — | Default lists **Wishlist · Applied · Interview · Offer · Rejected**, renameable. Kanban, map and metrics views ([Huntr help](https://help.huntr.co/en/articles/13413245-the-job-board), [Huntr tracker](https://huntr.co/product/job-tracker)) | — |
| **Teal** | Tracker | — | — | Excitement rating per job | Stages include Applying, Applied, Negotiating, Accepted ([IU career hub](https://oneillcareerhub.indiana.edu/blog/2021/11/15/how-to-use-teal-a-useful-job-tracker/)) | — |
| **Jobright** | List, then detail | — | Match % on the card | Match Score explained in sections: **Relevant Experience · Seniority · Skills · Potential Gaps**, plus "See Key Requirements" ([jobright.ai](https://jobright.ai/ai-job-match)). Reviewers value the clear percentage and the missing keywords ([G2](https://www.g2.com/sellers/jobright), *secondary*) | — | — |
| **Indeed** | Desktop: details open in a right panel. App: a full detail page ([itechguides](https://www.itechguides.com/indeed-job-search/), *secondary*) | Top bar | — | — | — | Full page |
| **Glassdoor** | Listing beside the full description in one window. Company rating beside each listing ([Onrec](https://onrec.com/news/statistics-and-trends/glassdoor-reinvests-job-search-with-new-industry-leading-search), *secondary, dated*) | — | — | — | — | — |
| **Devfolio** | Cards | Filter by mode, theme or location **through the command palette** ([Devfolio guide](https://guide.devfolio.co/hackers/participate/hackathon-modes)) | Online/Offline tag, then status **Open / Live / "Starts ‹date›"** | — | Status is the deadline signal | — |
| **Devpost** | Cards (site blocked fetch) | Status (open / upcoming / ended), location, themes ([Apify field list](https://apify.com/automation-lab/devpost-scraper), *secondary*) | — | — | — | — |
| **Unstop** | Cards (site blocked fetch) | — | Listings carry prize pool, registration deadline, team size and eligibility ([example listing](https://www.startupgrantsindia.com/competitions/nextgen-hackathon), *secondary*) | — | — | — |

**What this means for Beacon**

1. **Students filter first, and the top facets are the same everywhere:** type, location/remote, stipend and
   deadline/date (Internshala, LinkedIn, Handshake). Everything else hides behind "All filters" (LinkedIn) or a
   drop-down (Handshake 2025).
2. **One meta line works** (Wellfound). Cards with more than about 6 data points are scanned, not read. Internshala's
   card has 11 fields and leans on "+N more".
3. **Match is shown as a band plus reasons, not a raw number:** LinkedIn's high/medium/low with a qualification
   checklist, and Jobright's sections ending in "Potential Gaps". Beacon's bands (Strong 80+, Good 60–79) match the
   common 80/60 tiering.
4. **Saving means tracking** in every tracker students use (Simplify, Huntr "Wishlist", Teal). Beacon currently has
   Save, Add to tracker *and* a Tracker "Saved" column: three names for one intent.
5. **Responsiveness signals matter to students** (LinkedIn's "Actively reviewing", Wellfound's "Top 5% of
   responders"). Beacon's ghost-risk badge does the same job and should stay visible on the row when risk is medium or high.
6. **Hackathon platforms use status words, not dates** ("Open", "Live", "Starts 3 Nov"). Beacon's deadline chip
   should do the same ("6d left", "Closes today", "Opens 3 Nov", "Rolling").
7. **Mobile detail is always full-screen** with the main action pinned (LinkedIn, Indeed).

## 2. Craft references: calm density

| Reference | What to take |
|---|---|
| **Linear** | "The challenge was preserving that rich density of information without letting the interface feel overwhelming". "**Not every element of the interface should carry equal visual weight**". The sidebar is dimmed so the work area leads, with fewer and softer separators, fewer icons, and predictable header layouts ([Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)). Views have a header for filters and display options plus side panels for properties, with list, board, timeline, split and fullscreen modes ([How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)). `F` opens filters, and filters live in the URL ([Linear docs](https://linear.app/docs/filters)). **Peek** (Space) previews an item without leaving the list ([Linear docs](https://linear.app/docs/peek.md)) |
| **Stripe Dashboard** | List → **detail as its own route** with breadcrumbs and a two-column layout. **Create/edit flows use a drawer** ("overlays the current view without interrupting the user's place"). Empty messages change when filters are active. Loading happens *inside* the content so navigation stays usable ([Stripe full-page app patterns](https://docs.stripe.com/stripe-apps/patterns/full-page-apps.md)). Detail pages put **dynamic content in the primary column and static details in the secondary column**, giving "more focus to the dynamic primary content" ([Stripe support](https://support.stripe.com/questions/updates-to-the-customer-detail-page)) |
| **Vercel** | The 2026 navigation uses a resizable sidebar you can hide, the same tabs at team and project level, items ordered by workflow, and a **mobile bottom bar** ([Vercel changelog](https://vercel.com/changelog/dashboard-navigation-redesign-rollout)) |
| **Things 3** | A neutral interface with **colour reserved for meaning** (yellow = Today) ([design guide](https://blakecrosley.com/pt-BR/guides/design/things), *secondary*). **Upcoming** is an agenda that plans the week ahead, with to-dos, deadlines and events together ([Cultured Code](https://culturedcode.com/things/features/)) |
| **Notion Calendar (Cron)** | Typography and whitespace make the hierarchy, with no decoration. Single-key shortcuts, e.g. `T` for today ([design guide](https://blakecrosley.com/de/guides/design/notion-calendar), [efficient.app](https://efficient.app/apps/notion-calendar), *secondary*) |
| **Arc** | The command bar is universal search across tabs, history and actions. Little Arc shows "not every task needs the full browser chrome" ([design guide](https://blakecrosley.com/ja/guides/design/arc), [TechRepublic](https://www.techrepublic.com/article/arc-browser-review/), *secondary*) |
| **Notion** | "What will you use Notion for?" changes the templates and starter workflows you get, so the question *visibly* changes what comes next ([Dock](https://www.dock.us/grow-and-tell/how-notion-manages-multiple-use-cases-in-onboarding), [Candu](https://candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users)) |

**Takeaway.** Calm does not mean empty. It means **unequal weight**: one thing per region leads, and everything
else recedes in contrast, size and colour. Detail is a place you go to (Stripe, LinkedIn mobile), and small edits
happen in an overlay without losing your place (Stripe FocusView).

## 3. Evidence

| Source | Finding used |
|---|---|
| [NN/g — Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Show "only a few of the most important options" first. "**Designs that go beyond 2 disclosure levels typically have low usability.**" "It's rarely a good idea to offer multiple ways to progress to secondary options." Label the trigger so it sets expectations |
| [NN/g — Minimize cognitive load](https://www.nngroup.com/articles/minimize-cognitive-load/) | Remove clutter ("redundant links, irrelevant images, and meaningless typography flourishes slow users down"), reuse familiar patterns, and offload work through defaults and redisplay |
| [NN/g — Saving scroll position](https://www.nngroup.com/articles/saving-scroll-position/) | Losing the scroll position when users move between a list and its details ("pogo-sticking") raises interaction cost. **Save it within a session (about 30–60 min)**, and reset after long gaps or when content has changed, with a visible cue |
| [Baymard — Applied filters](https://baymard.com/blog/how-to-design-applied-filters) | 28% of sites show no overview of applied filters. **Always show applied filters** on desktop and mobile. A count alone performs poorly |
| [Baymard — Promoting filters](https://baymard.com/blog/promoting-product-filters) | 61% of sites don't promote filters. Promoted filters greatly raise filter use. **Keep them in the normal filter area too**, show match counts, and use them sparingly. On mobile, 2–3 fit on a line, so scroll horizontally |
| [NN/g — Mobile faceted search](https://www.nngroup.com/articles/mobile-faceted-search/) | Use a tray over the results rather than a separate screen. Results should update "as soon as the user selects a filter criteria". "The total number of results is always visible" |
| [NN/g — Filters vs facets](https://www.nngroup.com/articles/filters-vs-facets/) | Facets must match what users care about. More options add interaction cost |
| [NN/g — Accordions on desktop](https://www.nngroup.com/articles/accordions-on-desktop/) | Collapse only content users rarely need together. Headings must describe what's hidden. Never hide crucial information |
| [NN/g — Onboarding tutorials vs contextual help](https://www.nngroup.com/articles/onboarding-tutorials/) | Tutorials "interrupt users, don't necessarily improve task performance, and are quickly forgotten" and are "dramatically overused". Prefer **pull revelations** triggered by context, make them easy to dismiss and find again, and don't auto-launch |
| [NN/g — Instructional overlays / coach marks](https://www.nngroup.com/articles/mobile-instructional-overlay/) | Focus on one interaction, show hints one at a time at the right moment, **make hints look different from the UI**, and keep them short and sparse |
| [NN/g — Wizards](https://www.nngroup.com/articles/wizards/) | Use for infrequent setup. Show where the user is in the process, provide explicit Back and Next, reuse prior answers as defaults, and "allow users to exit the wizard midway and save state" |
| [NN/g — Skeleton screens](https://www.nngroup.com/articles/skeleton-screens/) | Use for full-page loads under 10 s, and none for loads under 1 s. **Frame-only skeletons "should not be used"**: a mostly blank screen reads as broken. Shimmer can distract, so respect reduced motion |
| [NN/g — Progress indicators](https://www.nngroup.com/articles/progress-indicators/) | Over about 1 s show an indicator. 2–10 s: looped plus text. **10 s or more: percent-done.** "Updating 3 of 50" works for record series. Give feedback immediately |
| [NN/g — Empty states](https://www.nngroup.com/articles/empty-state-interface-design/) | Communicate status, teach with a learning cue, and give a direct path to the key task |
| [NN/g — Hamburger / hidden navigation](https://www.nngroup.com/articles/hamburger-menus/) | Hidden navigation cut discoverability by more than 20% and made tasks take 15% (mobile) to 39% (desktop) longer. Keep frequently used destinations visible |
| [NN/g — Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/) | Reserve them for serious, hard-to-reverse actions. Overuse trains people to ignore them. Prefer undo |
| [Apple HIG — Loading](https://developer.apple.com/design/human-interface-guidelines/loading) | "**The best content-loading experience finishes before people become aware of it.**" Show placeholders instead of nothing, let people keep working, and use a determinate indicator when the duration is known |
| [Apple HIG — Modality](https://developer.apple.com/design/human-interface-guidelines/modality) | "Present content modally only when there's a clear benefit". "Aim to keep modal tasks simple, short, and streamlined". Always give an obvious way to dismiss |
| [Apple HIG — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Use tabs "to support navigation, not to provide actions". "Avoid overflow tabs". Use badges only for critical information |
| [Apple HIG — Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) | Teach through interactivity. Make it "fast, fun, and optional". Once skipped, don't present it again, but keep it easy to find. "Postpone nonessential setup". Request permissions when the feature is first used |
| [WCAG — Understanding visible controls](https://raw.githack.com/w3c/wcag/e5711d19748fa9feebf9767a277e637f21de8f2d/understanding/22/visible-controls.html) | Controls needed for a task must be discoverable without hover |
| Onboarding cases | Linear: about 7 single-purpose screens, around 1 minute, ending at a blinking cursor in the first issue ([Candu](https://www.candu.ai/blog/linear-onboarding-teardown)). Superhuman: moving setup into opinionated full-screen panels with smart defaults raised completion from about 30% to over 98%, and "if you are going to disturb the user, it needs to be for something extremely valuable" ([First Round Review](https://review.firstround.com/superhuman-onboarding-playbook.md)). Duolingo: delaying sign-up past the first lesson gave about +20% DAU ([Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding)), and the goal question comes first ([Appcues GoodUX](https://goodux.appcues.com/blog/duolingo-user-onboarding)). Headspace: multi-select goals gave about +10% trial conversion (*secondary*, [SozAI summary](https://sozai.app/transcript/studied-1460-onboarding-flows-findings/index.md)), and a critique notes that personalisation steps which don't change what follows feel fake ([redesign case](https://jenniferqian.cargo.site/headspace-redesign-1)). Typeform: one question at a time, with average completion of 47–57% (vendor) ([Typeform help](https://help.typeform.com/hc/en-us/articles/360029615911)). Stripe Apps: onboarding should be "Effortless", only the necessary steps, one Continue per step ([Stripe docs](https://docs.stripe.com/stripe-apps/patterns/onboarding-experience)) |

## 4. Audit of the current build (`docs/ux-audit/before/`)

| # | Finding | Evidence | Principle broken |
|---|---|---|---|
| A1 | **Radar, Deadlines and Alerts are blank in 17 of their 18 captures** (3 screens × desktop/mobile × light/dark/full): no shell and no skeleton. The one that rendered (`alerts--mobile-dark.png`) points to a loading race, not a missing screen. The result for the student is the same: the three most important screens can show nothing | `radar--*.png`, `deadlines--*.png`, `alerts--*.png` (5.8 KB / 7 KB solid-colour files) | P13 |
| A2 | The listing detail route is a placeholder ("This page is on its way.") | `radar-drawer--desktop-light.png` | P4 |
| A3 | **Sources › My sources lists 251 rows** (6 personal plus 245 from packs) in a 9-column table. The 6 rows the student actually manages get lost | `sources--desktop-light--full.png` | P2, P8 |
| A4 | Tracker: **Offer is hidden under "More"** with Rejected and Ghosted. On mobile, about 43% of the first viewport is chrome before the first card (view toggle, add button, stats, nudge banner, stage tabs, column header) | `tracker--desktop-light.png`, `tracker--mobile-light.png` | P1, P8 |
| A5 | Notifications desktop: a 780 px column on a 1440 px page. The time and unread dot float mid-page, and row heights vary | `notifications--desktop-light.png` | P8 |
| A6 | Onboarding "Preferences" is one long form (types, roles, where, cities, stipend…), not a conversation. The live counter read "≈ 2 open listings match so far" at the moment of commitment | `onboarding-preferences--*.png` | P11 |
| A7 | Consent page: the primary [Continue] sits on the 900 px fold line | `welcome--desktop-light.png` | P1 |
| A8 | **Two homes for the AI choice** (Settings › AI & keys *and* › Privacy) and for the resume-to-AI consent | `settings-ai--*.png`, `settings-privacy--*.png` | P3 |
| A9 | The fit breakdown's "Adjust" weights link goes to `/settings`, which has no weights UI. **SPEC §3.1 D sliders are unreachable** | `features/radar/components/listing/FitBreakdown.tsx` (`<Link to="/settings">`) | P3, completeness |
| A10 | **Save · Add to tracker · Tracker "Saved"**: three names for one intent | USERFLOW §3.2, tracker screenshot | P8 |
| A11 | The mobile tab bar has 5 tabs including Alerts (set-and-forget). "Me" opens a sheet (an action), and the Me tab is highlighted while on Sources | `sources--mobile-light.png`, `tracker--mobile-light.png` | P15 |
| A12 | The signal colour is used at once for primary buttons, every toggle, selected cards, badges and progress, so there is no emphasis hierarchy (the visual-system agent owns colour; the structural rule is in P8) | most captures | P8 |

## 5. Principles (applied in `docs/UX-RESTRUCTURE.md`)

| # | Principle | One-line rationale | Source |
|---|---|---|---|
| P1 | **Answer first, controls second.** Every page opens with one sentence or number that answers "what needs me?", then the content, then the controls | Lightens cognitive load and leads with the overview ("Progressive: lead with a high-level overview") | NN/g cognitive load, Stripe full-page patterns |
| P2 | **At most two levels of disclosure.** A control is either visible, or one labelled click away ("More filters", "How we scored this", "Details") | Beyond 2 levels "typically have low usability" | NN/g progressive disclosure |
| P3 | **One home per setting.** Every preference has exactly one place where it is changed. Other places show a summary and link there | "Rarely a good idea to offer multiple ways to progress to secondary options" | NN/g progressive disclosure, audit A8–A9 |
| P4 | **Detail is a place, not a panel.** Listing, tracker item, source, pack and alert each get their own route with Back and a breadcrumb: dynamic content in the main column, static facts at the side. Small edits stay in an overlay | Modality only for brief tasks. Stripe's list→detail and two-column split | Apple HIG modality, Stripe docs |
| P5 | **Never lose the student's place.** Back restores scroll and selection within 30 minutes. Prev/next lets you triage without going back | Pogo-sticking is the main list–detail cost | NN/g saving scroll position |
| P6 | **Filters you can see, with their effect.** Applied filters are always shown as removable chips. Counts appear only when true. Promoted "lens" chips also live in the rail. Results update live | 28% of sites hide applied filters. Promoted filters raise use. Live updates catch over-filtering | Baymard ×2, NN/g mobile faceted |
| P7 | **Explain fit in words, then numbers.** Band name plus top reason on the row, a verdict sentence and a match/missing checklist on the page, bars on request | Students compare qualifications, not decimals (LinkedIn How you match, Jobright gaps) | LinkedIn Help, Jobright |
| P8 | **Element budget, not element removal.** Each row, card and page has a hard budget, and hierarchy comes from unequal weight. Nothing is deleted; extras move to the detail page or one disclosure away | "Not every element should carry equal visual weight" | Linear refresh, NN/g cognitive load |
| P9 | **Visible first, hover second.** Hover only reveals actions that are also reachable by keyboard and a visible "⋯". State (saved, applied) is always visible | Hover-only controls fail touch and WCAG visible-controls | WCAG, KDE HIG discussion |
| P10 | **Teach in context, not up front.** A 5-step optional tour, then one coach mark per screen on first visit, all replayable | Tutorials are overused and forgotten. Pull revelations work | NN/g tutorials + overlays, Apple onboarding |
| P11 | **Ask only what we can't infer, one thing at a time.** Resume first, skip anything known, prefill the rest, and save after every answer | Linear's 1-minute flow, Superhuman's defaults (30% → 98% completion), Typeform, NN/g wizard save-state | Candu, First Round, NN/g wizards |
| P12 | **Do, don't show.** Onboarding ends inside real work, tour steps ask for a real action, and the first save teaches the tracker | People "retain far more when they have directly taken action" | Apple HIG onboarding, First Round |
| P13 | **Loading never looks broken.** Cached content first, then a layout-true skeleton (never a blank frame), then determinate progress past 10 s | "Best loading finishes before people become aware of it". Frame-only skeletons read as broken | Apple HIG loading, NN/g skeletons and progress, audit A1 |
| P14 | **Undo over "Are you sure?".** Confirm only irreversible, destructive actions (delete account, delete source). Everything else is optimistic with undo | Confirmation overuse trains users to ignore it | NN/g confirmation dialogs |
| P15 | **Navigation by frequency.** Daily destinations (Radar, Deadlines, Tracker) are always visible. Set-and-forget areas (Sources, Alerts, Settings) are one level down on mobile. A tab is a destination, never an action | Hidden nav costs more than 20% discoverability, but only for what people use often. Tabs are for navigation, without overflow | NN/g hamburger study, Apple HIG tab bars |
