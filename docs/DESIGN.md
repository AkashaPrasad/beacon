# Beacon — Design contract

Every UI agent follows this document. It sits under `docs/BRIEF.md` (which overrides SPEC) and refines
SPEC §5. Tokens live in `packages/ui/tokens.css`, brand assets in `brand/`, flows in `docs/USERFLOW.md`, and
motion and micro-interactions in `docs/MOTION.md` (authoritative for anything that moves).
If something you need is not specified here, choose the quieter option and record the choice in `docs/DECISIONS.md`.

Contents: 1 Aesthetic · 2 Typography · 3 Colour · 4 Space, shape, depth, density, breakpoints · 5 Motion ·
6 Components · 7 Iconography · 8 Copy · 9 Accessibility · 10 Layouts · 11 Keyboard · 12 Research sources

---

## 1. Aesthetic

**Statement.** Beacon is an instrument panel for a student: editorial-precise, calm and dense. Warm
paper-and-charcoal neutrals carry almost everything. Hierarchy comes from type (a serif display voice over a
quiet grotesk, with numbers in mono), never from colour or decoration. There is exactly one accent, signal
amber, the colour of a light seen across dark water, and it is spent only on what deserves attention: the primary
action, the keyboard cursor, focus, and the moment a signal worth acting on appears. The product feels fast because it is dense and keyboard-first,
and calm because nothing moves, glows or shouts without a reason.

**Principles**

1. **Data is the interface.** Rows, numbers and deadlines are the hero. Chrome recedes (Linear limits
   how much accent feeds its chrome for "a more neutral and timeless appearance").
2. **One accent, spent carefully.** Never use more than one accent-filled button in a region. The fit ramp and
   semantic colours are low-chroma and always come with text.
3. **Every number is explainable.** A score always has a breakdown one click or `Enter` away.
4. **Keyboard first, pointer complete, touch native.** Every action has a shortcut. Every shortcut has a
   visible control. Every control works on a phone.
5. **Honest states.** Every view has loading, empty-with-next-action, error-with-retry and partial
   (warming-up) states, each designed rather than left as defaults.
6. **Motion explains change.** Motion is used for entering, leaving, moving and filling, and never for ambience.

**Hard bans** (a PR that contains any of these is rejected):

- Purple-to-blue (or any multi-hue) gradient hero, and gradient text
- Glassmorphism or backdrop blur used as decoration (blur is allowed only on the modal scrim and the mobile tab bar, at 8 px or less)
- Emoji used as icons, in UI copy, toasts or notifications
- Stock illustrations, 3D blobs, isometric people, sparkle glyphs for AI, "magic" wands
- Copy like "Supercharge X with AI", "Unlock your potential", "Revolutionise", "Seamless"
- Generic SaaS template patterns: hero with centred badge pill + gradient headline + two CTAs + logo wall;
  three-feature icon grids; testimonial carousels; pricing tables
- WebGL/canvas backgrounds (they also break Lighthouse ≥ 95): reactbits Backgrounds, Aceternity
  Aurora/Beams/Sparkles/Vortex/Meteors/Spotlight
- Default Tailwind palette colours (`bg-blue-500` and so on). They are removed from the theme and will not compile
- Confetti or celebration effects, including on Offer

---

## 2. Typography

| Role | Family | Source (self-hosted, `font-display: swap`) | Notes |
|---|---|---|---|
| Display | **Instrument Serif** 400 + italic | `@fontsource/instrument-serif` (OFL) | Only at 24 px and above: landing, page titles (h1), full-page empty-state titles, onboarding step titles. Never for UI controls or numbers |
| UI | **Geist** variable 100–900 | `@fontsource-variable/geist` (OFL) | All UI text. Weights used: 400, 500, 600 only |
| Numbers | **Geist Mono** variable | `@fontsource-variable/geist-mono` (OFL) | Scores, counts, dates, durations, stipends, credit meters, kbd hints. Tabular by design |

Imports (apps/web `main.tsx`): `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`,
`@fontsource/instrument-serif/400.css`, `@fontsource/instrument-serif/400-italic.css`. Preload the latin
Geist 400 woff2 and Instrument Serif 400 woff2 on the landing page only.

**Scale** (rem-based, so `data-font-size` scales it. Tailwind utility = `text-<name>`):

| Token | Family | Size / line-height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `display-xl` | Instrument Serif | 64 / 64 (mobile 44 / 48) | −0.02em | 400 | Landing headline only |
| `display` | Instrument Serif | 48 / 52 (mobile 36 / 40) | −0.015em | 400 | Onboarding step titles, big empty states |
| `h1` | Instrument Serif | 32 / 36 (mobile 28 / 32) | −0.01em | 400 | Page titles (Radar, Tracker…), drawer listing title on 2xl |
| `h2` | Geist | 18 / 24 | −0.011em | 600 | Section headers, drawer title, dialog titles |
| `h3` | Geist | 15 / 20 | −0.006em | 600 | Card titles, settings group titles |
| `body-lg` | Geist | 16 / 24 | −0.006em | 400 | Onboarding and landing copy, consent screen |
| `body` | Geist | 14 / 20 | 0 | 400 / 500 | Default UI text, row titles (500) |
| `small` | Geist | 13 / 18 | 0 | 400 | Row meta lines, helper text, table cells |
| `caption` | Geist | 12 / 16 | +0.005em | 400 / 500 | Chips, badges, timestamps, tooltips |
| `label` | Geist | 11 / 16 | +0.06em | 500, UPPERCASE | Filter rail group labels and table column headers only |
| `mono-lg` | Geist Mono | 24 / 32 | −0.02em | 500 | Tracker analytics numbers, credit meter value |
| `mono` | Geist Mono | 13 / 20 | 0 | 400 / 500 | Scores in drawer, counts, stipends |
| `mono-sm` | Geist Mono | 12 / 16 | 0 | 400 | Deadlines (`6d left`), relative times, kbd |

Rules: sentence case everywhere (including titles and buttons). Maximum line length is `--prose-max` (40 rem) for
any paragraph. Truncate titles with an ellipsis at one line in compact density and two lines in comfortable density, and show the full
text in the tooltip and the drawer. Indian number formatting for money (`₹45,000/mo`, or `₹45k/mo` in rows), with ISO-like
dates in mono (`Tue 28 Oct`).

---

## 3. Colour

### 3.1 Why signal amber

The accent is **signal amber**: `#F5A524` in light and `#FFB547` in dark. A beacon is a light that cuts through noise,
and amber is the one hue that reads as *light* rather than as a brand sticker. It belongs to the same warm family as the
paper-and-charcoal neutrals, so the palette stays one material. It is ownable in a category of blue, purple and green
products. And it gives the dark theme its character: one warm lamp in a calm, dark instrument. A deep teal was rejected because it
collides with the green fit ramp. Rufous, the previous accent, was retired: it now sits too close to the warning colour.

**Two roles, because bright amber cannot be text on paper (2:1):**

- `accent` is **the light itself**, used for fills only: primary buttons (always with lamp-black `accent-fg`
  text), the selected segment and toggle states, the app tile, and the beacon dot in brand moments.
- `accent-strong` is **accent you read**: links, accent-coloured icons, the 2 px keyboard-cursor bar, the active-tab
  underline, the timeline's today line and the focus ring. In light it is a deep amber (#945300, 5.8:1). In dark it is
  identical to `accent`.
- Lint rule: `text-accent`, `border-accent`, `outline-accent` and `stroke-accent` are not allowed in app code. Use the `-strong`
  variant. `bg-accent` must always be paired with `text-accent-fg`.

**Collisions handled.** Warning moves to orange-red (hue 19°: #B3410E / #FF9466). Danger stays crimson (hue 352°), with
its own `danger-fg`. So the accent (37°), warning (19°) and danger (352°) are spread apart, every status carries an icon and
a word, and **the accent is never used for status**.

### 3.2 Tokens (light / dark)

All values are in `packages/ui/tokens.css`. Utilities are `bg-*`, `text-*`, `border-*`, `outline-*`, `fill-*` and `stroke-*`
with the token name, for example `bg-surface-raised` or `text-fg-tertiary`.

| Group | Token | Light | Dark | Use |
|---|---|---|---|---|
| Background | `bg` | #F7F6F3 | #131110 | App canvas, top bar, rail |
| | `surface` | #FCFBF9 | #191716 | Feed, tables, drawer, panels |
| | `surface-raised` | #FFFFFF | #201E1C | Cards, inputs, Kanban cards, chips on surface |
| | `surface-sunken` | #F0EEEA | #0F0E0D | Wells, tracks, skeleton base, weekend columns |
| | `surface-hover` | #F2F0EC | #211F1D | Row and menu-item hover |
| | `surface-active` | #EBE8E3 | #2A2725 | Selected or keyboard-cursor row, pressed |
| | `overlay` | #FFFFFF | #272422 | Popovers, menus, dialogs, palette, toasts |
| | `scrim` | rgb(28 25 23 / .32) | rgb(0 0 0 / .6) | Modal backdrop |
| Text | `fg` | #1C1917 | #EDEAE6 | Primary |
| | `fg-secondary` | #57524C | #B3ADA6 | Company names, meta, labels |
| | `fg-tertiary` | #736C65 | #968F88 | Timestamps, placeholders, hints (still AA) |
| | `fg-disabled` | #A9A39C | #5C5651 | Disabled only |
| Border | `border-subtle` | #ECE9E4 | #24211F | Row dividers |
| | `border` | #E1DDD7 | #2E2B28 | Cards, panels, popovers |
| | `border-strong` | #CDC8C0 | #3C3834 | Hover borders, emphasised separators |
| | `border-input` | #8E877F | #6E6760 | Form control outlines (3:1 for WCAG 1.4.11) |
| Accent | `accent` | #F5A524 | #FFB547 | **Fills only**: primary buttons, selected segment, app tile, beacon dot |
| | `accent-hover` | #E89A14 | #FFC266 | Fill hover |
| | `accent-active` | #DB8F0C | #F5A62E | Fill pressed |
| | `accent-strong` | #945300 | #FFB547 | **Accent you read**: links, accent icons, cursor bar, tab underline, today line |
| | `accent-subtle` | #FDF2DC | #352710 | Selected chip and toggle backgrounds, "new" highlight |
| | `accent-subtle-fg` | #7A4800 | #FFC873 | Text on `accent-subtle` |
| | `accent-fg` | #1F1505 | #1F1505 | Lamp black: text and icons on `accent` fills |
| | `focus-ring` | = accent-strong | = accent | Focus outline |
| Semantic | `success` / `-subtle` | #1E7A4C / #E5F2EA | #5DBE8B / #132A1E | Healthy source, applied, saved confirmations |
| | `warning` / `-subtle` | #B3410E / #FCEBE2 | #FF9466 / #37200F | Orange-red. Possibly stale, slow source, deadline in 1–3 d, credit meter ≥ 80 % |
| | `danger` / `-subtle` / `-fg` | #B42338 / #FBE8EB / #FFFFFF | #F27D8E / #36171C / #1A0D07 | Likely ghost, failing source, due today, destructive (`danger-fg` = text on a danger fill) |
| | `info` / `-subtle` | #2D5E9A / #E7EEF7 | #82A9E2 / #16233A | Neutral notices, AI-off notice |
| Tooltip | `tooltip` / `tooltip-fg` | #1C1917 / #F7F6F3 | #34302D / #EDEAE6 | Inverted in light |
| Avatars | `avatar-1…6` | warm tints | dark tints | Company letter-avatar backgrounds (text `fg-secondary`) |

Accent presets (Settings > Appearance): `amber` (default, brand), `teal`, `cobalt` and `ink`, set with `data-accent` on `<html>`.
Every preset defines `accent-strong` too, and all pass AA in both themes (§3.4). The landing page, OG image and app icon always use
signal amber.

### 3.3 Fit-score ramp and ghost risk

The ramp is **monotonic in lightness** (darker means better in light, brighter means better in dark), so it survives greyscale and
colour-vision deficiency. Hue moves from warm grey to green with low chroma, so it never competes with the accent.
**It is never shown without the number, and the band name is always available** (visible label or `aria-label` plus tooltip).

| Band | Range | Name | Token | Light | Dark | Subtle (chip bg) L / D |
|---|---|---|---|---|---|---|
| low | 0–39 | **Long shot** | `fit-low` | #736C65 | #8F8881 | #F3F1EE / #24211F |
| mid | 40–59 | **Worth a look** | `fit-mid` | #56695E | #93A89B | #ECF1ED / #1E2521 |
| good | 60–79 | **Good fit** | `fit-good` | #256B4F | #62B892 | #E4F1EB / #16271F |
| great | 80–100 | **Strong fit** | `fit-great` | #16613F | #7FD8AC | #DCEFE4 / #12291D |
| track | | | `fit-track` | #E1DDD7 | #2E2B28 | ring background |

Eligibility hard-fail caps the score at 35 (SPEC §4). Show the ring in `fit-low` with a lucide `Ban` icon next to it
and the label "Not eligible: graduating 2027 only".

| Ghost risk | Tokens | Row treatment | Label | Icon |
|---|---|---|---|---|
| low | `ghost-low` (= fg-tertiary) | nothing in rows. Drawer shows "Looks active" | Looks active | `ShieldCheck` |
| medium | `ghost-med` (= warning) + `-subtle` | badge | Possibly stale | `Clock` |
| high | `ghost-high` (= danger) + `-subtle` | badge, plus a −20 penalty already in the score | Likely ghost | `Ghost` |

Deadline colours (text only, always with words): more than 14 d `deadline-far`, 4–14 d `deadline-near`, 1–3 d
`deadline-soon` (warning), under 24 h `deadline-today` (danger). Closed listings show `Closed 2d ago` in `fg-disabled` and
drop to the bottom.

### 3.4 Contrast (WCAG 2.2 AA, computed from tokens.css)

Text needs ≥ 4.5:1. Non-text (input borders, focus ring, ring arcs) needs ≥ 3:1. Every pair below passes.

| Pair | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `fg` on `bg` | #1C1917 / #F7F6F3 | 16.18 | #EDEAE6 / #131110 | 15.70 |
| `fg-secondary` on `surface` | #57524C / #FCFBF9 | 7.47 | #B3ADA6 / #191716 | 8.03 |
| `fg-tertiary` on `surface` | #736C65 / #FCFBF9 | 5.00 | #968F88 / #191716 | 5.60 |
| `fg-tertiary` on `overlay` | #736C65 / #FFFFFF | 5.17 | #968F88 / #272422 | 4.83 |
| `border-input` on `surface` (non-text) | #8E877F / #FCFBF9 | 3.43 | #6E6760 / #191716 | 3.21 |
| `accent-fg` on `accent` | #1F1505 / #F5A524 | 8.81 | #1F1505 / #FFB547 | 10.24 |
| `accent-fg` on `accent-hover` | #1F1505 / #E89A14 | 7.76 | #1F1505 / #FFC266 | 11.27 |
| `accent-fg` on `accent-active` | #1F1505 / #DB8F0C | 6.80 | #1F1505 / #F5A62E | 8.89 |
| `accent-strong` on `surface` | #945300 / #FCFBF9 | 5.81 | #FFB547 / #191716 | 10.17 |
| `accent-strong` on `bg` | #945300 / #F7F6F3 | 5.56 | #FFB547 / #131110 | 10.72 |
| `accent-strong` on `overlay` | #945300 / #FFFFFF | 6.01 | #FFB547 / #272422 | 8.78 |
| `accent-strong` on `accent-subtle` | #945300 / #FDF2DC | 5.41 | #FFB547 / #352710 | 8.25 |
| `accent-subtle-fg` on `accent-subtle` | #7A4800 / #FDF2DC | 6.87 | #FFC873 / #352710 | 9.50 |
| `focus-ring` on `bg` (non-text) | #945300 / #F7F6F3 | 5.56 | #FFB547 / #131110 | 10.72 |
| `focus-ring` on `surface` (non-text) | #945300 / #FCFBF9 | 5.81 | #FFB547 / #191716 | 10.17 |
| `success` on `success-subtle` | #1E7A4C / #E5F2EA | 4.62 | #5DBE8B / #132A1E | 6.68 |
| `warning` on `surface` | #B3410E / #FCFBF9 | 5.52 | #FF9466 / #191716 | 8.23 |
| `warning` on `warning-subtle` | #B3410E / #FCEBE2 | 4.93 | #FF9466 / #37200F | 7.04 |
| `danger` on `danger-subtle` | #B42338 / #FBE8EB | 5.51 | #F27D8E / #36171C | 6.25 |
| `danger-fg` on `danger` | #FFFFFF / #B42338 | 6.49 | #1A0D07 / #F27D8E | 7.33 |
| `info` on `info-subtle` | #2D5E9A / #E7EEF7 | 5.65 | #82A9E2 / #16233A | 6.53 |
| `fit-low` on `surface` | #736C65 / #FCFBF9 | 5.00 | #8F8881 / #191716 | 5.11 |
| `fit-mid` on `surface` | #56695E / #FCFBF9 | 5.68 | #93A89B / #191716 | 7.07 |
| `fit-good` on `surface` | #256B4F / #FCFBF9 | 6.16 | #62B892 / #191716 | 7.48 |
| `fit-great` on `surface` | #16613F / #FCFBF9 | 7.21 | #7FD8AC / #191716 | 10.48 |
| `fit-low` on `fit-low-subtle` | #736C65 / #F3F1EE | 4.59 | #8F8881 / #24211F | 4.58 |
| `fit-low` on `fit-track` (non-text) | #736C65 / #E1DDD7 | 3.82 | #8F8881 / #2E2B28 | 4.02 |
| `tooltip-fg` on `tooltip` | #F7F6F3 / #1C1917 | 16.18 | #EDEAE6 / #34302D | 10.90 |

Presets (`accent-strong` on surface, light / dark): teal 5.87 / 8.04, cobalt 6.31 / 7.47, ink 14.52 / 13.85. Button text on
each preset is ≥ 6.0, and its subtle-fg on subtle is ≥ 6.9. `prefers-contrast: more` steps borders and tertiary text up one level
automatically.

---

## 4. Space, shape, depth, density, breakpoints

**Spacing.** 4-pt grid: `--spacing: 0.25rem`, so `p-1` = 4 px. Allowed steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12,
16, 20, 24 (2 px to 96 px). Defaults: control internal padding 12 px (8 in compact), row padding 12 × 16, card padding
`p-card` (12 or 8), section gap 24, page gutter `px-gutter` (24 desktop, 16 mobile).

**Radius.** `rounded-xs` 4 (chips, kbd, checkbox) · `rounded-sm` 6 (buttons, inputs, badges, logo tiles) ·
`rounded-md` 8 (cards, Kanban cards, menu items) · `rounded-lg` 12 (popover, dialog, palette, toasts) ·
`rounded-xl` 16 (bottom-sheet top corners, landing feed frame) · `rounded-full` (avatars, ring, toggles).
Nested radii shrink outward-in: an inner radius equals the outer radius minus the padding.

**Shadows.** There are three levels, and they are used only for things that float. Resting cards use a border and no shadow.

| Token | Use |
|---|---|
| `shadow-sm` | Kanban card on hover, sticky header after scroll, dragged timeline pill |
| `shadow-md` | Popover, dropdown, select, hover card, toast, non-modal drawer at lg |
| `shadow-lg` | Dialog, command palette, bottom sheet, card being dragged |

In dark, shadows include a 1 px white-alpha hairline because black shadows vanish on charcoal.

**Z-index** (utilities `z-<name>`): base 0 · raised 1 · sticky 10 · rail 20 · topbar 30 · drawer 40 · scrim 50 ·
modal 60 · popover 70 · palette 80 · coachmark 85 · toast 90 · tooltip 100. Popovers sit above modals because they
open from them.

**Density** (`data-density` on `<html>`, Settings > Appearance, default comfortable):

| | Comfortable | Compact |
|---|---|---|
| Radar row `h-row` | 64 px: two lines (title · company / meta + chips) | 44 px: one line, chips hidden, meta truncated |
| Table row `h-row-table` | 44 px | 36 px |
| Control `h-control` / `-sm` / `-lg` | 36 / 28 / 44 | 32 / 24 / 40 |
| Card padding `p-card` | 12 | 8 |
| Score ring in rows | 28 px with band label under it | 24 px, label in tooltip only |
| Top bar | 48 | 44 |

On coarse pointers, controls never go below 44 px whatever the density. Phones (< 640 px) force `h-control` to 44.

**Breakpoints** (Tailwind defaults, restated in tokens):

| Name | Min width | Layout |
|---|---|---|
| base | 0 | Phone: bottom tab bar, filters and detail as bottom sheets, swipe rows |
| `sm` | 640 | Large phone: same, two-column onboarding forms |
| `md` | 768 | Tablet: top nav replaces the tab bar. Filter rail = left Sheet, detail = right Sheet (modal) |
| `lg` | 1024 | Desktop: rail inline and collapsible. Detail drawer overlays the feed (non-modal, `shadow-md`) |
| `xl` | 1280 | Three panes: rail 240 · feed (min 520) · drawer 440 pushes the feed |
| `2xl` | 1536 | Drawer widens to 560 (`w-drawer-wide`). Feed caps at 880 and centres |

---

## 5. Motion

**`docs/MOTION.md` is the authoritative spec** (springs per use, interaction states, interruptibility, the landing
storyboard, reduced-motion equivalents and budgets). Constants live in `packages/ui/src/motion.ts` (`springs`,
`variants`, `durations`, `cssSpring`, helpers). Never inline ad-hoc values. In summary:

- Library: Motion (`motion/react`) through `LazyMotion` + `m.*`. Load `domAnimation` everywhere, and `domMax` only on routes
  that use `layout` or drag (Radar drawer, Tracker).
- CSS tokens: `--duration-fast` 120 ms, `--duration-base` 180 ms, `--duration-slow` 240 ms, `--duration-fade` 120 ms, and
  `--ease-spring`. Product UI never exceeds 240 ms of perceived duration (springs use `visualDuration`). The landing page's
  scroll-linked scenes are driven by scroll, not time.
- Springs: `press` (0.10, bounce 0) · `release` (0.22, 0.2) · `snappy` (0.18, 0.1) · `smooth` (0.24, 0) · `gentle` (0.24, 0.15)
  · `lift` (0.16, 0). Data (score ring, counts, bars) always uses bounce 0, because a score must never overshoot its value.
- Only transform and opacity animate (plus `pathLength` / stroke-dashoffset, `clip-path` and outline-offset, as listed in MOTION.md).
  Never animate width or height, box-shadow, blur or layout properties.
- Everything is interruptible and retargets from its current position and velocity. Direct manipulation (drag, swipe, slider) tracks the pointer 1:1.
- Reduced motion (`prefers-reduced-motion` or `data-motion="reduced"`): movement is removed and opacity crossfades
  stay. Each pattern's equivalent is listed in MOTION.md.

---

## 6. Components

### 6.0 Setup rules for UI agents

1. **shadcn/ui, Radix variant** (`ui.shadcn.com/docs/components/radix/<slug>`), copied into
   `apps/web/src/components/ui`. Do not mix in the Base UI variants except where a third-party block
   requires them (the Dice UI Kanban needs `@base-ui/react`, which is acceptable because it is code-split to `/tracker`).
2. **Accent rename after every `shadcn add`.** In shadcn, `accent` means a neutral hover background. In Beacon,
   `accent` is the brand colour. Run this on `components/ui/` only:
   `sed -i '' -E 's/\bbg-accent\b/bg-surface-hover/g; s/\btext-accent-foreground\b/text-fg/g' <files>`.
   Every other shadcn alias (`background`, `primary`, `muted`, `popover`, `ring`, `input`, `destructive`, `sidebar-*`,
   `chart-*`) is mapped in tokens.css and works unchanged.
3. Replace shadcn's `focus-visible:ring-[3px] ring-ring/50` with `focus-visible:focus-ring`, or use `focus-ring-inset`
   inside rows and cells (both utilities are defined in tokens.css).
4. `@import '@kestrel/ui/tokens.css'` comes right after `@import 'tailwindcss'`. The default palette is removed, and `dark:` and
   `compact:` variants follow the `<html>` attributes.
5. Theme bootstrap: an inline script in `index.html`, before any CSS, reads `localStorage['beacon:appearance']`
   (`{theme, accent, density, fontSize, motion}`) and sets `class="dark"`, `data-theme`, `data-accent`, `data-density`,
   `data-font-size` and `data-motion` on `<html>`, so there is no flash. If a CSP is added, hash this script.
6. 21st.dev blocks install with `npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"`
   (free accounts have a daily limit). Alternatively, copy the TSX from the component page. Check the license on each block, and use **MIT only**.
7. After importing a block, delete its decorative extras (gradients, glows, blur, sparkles) and remap every colour to tokens.
8. Libraries: `@tanstack/react-virtual` (feed, tables > 100 rows), `@tanstack/react-table`, `cmdk`, `sonner`,
   `vaul`, `@dnd-kit/*`, `lucide-react`, `motion`. No chart library on first load. If a chart is unavoidable, lazy-load
   shadcn Chart (Recharts) inside Tracker only. JS budget: ≤ 250 kB gz first load, code-split by route.

### 6.1 Screen → component map

| Screen / element | Base | Source | Adaptation to Beacon |
|---|---|---|---|
| **Landing hero: live radar** | reactbits **Animated List** + our `RadarRow` | [reactbits.dev/components/animated-list](https://reactbits.dev/components/animated-list) | Keep only the insert-at-top mechanic. Rows are real `RadarRow`s with seeded data; strip gradients and scale effects; rows assemble and go live exactly as in MOTION.md §8 L1 (new row every 2.4 s with the beacon ping); pauses on hover, focus, hidden tab and reduced motion. The frame is `surface` + `border` + `shadow-md` + `rounded-xl` with a CSS `mask-image` fade at the bottom (alpha mask, not a colour gradient) |
| Landing, below fold: pinned scroll scenes | own scenes on Motion `useScroll` / `useTransform`; Aceternity **Sticky Scroll Reveal** as a structural reference only | [ui.aceternity.com/components/sticky-scroll-reveal](https://ui.aceternity.com/components/sticky-scroll-reveal), [motion.dev scroll](https://motion.dev/docs/react-scroll-animations) | Built from real components (chips, `RadarRow`, `ScoreRing`, `WeekStrips`, weight sliders) and storyboarded in MOTION.md §8: L2 Sources → Fit → Alerts, L3 the timeline sweep, L4 the live weights explainer, L6 the finale. No gradient backgrounds. Static stacked frames on reduced motion |
| Sign in | shadcn **Button** | [ui.shadcn.com/docs/components/radix/button](https://ui.shadcn.com/docs/components/radix/button) | `lg` secondary button with the official Google "G" mark (the brand-guideline asset; the one non-lucide icon allowed) and the label "Continue with Google" |
| Onboarding stepper | own `StepHeader` (shadcn **Progress** + **Kbd**) | [radix/progress](https://ui.shadcn.com/docs/components/radix/progress), ref: [reactbits Stepper](https://reactbits.dev/components/stepper) | Three labelled steps ("1 Resume · 2 Preferences · 3 Sources"), a 2 px progress line in `accent-strong`, "Skip for now" ghost button, and `Enter` / `Esc` hints. Reactbits Stepper is used only as a reference for step transitions (x 8→0 + fade, `springs.smooth`) |
| Resume upload | 21st.dev **File Drop Zone** (MIT) | [21st.dev/@joseestevez520/components/file-drop-zone](https://21st.dev/@joseestevez520/components/file-drop-zone) | Accept `.pdf,.docx` up to 5 MB. Drag-over shows a `border-strong` dashed outline and `surface-hover` (no glow). Paste support kept. After the drop, the parsed preview streams in beside it (USERFLOW §1.4) |
| Forms (onboarding, profile, settings, alerts) | shadcn **Field**, **Input**, **Input Group**, **Textarea**, **Combobox**, **Select**, **Slider**, **Switch**, **Toggle Group**, **Radio Group** | [radix/field](https://ui.shadcn.com/docs/components/radix/field), [radix/combobox](https://ui.shadcn.com/docs/components/radix/combobox), [radix/slider](https://ui.shadcn.com/docs/components/radix/slider), [radix/toggle-group](https://ui.shadcn.com/docs/components/radix/toggle-group) | Label above the control, helper text in `small fg-tertiary`, errors in `small danger` with an `AlertCircle` icon. Controls use `h-control`, `rounded-sm`, `border-input` and `bg-surface-raised` |
| App shell nav | shadcn **Navigation Menu** (desktop), own `TabBar` (mobile) | [radix/navigation-menu](https://ui.shadcn.com/docs/components/radix/navigation-menu) | Text tabs in the top bar (`body` 500, `fg-secondary`). The active tab is `fg` with a 2 px `accent-strong` underline. The mobile tab bar uses `bg/90` with an 8 px blur (the one allowed blur), 20 px icons and `caption` labels |
| Radar filter rail | shadcn **Sidebar** (`collapsible="offcanvas"`) + **Collapsible** + **Checkbox** + **Slider** | [radix/sidebar](https://ui.shadcn.com/docs/components/radix/sidebar) | Groups get `label`-style headers with counts in mono. Each group can be collapsed. `[` toggles the rail. Active filters also appear as removable chips in the toolbar. The rail becomes a Sheet below lg and a bottom sheet on mobile |
| Radar three-pane layout | shadcn **Resizable** | [radix/resizable](https://ui.shadcn.com/docs/components/radix/resizable) | Only at xl and above. The drawer is resizable 360–640 and the width persists per user. Handles are 1 px `border` lines with a 8 px hit area |
| Radar feed | own `RadarFeed` = `@tanstack/react-virtual` + shadcn **Item** primitives | [radix/item](https://ui.shadcn.com/docs/components/radix/item) | See the `RadarRow` spec (§6.2). It uses `role="feed"`, rows are `article`s, dividers are `border-subtle`, and there are no gaps or cards |
| Toolbar fit threshold | shadcn **Slider** | [radix/slider](https://ui.shadcn.com/docs/components/radix/slider) | 120 px wide with steps of 5. The value is in mono beside it ("≥ 60"). The thumb is filled with the band colour of the current value |
| View switch (List / Timeline / Board) | shadcn **Toggle Group** | [radix/toggle-group](https://ui.shadcn.com/docs/components/radix/toggle-group) | Icons plus text at lg and above, icons only below. Keys `1` `2` `3` |
| Detail drawer | xl: own push panel. lg: non-modal panel. md: shadcn **Sheet**. Mobile: shadcn **Drawer** (Vaul) | [radix/sheet](https://ui.shadcn.com/docs/components/radix/sheet), [radix/drawer](https://ui.shadcn.com/docs/components/radix/drawer) | Sticky header (logo 40, title `h2`, company, actions); sections in the order given in §6.2; `Esc` closes and returns focus to the row; `]` toggles |
| Company hover preview | shadcn **Hover Card** | [radix/hover-card](https://ui.shadcn.com/docs/components/radix/hover-card) | Hovering the company name for 500 ms shows open roles, your response rate there, and your tracker history |
| Deadline timeline | own `WeekStrips` (CSS grid) + **Badge** pills + `@dnd-kit` | principles: Notion Calendar (§12) | Spec in §10.3. Aceternity **Timeline** was evaluated and rejected: it is a vertical scroll-beam storytelling component, not a calendar |
| Tracker Kanban | 21st.dev **Dice UI Kanban** (MIT, @dnd-kit, keyboard) | [21st.dev/@diceui/components/kanban](https://21st.dev/@diceui/components/kanban) | Columns use `surface-sunken` with `rounded-lg`. Cards use `KanbanCard` (§6.2). Remove its default overlay styles. Add the custom announcements (§9) and a "Move to…" menu on every card |
| Tracker table view | shadcn **Data Table** (TanStack Table) | [radix/data-table](https://ui.shadcn.com/docs/components/radix/data-table) | Same columns as the card fields. Status is an inline Select. Sortable headers in `label` style |
| Tracker analytics header | reactbits **Count Up** | [reactbits.dev/text-animations/count-up](https://reactbits.dev/text-animations/count-up) (`npx shadcn@latest add @react-bits/CountUp-TS-TW`) | Four stats in `mono-lg` with a `caption` label. Count-up runs at 0.24 s on first view only. "Best sources" is a CSS bar list, not a chart |
| Sources table | shadcn **Data Table** + **Switch** + **Badge** + **Dropdown Menu** | [radix/data-table](https://ui.shadcn.com/docs/components/radix/data-table) | Health dot plus a word, mono numbers right-aligned, and an expandable error row (§10.5) |
| Add-source modal | shadcn **Dialog** + **Input Group** + **Spinner** + **Item** | [radix/dialog](https://ui.shadcn.com/docs/components/radix/dialog), [radix/input-group](https://ui.shadcn.com/docs/components/radix/input-group), [radix/spinner](https://ui.shadcn.com/docs/components/radix/spinner) | Live detection is debounced 400 ms after a valid URL. The result line is in mono, for example "Detected: Greenhouse board `stripe` → 142 jobs", followed by 3 preview rows |
| Credit meter | shadcn **Progress** | [radix/progress](https://ui.shadcn.com/docs/components/radix/progress) | 4 px bar on `surface-sunken`. Fill is `fg-secondary`, `warning` at ≥ 80 % and `danger` at 100 %, always with "312 / 500 credits today" in mono |
| Alerts rule builder | own `SentenceBuilder` = shadcn **Popover** + **Command** (combobox tokens) + **Switch** | [radix/popover](https://ui.shadcn.com/docs/components/radix/popover), [radix/command](https://ui.shadcn.com/docs/components/radix/command) | The rule reads as a sentence: *When* [fit ≥ 80] *and* [type is Internship] *and* [deadline ≤ 14 days] *→* [Push, instantly]. Each bracket is a `rounded-xs` token button in `accent-subtle`. `+ condition` appends `and …`. Channels are **Web push and In-app only** (BRIEF #1). A live count shows "Would have matched 6 listings in the last 7 days" |
| Notification centre | shadcn **Popover** + **Tabs** + **Item** | [radix/tabs](https://ui.shadcn.com/docs/components/radix/tabs) | Bell in the top bar with an unread count in mono. Tabs: All / Deadlines / Nudges. Each item has an icon, text and relative time. "Mark all read" |
| Profile | shadcn **Field** + **Badge** + **Toggle Group** (proficiency) + **Tabs** (Edit / Preview) | principles: Read.cv (§12) | Two-column ledger: `label` column 160 px on the left, content on the right. Name in `h1` serif. Skill chips with a 3-step proficiency (Learning / Working / Strong). "What recruiters see" preview is read-only |
| Settings | shadcn **Tabs** (vertical at lg and above) + **Field** + **Radio Group** + **Select** + **Switch** + **Input Group** (API key with reveal/copy) + **Alert Dialog** (delete account) | [radix/tabs](https://ui.shadcn.com/docs/components/radix/tabs), [radix/alert-dialog](https://ui.shadcn.com/docs/components/radix/alert-dialog) | Layout in §10.6. Every change saves on change, with an inline "Saved" `caption success` that fades after 1.5 s. No Save buttons, except for the API key |
| Command palette | shadcn **Command** (cmdk) in **Dialog**. Hook and hint patterns from 21st.dev **Command Menu** (MIT) | [radix/command](https://ui.shadcn.com/docs/components/radix/command), [21st.dev/@uvain/components/command-menu-palette](https://21st.dev/@uvain/components/command-menu-palette) | Raycast pattern: 640 px wide and 56 px input. Groups: Listings (fuzzy search over title/company), Go to, Actions, Views, Settings. Each item shows its shortcut as `Kbd` on the right. The footer is an action bar showing the primary action ("Open ↵"), "Actions ⌘K" (a nested action panel for the selected listing: Save, Hide, Track, Apply, Copy link) and "Esc". `aria-live` reports the result count |
| Toasts | shadcn **Sonner** | [radix/sonner](https://ui.shadcn.com/docs/components/radix/sonner) | `overlay` background, `border`, `shadow-md`, `rounded-lg`, `body` text. A status icon sits on the left in semantic colour. The action button is a ghost `accent-strong` text button ("Undo"). Bottom-right at 16 px on desktop; bottom-centre above the tab bar on mobile. Durations: 5 s, 6 s for undo, errors 8 s with Retry. At most 3 visible. **No `richColors`** |
| Score ring | own `ScoreRing` (SVG) + reactbits Count Up | — | Spec in §6.2 |
| Empty states | shadcn **Empty** (`EmptyMedia variant="icon"`) | [radix/empty](https://ui.shadcn.com/docs/components/radix/empty) | Lucide icon at 20 in a 40 px `surface-sunken` `rounded-md` tile, title in `h3` (or `display` for full-page empties), one sentence, one primary action and at most one secondary. Copy is in §8 |
| Skeletons | shadcn **Skeleton** | [radix/skeleton](https://ui.shadcn.com/docs/components/radix/skeleton) | Skeletons match the real row geometry exactly (logo square, two text bars at 60 % and 40 %, ring circle). Show 8 rows. Appear only after 150 ms to avoid flashing |
| Kbd hints | shadcn **Kbd** | [radix/kbd](https://ui.shadcn.com/docs/components/radix/kbd) | `mono-sm`, 20 px tall, `rounded-xs`, `border`, `surface-sunken`. Tooltips always pair the action with its key ("Save  S") |
| Coach marks | shadcn **Popover** (controlled) + own `Tour` | [radix/popover](https://ui.shadcn.com/docs/components/radix/popover) | 4 steps (USERFLOW §1.7). 280 px wide, with "1 of 4", Next (`→`), Skip tour (`Esc`), and an arrow stem. No dark overlay: the target gets a 2 px `accent-strong` outline |
| Tooltips | shadcn **Tooltip** | [radix/tooltip](https://ui.shadcn.com/docs/components/radix/tooltip) | `tooltip` colours, `caption`, `rounded-sm`, 6 px stem (the only floating element with a stem, following Geist materials) |
| Mobile swipe rows | reactbits **Swipe Row** (`npx shadcn@latest add @react-bits/SwipeRow-TS-TW`), rebuilt on Motion `drag="x"` | [reactbits.dev/micro/swipe-row](https://reactbits.dev/micro/swipe-row) | Swipe right = Save (reveals `accent-subtle` with a `Bookmark` icon and "Save"). Swipe left = Hide (`surface-active` with an `EyeOff` icon and "Hide"). The threshold is 30 % of width or a 500 px/s velocity. Light haptic (`navigator.vibrate(8)`) where supported. Disable its delete-on-full-swipe behaviour: a full swipe performs the action and shows an undo toast. Each action also appears in the row's `⋯` menu |
| Context menu on rows | shadcn **Context Menu** | [radix/context-menu](https://ui.shadcn.com/docs/components/radix/context-menu) | Right-click a row to get the same actions as the palette action panel, with their shortcuts |

**Evaluated and rejected** (do not import): reactbits Backgrounds (all of them, including [Radar](https://reactbits.dev/backgrounds/radar)),
Spotlight Card, Magic Bento, Glass Surface and Fluid Glass; Aceternity Background Beams, Aurora, Spotlight, Sparkles, 3D Card,
Bento Grid, Timeline, File Upload (its grid background and motion are decoration) and Placeholders And Vanish Input. The reasons are the
bans in §1 and the Lighthouse ≥ 95 budget.

### 6.2 Beacon components (specs)

**`RadarRow`**, the most important component in the product.

```
comfortable (h-row = 64)
┌─┬──────┬──────────────────────────────────────────────────────────────────────┬────┬─────────┬──────┐
│▌│[logo]│ Platform Engineering Intern · Northwind Labs                         │ G  │ 6d left │ (86) │
│ │  28  │ Remote · ₹45k/mo · 2d ago · Greenhouse  [Go][Postgres][2027] –Docker │    │         │Strong│
└─┴──────┴──────────────────────────────────────────────────────────────────────┴────┴─────────┴──────┘
 ▌ = 2 px accent-strong cursor bar (keyboard cursor only) · G = ghost badge slot (20 px, empty when risk is low)
compact (h-row = 44): [logo 20] Title · Company · Remote · ₹45k/mo ··········  G  6d left  (86)
```

- Line 1: title `body` 500 `fg` (truncate), then `·` and the company in `body fg-secondary`. Line 2: meta in `small fg-tertiary`, then up to 3
  "why" chips (`caption`, `surface-sunken`, `fg-secondary`, `rounded-xs`, h 20) and up to 2 gap chips (`–` prefix, dashed
  `border-strong`, `fg-tertiary`). Overflow becomes "+2".
- The right cluster has fixed widths so columns align down the feed: ghost slot 20 · deadline 72 (`mono-sm`, right-aligned,
  deadline colour) · ring 28.
- States: hover `surface-hover`. Keyboard cursor `surface-active` plus the cursor bar. Selected (x) adds a checkbox in the logo slot.
  Unseen since the last visit gets a 6 px `accent-strong` dot before the logo, with sr-only "New". Saved shows a filled `Bookmark` 16 in the
  right cluster.
- Hover and focus reveal an action cluster that overlays the deadline column: Save (`S`), Hide (`H`), Track (`A`), Apply ↗ (`O`).
  These are 28 px icon buttons with tooltips. On touch, an always-visible `⋯` button opens the action sheet.
- Click or `Enter` opens the drawer. `⌘/Ctrl+Enter` opens the apply link in a new tab.

**`ScoreRing`** sizes: 24 (compact rows), 28 (rows), 40 (drawer header, Kanban), 64 (landing anatomy).
Stroke widths are 3 / 3 / 3.5 / 5. The track is `fit-track`. The arc uses the band colour, starts at 12 o'clock, runs clockwise and has round caps.
The number is centred in Geist Mono 500 at 10 / 11 / 14 / 20 px. The band name appears below it (`caption`, band colour)
in comfortable rows, and to the right in the drawer ("86 · Strong fit"). It is a `role="img"` with
`aria-label="Fit 86 of 100, strong fit"`. When AI re-rank is pending, show the deterministic score with a
dotted track. Never show a spinner inside the ring.

**`FitBreakdown`** (drawer): six rows (Semantic, Skills, Role, Eligibility, Location, Freshness, and Ghost penalty if
any). Each row has a label in `small` and a 4 px bar on `surface-sunken` filled with `fg-secondary`. The largest contributor is filled with the
band colour. The contribution sits on the right in `mono` (`+34.1`). The footer reads "Weights: default · Adjust" and links to the sliders.

**`GhostBadge`**: h 20, `caption` 500, `rounded-xs`, `ghost-*-subtle` background, `ghost-*` text, a 16 px icon and a label. The tooltip lists the
signals ("Posted 63 days ago · Reposted 4 times · Apply link redirects to homepage"). In compact rows it is the icon only,
with an `aria-label`.

**`CompanyLogo`** (§7): sizes 20 / 28 / 40 in a `rounded-sm` tile with a 1 px `border-subtle` on `surface-raised`.

**`DeadlineText`**: `mono-sm`, with the formats `6d left` · `Due today` · `Due in 5h` · `Closed 2d ago` · `Rolling`. The tooltip shows the
absolute date and time in the user's time zone ("Tue 28 Oct, 23:59 IST").

**`KanbanCard`**: `surface-raised`, `border`, `rounded-md`, `p-card`. It shows logo 20 + title (`body` 500, 2 lines) + company
(`small fg-secondary`). The footer has the age (`mono-sm`: "Applied 12d"), ring 24, a nudge indicator (`BellDot` in warning, for
follow-up due) and a notes count. Hover adds `shadow-sm` and `border-strong`.

**`TimelinePill`**: h 28, `rounded-sm`, `surface-raised` with `border` and a 3 px left bar in the band colour. It shows a type icon (16), the title
(`caption` 500, truncated) and the fit number in `mono-sm`. On hover the pill expands to a hover card with deadline details.

**`SinceLastVisit` strip**: a 36 px inline strip at the top of the feed, `surface-sunken`, `small`: "Since Tue 22 Oct:
**9** new fits · **3** deadlines this week". The buttons are "Show new" and `×`. It is not a toast and not a modal.

**`PushSoftAsk`**: an inline card in the notification centre or under the first saved row. It is never a browser prompt
on load. Spec in USERFLOW §3.

**Buttons**: `primary` (accent / accent-fg) · `secondary` (`surface-raised`, `border`, `fg`) · `ghost` (transparent, hover
`surface-hover`) · `danger` (`danger` / `danger-fg`, only in the final confirm step) · `link` (`accent-strong`, underline on hover).
Sizes sm 28 / md 36 / lg 44. Icon-only buttons are square with a required `aria-label` and tooltip. Allow one primary button per region.

### 6.3 Landing concept: "the radar is the hero"

There is no gradient and no illustration. The page *is* the product working.

- **Above the fold** (desktop: two columns, 5/7 split. Mobile: stacked):
  - Left: the lockup (mark in `accent-strong`, which is deep amber on paper and the lamp itself on dark, plus the wordmark), then **one sentence** in `display-xl` Instrument Serif: "Every
    opportunity that fits you. *Nothing that doesn't.*" (the second clause is in italic, `fg-secondary`). Below it, **one button**:
    "Continue with Google" (`lg`). Under that, one `caption fg-tertiary` line: "Free. Bring your own AI key, or switch AI
    off." Nothing else.
  - Right: **the live radar**, a `surface` frame (`rounded-xl`, `border`, `shadow-md`) with a header in `mono-sm`:
    "Watching 338 sources · 4,812 open listings · updated 2 min ago" (numbers come from a public stats endpoint
    and fall back to seeded values). Seeded `RadarRow`s for a fictional student profile ("CS '27, Bengaluru, Go +
    Postgres") arrive at the top every 2.4 s, with the ring filling and one row carrying a "Possibly stale" badge. Hovering
    a row shows its fit breakdown in a popover, which proves explainability in one gesture.
- **Below the fold** (motion storyboard in MOTION.md §8): **L2** one pinned scene, scrubbed by scroll, in three acts: *Sources* (noise
  converging) → *Fit* (rows ranked, the working shown) → *Alerts* (one signal lifts, a push arrives, the beacon pings). **L3** the
  deadline timeline sweep. **L4** the fit-score explainer, with live weights you can drag. **L5** a privacy block in `body-lg` ("Your
  resume is parsed on our server. AI is optional: use ours, bring your own key, or switch it off. Export or delete everything,
  any time."). **L6** the finale, a forced-dark band where the beacon's light swings onto [Continue with Google]. Then the footer.
- **Performance**: the headline is the LCP element (system-serif fallback with `size-adjust` to limit CLS). The seeded
  feed is ≤ 8 kB of inline JSON hydrated after first paint, and its frame reserves height, so CLS is 0. No WebGL, no video, and one font preload per family.

---

## 7. Iconography

- **lucide-react only.** Sizes are **16** (inline, buttons, rows, chips, menus) and **20** (nav, tab bar, empty-state
  media, drawer section headers). `strokeWidth={1.5}`. Colour is `currentColor`, so icons inherit `fg-secondary` by default and
  `fg` when active. The only exceptions are the Google "G" on the sign-in button and company logos.
- Canonical icons:

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Internship / job | `Briefcase` | Hackathon | `Trophy` |
| Scholarship / fellowship | `GraduationCap` | Research | `FlaskConical` |
| Open-source program | `GitBranch` | Remote | `Globe` |
| Save / saved | `Bookmark` / `BookmarkCheck` | Hide | `EyeOff` |
| Track | `KanbanSquare` | Apply (external) | `ArrowUpRight` |
| Deadline | `CalendarClock` | Possibly stale / Likely ghost | `Clock` / `Ghost` |
| Looks active | `ShieldCheck` | Not eligible | `Ban` |
| Source healthy / slow / failing | `CircleCheck` / `CircleDashed` / `CircleX` | Alerts | `BellRing` |
| Nudge | `BellDot` | AI (tips, re-rank) | `Wand` is **banned**. Use `Lightbulb` with the text "Tip" |
| Filters | `SlidersHorizontal` | Command palette | `Command` |

- **Company logos**: `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" width height loading="lazy"
  decoding="async" referrerpolicy="no-referrer" alt="">`, drawn at 20/28/40 inside the tile with 2 px padding. Derive the domain
  from the listing's company site, falling back to the apply URL host (never the ATS host). **Fallback to a letter avatar** `onError`, or when
  `naturalWidth ≤ 16` (the service returns a 16 px globe for unknown domains). The letter avatar is the first alphanumeric
  character in uppercase, Geist 600 at 45 % of the tile, `fg-secondary` on `avatar-{hash(domain) % 6 + 1}`. Logos are decorative
  (`alt=""`) because the company name is always rendered as text.

---

## 8. Copy voice

**Rules**

1. Calm, precise and specific. Say what happened and what to do next, with numbers ("3 deadlines this week", not "a few").
2. Use sentence case and British spelling (colour, prioritise), in the second person. Buttons are verbs ("Add source", "Move to Ghosted"),
   never "OK", "Submit" or "Click here".
3. No exclamation marks, emoji, "Oops", "AI-powered", "magic", "supercharge", "unlock" or "seamless". No hype adjectives.
4. Be honest about AI and data: name what is sent, to whom, and how to switch it off.
5. Never blame the user. Errors state what failed, why (if known) and the fix, plus a Retry.
6. Undo toasts use the past tense plus Undo ("Hidden. Undo"). Confirmations are rare and only for irreversible actions.
7. Numbers and dates use mono, units are explicit (₹, /mo, d, h), and time zones appear on absolute times.
8. Keep it short: titles ≤ 6 words, empty-state sentences ≤ 20 words, toasts ≤ 12 words.

**Example strings** (use them verbatim where they apply)

| # | Context | String |
|---|---|---|
| 1 | Radar, first run | **Your radar is warming up.** Checking 18 sources — new fits appear here as each one finishes. |
| 2 | Radar, nothing above the threshold | **Nothing above 80 right now.** 14 listings score 60–79. [Lower to 60] |
| 3 | Radar, filters too narrow | **No listings match these filters.** Remote + ₹50k floor + 2026 grads is narrow. [Clear stipend floor] |
| 4 | Search, no results | No listings match “rust backend”. Try fewer words, or search all types. |
| 5 | Feed error | **Couldn't load your radar.** The server didn't respond within 10 seconds. [Retry] |
| 6 | Tracker, empty | **Nothing tracked yet.** Press A on any listing, or drag one here from Deadlines. |
| 7 | Deadlines, empty | **No deadlines in the next 4 weeks** for these filters. [Show all types] |
| 8 | Sources, no personal sources | **Your packs cover 338 sources.** Add a careers page to watch one more company. [Add source] |
| 9 | Source detection, success | Detected: Greenhouse board `stripe` → 142 jobs |
| 10 | Source detection, failure | We couldn't find listings on that page. Try the company's careers page, or a Greenhouse, Lever or Ashby link. |
| 11 | Alerts, empty | **No alert rules.** Start with one: notify me when a Strong fit internship opens. [Create this rule] |
| 12 | Undo, hide | Hidden “Platform Engineering Intern”. [Undo] |
| 13 | Undo, tracker move | Moved to Applied. [Undo] |
| 14 | Follow-up nudge | No reply from Northwind Labs in 10 days. A short follow-up often gets one. [Copy template] [Snooze 3 days] |
| 15 | Ghosted nudge | 30 days without a reply. Most roles that go quiet this long don't come back. [Move to Ghosted] [Keep waiting] |
| 16 | Ghost badge tooltip | Likely ghost: posted 63 days ago, reposted 4 times, apply link redirects to the homepage. |
| 17 | Push soft ask | Get a push notification when a Strong fit opens? You can change this any time. [Turn on] [Not now] |
| 18 | Credit cap reached | Today's crawl budget is used up. Your sources refresh after 00:00 IST; shared packs keep updating. |
| 19 | AI off | AI is off. Scores use embeddings and rules only; tailoring tips are hidden. |
| 20 | Returning user | Since Tue 22 Oct: 9 new fits · 3 deadlines this week. |
| 21 | Deadline push | Closes tomorrow: Platform Engineering Intern, Northwind Labs. Fit 86. |
| 22 | Offline | You're offline. Changes will sync when you're back. |
| 23 | Delete account | Delete your account and all data? This removes your profile, resume, tracker and alert rules. This can't be undone. Type DELETE to confirm. |

---

## 9. Accessibility (WCAG 2.2 AA, non-negotiable)

- **Focus ring**: `:focus-visible` always shows `outline: 2px solid var(--color-focus-ring); outline-offset: 2px`
  (`focus-visible:focus-ring`). Inside rows, cells and Kanban columns use `focus-ring-inset` (offset −2 px) so it is never clipped.
  Never use `outline: none` without this replacement. The ring is ≥ 5:1 against `bg` in both themes. Focus is never hidden
  under sticky headers (2.4.11): use `scroll-margin-top: calc(var(--topbar-h) + 44px)` on rows.
- **Targets**: ≥ 24 × 24 CSS px everywhere (2.5.8). Icon buttons are 28 (24 in compact, with a `::before` hit area expanded to
  32). On `pointer: coarse` the minimum is 44 × 44, and the tab bar items are 56 tall.
- **Keyboard**: everything works without a pointer. Single-key shortcuts are off while focus is in a text field, and
  can be turned off in Settings (2.1.4). `?` opens the shortcut sheet. Tab order is top bar → toolbar → rail → feed →
  drawer. The feed is **one tab stop** with roving focus (`j`/`k`/arrows), as with the Kanban columns and the timeline grid.
  Include a skip link ("Skip to radar").
- **Feed semantics**: `role="feed"` with `aria-busy` while loading. Each row is an `article` with `aria-labelledby` (title),
  `aria-describedby` (meta), and `aria-posinset`/`aria-setsize` (−1 while the total is unknown). Virtualisation keeps the
  focused row mounted.
- **Drawer**: at xl it is a non-modal `<aside aria-labelledby="drawer-title">` landmark. On open, focus moves to the title; `Esc`
  closes it and restores focus to the originating row. Below xl it is a Radix Dialog/Sheet (`role="dialog"`, `aria-modal`, focus trap,
  `inert` background, focus restore). The bottom sheet's drag handle is also a button ("Close details").
- **Command palette**: a Dialog with `aria-label="Command palette"`. cmdk provides combobox/listbox semantics, and a polite live
  region announces "12 results". Items announce their shortcut via `aria-keyshortcuts`.
- **Drag and drop**: @dnd-kit `KeyboardSensor` (Space to lift, arrows to move, Space to drop, Esc to cancel) with custom
  `announcements`: "Picked up Platform Engineering Intern in Saved, position 2 of 5." / "Moved to Applied, position 1
  of 3." / "Dropped in Applied." / "Cancelled; returned to Saved." **A single-pointer alternative is required
  (2.5.7)**: every card and pill has "Move to…" (key `m`) and "Add to tracker" (`a`) without dragging.
- **Colour is never the only signal**: the score ring shows the number plus the band name, ghost badges have an icon and a word, deadlines are
  words, source health is a dot plus a word, toasts have an icon plus text, the cursor row has a bar plus a background, and the "New" dot has sr-only text and the
  "Show new" filter.
- **Live regions**: toasts are polite, error toasts are assertive. Warming-up progress is announced politely at most every 5 sources and
  on completion ("Radar ready: 142 fits"). Background feed inserts are not announced individually.
- **Forms**: labels are always visible (never placeholder-as-label). Errors are linked via `aria-describedby` and announced on submit, and the first
  invalid field receives focus. Do not ask for anything already parsed from the resume (3.3.7 Redundant Entry). No CAPTCHA (3.3.8).
- **Motion**: §5 reduced-motion rules. Nothing flashes more than three times a second. Auto-advancing content (landing
  feed) has pause/play and stops on hover/focus (2.2.2).
- **Text and zoom**: rem everywhere. Reflow works at 320 px and 400 % zoom, and text spacing overrides don't clip.
  `lang="en-IN"`.
- **Charts and bars**: every bar list has its numbers as text, and charts get a visually-hidden table.
- **Testing**: axe (vitest + jest-axe) on every route in CI. A manual keyboard pass and a VoiceOver/NVDA pass on Radar,
  drawer, palette and Kanban before each phase is closed.

---

## 10. Layouts

Measurements are in px at a 16 px root. `▌` is the `accent-strong` cursor bar and `( )` is a score ring.

### 10.1 App shell

Desktop (≥ md: top-bar navigation, the "instrument" strip):

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [K] Beacon    Radar  Deadlines  Tracker  Sources  Alerts   [⌕ Search or jump…  ⌘K]  [bell 3]  (AP) │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Page title (Instrument Serif)   view toolbar: filters · view switch · sort               [actions] │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                    │
│  page content on `surface`: feed / board / table as full-bleed panes, not floating cards           │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
 top bar 48 (bg, border-b subtle) · page toolbar 44 (sticky) · content on surface
 (AP) avatar menu: Profile · Settings · Shortcuts ? · Theme · Sign out
```

Mobile (< md):

```
┌──────────────────────────────────┐
│ [K] Radar · 142       [⌕] [bell] │
├──────────────────────────────────┤
│                                  │
│ content                          │
│                                  │
├──────────────────────────────────┤
│ Radar Deadlines Tracker Alerts Me│
└──────────────────────────────────┘
 top bar 48: title per tab; ⌕ opens the palette full-screen
 tab bar 56 + safe area; 20 px icons + caption labels
 "Me" = Profile, Sources, Settings, Shortcuts, Sign out
```

### 10.2 Radar (filter rail + virtualised feed + drawer)

Desktop xl (≥ 1280), drawer open:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [K] Beacon    Radar  Deadlines  Tracker  Sources  Alerts                    [⌕ ⌘K]  [bell 3]  (AP)     │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Radar  142 fits   [≡ List | ▦ Timeline | ▥ Board]   Fit ≥ [──●──] 60   Sort: Best fit ▾   View ▾       │
│ Active: [Internship ×] [Remote ×] [≥ ₹20k ×]  Clear                                                    │
├─────────────────┬─────────────────────────────────────────────────┬────────────────────────────────────┤
│ FILTERS      [«]│ Since Tue: 9 new fits · 3 this week  [Show] ×   │ [■] Platform Engineering Intern ×  │
│                 │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │ Northwind Labs · Remote · 6d left  │
│ TYPE            │▌[■] Platform Engineering Intern · Northwind     │ [Apply ↗] [Save S] [Track A]  ⋯    │
│ ☑ Internship  98│    Remote · ₹45k/mo · 2d · Go, Postgres  6d (86)│ ────────────────────────────────── │
│ ☐ Full-time   21│ [■] ML Research Intern · Meridian AI Lab        │ (86) Strong fit                    │
│ ☑ Hackathon   14│    Bengaluru · ₹60k/mo · 5h · PyTorch    9d (91)│ Semantic     ██████████░  +34.1    │
│ ☐ Scholarship  6│ [■] Monsoon Hack 2026 · Devfolio           G    │ Skills       ███████░░░░  +21.0    │
│ DEADLINE        │    Online · Team of 4 · Next.js          3d (78)│ Role         ██████░░░░░  +12.0    │
│ (•) Any         │ [■] Data Analyst Intern · Acme             G    │ Eligibility  ██████████░  +10.0    │
│ ( ) ≤ 7 days    │    Pune · ₹25k/mo · 51d · SQL           14d (64)│ Location     ██████████░   +5.0    │
│ ( ) ≤ 30 days   │ …                                               │ Freshness    ████████░░░   +3.9    │
│ LOCATION        │                                                 │ Why it fits · Gaps                 │
│ STIPEND ≥  ₹20k │ virtualised · 64 px rows · border-subtle lines  │ Eligibility (extracted)            │
│ GRAD YEAR  2027 │                                                 │ Skills matched / missing           │
│ COMPANY  ⌕      │                                                 │ Tailoring tips (Tip · AI)          │
│ SOURCE          │                                                 │ Description (sanitised)            │
│ FRESHNESS       │                                                 │ Apply link: checked 2h ago         │
│ [Save view]     │                                                 │ Similar opportunities              │
└─────────────────┴─────────────────────────────────────────────────┴────────────────────────────────────┘
  rail 240 (collapsible, [)  feed: flex, min 520                     drawer 440 (resizable 360–640, ])
```

- At lg (1024–1279) the rail defaults to closed (a "Filters 3" button in the toolbar) and the drawer overlays the feed's right side with
  `shadow-md`. The feed stays scrollable and `j`/`k` updates the drawer live.
- At md the rail is a left Sheet and the drawer is a right Sheet (modal).
- The drawer section order is fixed: header → fit breakdown → why/gaps → eligibility → skills → tips → description →
  apply-link health → similar.

Mobile:

```
┌──────────────────────────────────┐
│ [K] Radar · 142       [⌕] [bell] │
│ [Fit ≥ 60 ▾] [Internship ▾] [3] →│
├──────────────────────────────────┤
│ Since Tue: 9 new · 3 this week  ×│
├──────────────────────────────────┤
│ [■] Platform Engineering…  (86)  │
│     Northwind · Remote · 6d    ⋯ │
├──────────────────────────────────┤
│ [■] ML Research Intern     (91)  │
│     Bengaluru · ₹60k · 9d      ⋯ │
├──────────────────────────────────┤
│ Radar Deadlines Tracker Alerts Me│
└──────────────────────────────────┘
 chip row: 36 tall, scrolls horizontally ([3] = Filters, 3 active)
 rows: 72 tall, title max 2 lines; ⋯ = action sheet
 swipe right = Save, swipe left = Hide

 Detail as a bottom sheet (snap 60 % / 100 %):
┌──────────────────────────────────┐
│               ────               │
│ [■] Platform Engineering Intern  │
│ Northwind Labs · Remote · (86)   │
│ [   Apply ↗   ] [Save] [Track]   │
│ …sections as on desktop…         │
└──────────────────────────────────┘
 handle = button "Close details"; header sticky; 44 px buttons
```

### 10.3 Deadline timeline (Notion-Calendar principles: faint grid, mono numerals, type-led hierarchy)

Desktop:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Deadlines  [≡|▦|▥]  Types ▾  Fit ≥ 60   [‹] [Today] [›]   27 Oct – 23 Nov   4 weeks ▾                 │
├─────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┤
│     │ MON 27      │┃TUE 28      │ WED 29      │ THU 30      │ FRI 31      │ SAT 1       │ SUN 2       │
├─────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ W44 │             │┃ TODAY      │             │             │             │░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│     │▌B Backend 86│┃            │ T Monsoon 78│             │             │░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│     │             │┃G Kaveri  72│ +2 more     │             │             │░░░░░░░░░░░░░│░░░░░░░░░░░░░│
├─────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ W45 │ F Summer  81│┃            │             │             │ C LFX     69│░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│     │             │┃            │             │             │             │░░░░░░░░░░░░░│░░░░░░░░░░░░░│
├─────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ W46 │ …           │┃            │             │             │             │░░░░░░░░░░░░░│░░░░░░░░░░░░░│
└─────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
 ╭ Drop here to track ──────────────────────────────────────╮  dock, shown only while dragging
 ┃ = today line (2 px accent-strong) · ░ = weekend (surface-sunken) · headers in mono-sm
 Pill icons (lucide, 16 px): B Briefcase · T Trophy · G GraduationCap · F FlaskConical · C GitBranch
```

- Grid lines are 1 px `border-subtle`. Today has a 2 px vertical `accent-strong` line with a "TODAY" `mono-sm accent-strong` label. Past days
  use `fg-disabled` headers, and their pills are at 50 % opacity with "Closed". Each cell shows at most 3 pills, then "+N more" opens a popover.
- Week rows are 120 px tall (88 in compact). Multi-day windows (hackathon registration → event) render as a spanning bar
  from open to close, in `surface-sunken` with a `border` outline.
- Keyboard: the grid is one tab stop. Arrows move between days, `Tab` steps through the pills in the focused day, `Enter` opens the drawer,
  `a` tracks, `t` jumps to today, `[`/`]` move by weeks. Dragging a pill to the dock adds it to the tracker as Saved, and `a` does the same.
- Mobile: a vertical agenda instead of strips. Sticky day headers read "Tue 28 Oct · Today", and pills become full-width
  56 px rows.

### 10.4 Tracker Kanban

Desktop:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Tracker  [▥ Board | ≡ Table]                                                        [+ Add listing] │
│                                                                                                     │
│  APPLIED        RESPONSE RATE      MEDIAN REPLY      BEST SOURCE                                    │
│  24             38%                9d                YC startups · 52%  ▇▇▇▇▇▁                      │
├────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┤
│ SAVED       12 │ APPLIED      8 │ OA / TEST    3 │ INTERVIEW    2 │ OFFER        1 │ CLOSED       6 │
├────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┤
│ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │                │                │ [Rej|Ghosted]  │
│ │[■] Backend │ │ │[■] ML Res… │ │ │[■] SDE Int…│ │                │                │ ┌────────────┐ │
│ │Intern      │ │ │Meridian AI │ │ │Acme        │ │ ╎ Drop here ╎  │                │ │[■] Data An…│ │
│ │Northwind   │ │ │Applied 12d │ │ │OA due 2d   │ │ ╎ (on drag) ╎  │                │ │Acme        │ │
│ │6d     (86) │ │ │◔ nudge (91)│ │ │       (74) │ │                │                │ │Ghosted 34d │ │
│ └────────────┘ │ └────────────┘ │ └────────────┘ │                │                │ │       (64) │ │
│ ┌────────────┐ │                │                │                │                │ └────────────┘ │
│ │[■] …       │ │                │                │                │                │                │
└────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┘
 columns min 272, surface-sunken, rounded-lg; board scrolls horizontally, analytics stay; m = Move to…
```

- Column order follows SPEC: Saved → Applied → OA/Test → Interview → Offer → Closed. Closed holds Rejected and Ghosted (plus
  "Withdrawn") behind a segmented control, and its count shows both numbers.
- Clicking a card opens the drawer in tracker mode: status, applied date, notes (markdown-lite), contacts, documents,
  nudge history and the timeline of status changes.
- Mobile: a scrollable status tab strip (Saved 12 · Applied 8 · …) above a single-column card list. "Move to…" opens a bottom
  sheet. Long-press drag is off by default.

### 10.5 Sources table

Desktop:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Sources  [My sources 6 | Packs 7]      Crawl credits today  312 / 500  ▇▇▇▇▇▇▁▁▁▁   [+ Add source] │
├───────────┬──────────────────────────────────┬────────────┬───────┬────────────┬──────────┬────┬───┤
│ HEALTH    │ SOURCE                           │ TYPE       │ EVERY │ LAST CHECK │ LISTINGS │ ON │   │
├───────────┼──────────────────────────────────┼────────────┼───────┼────────────┼──────────┼────┼───┤
│ ● Healthy │ Stripe                           │ Greenhouse │ 6 h   │ 12 min ago │      142 │ ●  │ ⋯ │
│           │ boards.greenhouse.io/stripe      │            │       │            │          │    │   │
│ ◌ Slow    │ Northwind careers                │ Crawl      │ Daily │ 3 h ago    │       18 │ ●  │ ⋯ │
│ ✕ Failing │ Acme careers · acme.dev/careers  │ Crawl      │ Daily │ 2 h ago    │        — │ ●  │ ⋯ │
│   └ 403 Forbidden: the site blocks crawlers. Last success 4 days ago.   [Retry now] [Edit URL]     │
│ ● Healthy │ Devfolio hackathons              │ API        │ 6 h   │ 40 min ago │       25 │ ●  │ ⋯ │
└───────────┴──────────────────────────────────┴────────────┴───────┴────────────┴──────────┴────┴───┘
 rows h-row-table (44 / 36) · numbers mono, right-aligned · health = icon + word (success / warning / danger)
 the failing row expands to show the error and fixes
```

Packs tab: one row per pack (name, sources count, listings count, last refresh, toggle). Toggling a pack off asks no
confirmation and gives an undo toast.

Add-source dialog (md and up; full-screen sheet on mobile):

```
┌ Add a source ────────────────────────────────────────────────────────┐
│ URL                                                                  │
│ [ https://boards.greenhouse.io/stripe                           ]    │
│ ✓ Detected: Greenhouse board `stripe` → 142 jobs                     │
│   [■] Software Engineer, Intern · Bengaluru · 2d                     │
│   [■] Backend Engineer · Remote · 5d                                 │
│ Tag as  [Internship ▾]          Refresh  [Every 6 h ▾]               │
│ Cost: free (public ATS API) · crawled pages use credits              │
│                                               [Cancel]  [Add source] │
└──────────────────────────────────────────────────────────────────────┘
 detection line in mono ("Detecting…" with a spinner first) · 3 preview rows · cost line caption fg-tertiary
```

Mobile: a card list (name, health word, listings and last check in mono) with tap opening a detail sheet. The credit meter sits pinned at the top.

### 10.6 Settings

Desktop (lg and up; Arc-like calm, one column of rows, label left / control right):

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Settings                                                                                          │
├──────────────────────┬────────────────────────────────────────────────────────────────────────────┤
│▌Appearance           │ Appearance                                                                 │
│  AI & keys           │ ────────────────────────────────────────────────────────────────────────── │
│  Notifications       │ Theme          ( ) Light   ( ) Dark   (•) System                           │
│  Privacy & data      │ Accent         [■ Amber]  [■ Teal] [■ Cobalt] [■ Ink]                      │
│                      │ Density        [Comfortable | Compact]                                     │
│                      │                ┌ live preview: one RadarRow at the chosen density ┐        │
│                      │ Text size      [ S | M | L | XL ]                                          │
│                      │ Motion         [System | Reduced | Full]                                   │
│                      │ Shortcuts      [●] Single-key shortcuts   View all  ?                      │
└──────────────────────┴────────────────────────────────────────────────────────────────────────────┘
 nav 220 · content max 720 · each row: label column 200 (body 500 + caption helper), control on the right
```

- **AI & keys**: provider (Beacon default / your own key / AI off) as radio cards. For your own key: base URL, model and key
  (Input Group with reveal and paste; "Test key" shows `✓ 214 ms` or the error). An honest note about what is sent sits beside it.
- **Notifications**: web push on/off (with the browser permission state shown), in-app on/off, deadline reminders (7d / 3d / 1d
  toggles), quiet hours (from–to), digest time and time zone. There are no email or Telegram options (BRIEF #1).
- **Privacy & data**: a toggle for "Send resume text to the AI provider" (with consent copy), "Export my data (JSON)", and "Delete
  account" (Alert Dialog, type DELETE).
- Mobile: a section list leads to a pushed section page with a back chevron. The same rows stack the label above the control.

---

## 11. Keyboard map

| Key | Action | Key | Action |
|---|---|---|---|
| `j` / `k` (↓ / ↑) | Next / previous row | `⌘K` / `Ctrl K` | Command palette |
| `Enter` / `o` | Open detail drawer | `/` | Focus search |
| `Esc` | Close drawer / palette / sheet; clear selection | `?` | Shortcut sheet |
| `s` | Save / unsave | `g` then `r` / `d` / `t` / `s` / `a` / `p` | Go to Radar / Deadlines / Tracker / Sources / Alerts / Profile |
| `h` | Hide (undo toast) | `g` then `,` | Settings |
| `a` | Add to tracker | `1` / `2` / `3` | List / Timeline / Board view |
| `⌘Enter` | Open apply link | `[` / `]` | Toggle filter rail / drawer |
| `x` | Select row (multi) | `⌘Z` / `u` | Undo last action |
| `m` | Move to… (tracker, timeline) | `t` | Today (timeline) |
| `Shift` + `j`/`k` | Extend selection | `.` | Open row action menu |

Shortcuts are shown in tooltips, menus and the palette (Raycast and Linear practice: teach by showing), and listed in
the `?` sheet (a Dialog with a two-column grid and `Kbd` chips).

---

## 12. Research sources

Principles taken, not visuals copied.

- **Linear**: [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui). Themes come from
  three inputs (base, accent, contrast) in LCH. The accent is limited in the chrome. Headers, sidebar and tabs are aligned so "users feel it after
  a few minutes", and there is a display face for headings. [Navigating Linear](https://linear.app/enablement/guide/navigating-linear) covers
  `⌘K`, `/` search, `G`-then-letter chords and `?` for the shortcut list. Applied here as one accent, the alignment discipline, the chord
  navigation and the `?` sheet.
- **Raycast**: [A fresh look and feel](https://www.raycast.com/blog/a-fresh-look-and-feel) and the
  [Action Panel manual](https://manual.raycast.com/action-panel). The principles are fast, simple and delightful; there is an action bar
  showing context actions *with their shortcuts* so users learn them; the primary action runs on Enter; secondary actions sit in a searchable
  panel; there is an enlarged search field and a compact mode. Applied to the palette footer, the nested listing action panel and density modes.
- **Vercel Geist**: [Colors](https://vercel.com/geist/colors) (scale roles: 1–3 component background, hover and active; 4–6
  borders; 9–10 text) and [Materials](https://vercel.com/geist/materials) (radius 6 surfaces, 12 menus and modals, 16
  fullscreen; tooltips are the only floating element with a stem). Applied to the layered tokens, the radius ladder and the tooltip stem.
- **Notion Calendar / Cron**: a third-party analysis, [Notion Calendar design guide](https://blakecrosley.com/guides/design/notion-calendar)
  (grid lines at about 9 % opacity, monospaced time numerals, soft-fill pills with 4–6 px radius, `t` for today, hierarchy from type
  and whitespace), plus the official [keyboard shortcuts](https://www.notion.com/en-gb/help/notion-calendar-keyboard-shortcuts). Applied to
  the Deadline timeline.
- **Read.cv**: [Read.cv toolkit notes](https://www.hackdesign.org/toolkit/read-cv/), which describe the work-history timeline as "the backbone",
  curated projects and a short About, link-first. Applied to the Profile ledger and the "what recruiters see" preview.
- **Component sources**: [reactbits.dev](https://reactbits.dev) (index at
  [/get-started/index](https://reactbits.dev/get-started/index)); [21st.dev/llms.txt](https://21st.dev/llms.txt)
  (registry and install model); [shadcn/ui components](https://ui.shadcn.com/docs/components) (Radix, Base UI and React Aria
  variants; Empty, Field, Item, Kbd, Spinner, Input Group, Button Group are current); [Aceternity UI](https://ui.aceternity.com/components).
- **Motion**: [motion.dev transitions](https://motion.dev/docs/react-transitions) (spring `visualDuration` and `bounce`,
  `MotionConfig`).
