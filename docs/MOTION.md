# Beacon — Motion and micro-interaction spec

This document is authoritative for everything that moves, responds or changes state on screen. `docs/DESIGN.md` §5
summarises it. Every value lives in **`packages/ui/src/motion.ts`** (exported from `@kestrel/ui`): `springs`, `tweens`,
`variants`, `press`, `hoverLift`, `layoutIds`, `dropAnimation`, `dragActivation`, `gestures`, `nearestSnap`, `stagger`,
`toReducedMotion`, `createOnceTracker`, `cssSpring`, `cssEase`, `landing` and `MOTION_LIMITS`. Its CSS twins are in `tokens.css`
(`--duration-*`, `--ease-*`). **Never inline a stiffness, duration or easing in a component.** If a value is missing, add it to
`motion.ts` (the tests enforce the limits) and to this document.

The goal is Apple-grade software feel: every input answers instantly, things move like objects with mass, nothing waits for
an animation, and the interface stays calm. "Seamless" here means **continuity**. An element never teleports when it could
travel, and a motion never restarts when it could be retargeted.

---

## 1. Principles

1. **Answer within one frame.** Every press, key or drag shows a visible response on the same frame: the press scale or row
   tint starts on `pointerdown`, not on `click`. The network can be slow, but the UI never is (optimistic updates, DESIGN §1).
2. **Springs, not curves, for movement.** Springs keep position *and velocity* continuous, so a gesture hands off without a
   jolt and a retarget mid-flight feels natural (Apple, WWDC23 *Animate with springs*). Curves (`tweens`) are only for opacity
   and exits.
3. **Interruptible always.** Any animation can be reversed or retargeted at any frame and continues from its current value
   and velocity. No input is ignored "because it's animating".
4. **Direct manipulation is 1:1.** While a finger or cursor holds something (drag, swipe, slider, sheet), it tracks exactly,
   with no smoothing and no lag. The spring takes over only on release, carrying the release velocity.
5. **Brief.** Product UI stays within **240 ms of perceived duration** (`visualDuration` ≤ 0.24). Only the landing page's
   scroll-driven scenes and its beacon ping are longer, and those are driven by scroll or are ambient, never blocking.
6. **Purposeful.** Motion explains where something came from, where it went, or what changed. If removing an animation loses no
   information, keep it at ≤ 120 ms or delete it.
7. **Quiet.** One thing moves per region at a time. There are no ambient loops in product UI. Big surfaces don't bounce (`smooth`,
   bounce 0), and only small controls get a touch of overshoot (`release`, `snappy`).
8. **Data never overshoots.** Scores, bars, counts and weights use `springs.data` or `tweens.count` (bounce 0). An 86 that
   briefly shows 88 is a lie.
9. **Transform and opacity only** (§7). Everything else is a paint or layout cost that drops frames on student laptops and
   mid-range Android phones.
10. **Optional.** Each pattern has a reduced-motion equivalent (§9) that keeps the information and drops the movement.

---

## 2. Setup

```tsx
// apps/web/src/app/motion-provider.tsx
import { LazyMotion, MotionConfig } from 'motion/react';
import { toReducedMotion, springs, type MotionPreference } from '@kestrel/ui';

const loadMax = () => import('./motion-features').then((m) => m.default); // export default domMax

export function MotionProvider({ pref, children }: { pref: MotionPreference; children: React.ReactNode }) {
  return (
    <LazyMotion features={loadMax} strict>
      <MotionConfig reducedMotion={toReducedMotion(pref)} transition={springs.snappy}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
```

- Use **`m.*` components only** (with `strict`, a stray `motion.*` throws). Bundle sizes from Motion's docs: `m` + `LazyMotion` is about 5 kB,
  `domAnimation` adds 24 kB and `domMax` adds 38 kB. The landing page loads `domAnimation` synchronously. App routes lazy-load `domMax`
  (layout, `layoutId`, drag) behind the async loader above.
- `pref` comes from Settings > Appearance > Motion (`system | reduced | full`), the same value the theme bootstrap script writes
  to `data-motion` (DESIGN §6.0). CSS and Motion therefore always agree.
- Import path is `motion/react` (Motion v12, formerly Framer Motion). Shared layout animations need a `LayoutGroup` around
  siblings that don't re-render together (feed + drawer, board + detail).

---

## 3. Spring and timing catalogue

| Name (`motion.ts`) | Definition | Feel | Use |
|---|---|---|---|
| `springs.press` | spring, visualDuration 0.10, bounce 0 | yields immediately | pointer-down scale on every pressable |
| `springs.release` | spring 0.22, bounce 0.2 | tactile pop back | pointer-up on buttons, icon buttons, chips, cards |
| `springs.snappy` | spring 0.18, bounce 0.1 | brisk, settled | segmented and tab indicators, switches, checkboxes, popovers, palette, toasts, default `MotionConfig` |
| `springs.smooth` | spring 0.24, bounce 0 | weighty, no wobble | drawers, sheets, side panels, shared-element morphs, reveals |
| `springs.gentle` | spring 0.24, bounce 0.15 | soft settle | list enter and reorder (`layout`), Kanban settle, toast stack shuffle |
| `springs.lift` | spring 0.16, bounce 0 | float | card hover lift |
| `springs.data` | spring 0.24, bounce 0 | precise | score-ring fill, fit and weight bars, slider-driven recomputes |
| `tweens.fadeIn` | 120 ms, ease-out | | opacity in (crossfades, skeleton → content) |
| `tweens.fadeOut` / `tweens.exit` | 120 ms, ease-in | accelerates away | opacity out, exits (exits are always faster than enters) |
| `tweens.count` | 240 ms, ease-out | | number count-up in product UI |
| `cssSpring` / `--ease-spring` | `linear(…)`, zeta 0.85 | same curve in CSS | dnd-kit drop, Sonner, Vaul, View Transitions, CSS hover lifts |
| `dropAnimation` | 220 ms, `cssSpring` | | dnd-kit `DragOverlay` |

Distances: `MOTION_LIMITS.distanceSm` = 4 px (rows, toasts), `distanceMd` = 8 px (exits, reveals). Press scales: 0.97 for buttons,
0.92 for icon buttons, 0.985 for cards. Hover lift is −2 px. The stagger is 20 ms per item for the first 12 items only (`stagger(i)` returns
`null` after that, and those items mount with `initial={false}`).

---

## 4. Interaction states for every control

**Global rules**

- **Hover only where it exists**: style hover under `@media (hover: hover) and (pointer: fine)`. Motion's `whileHover`
  already ignores touch. On touch, the press state is the feedback.
- **Hover timing**: list-like targets (rows, menu items, palette items, table rows) highlight **instantly on enter** (0 ms) and
  fade **out over 120 ms**, which is the Linear and macOS menu feel. Buttons and chips transition background in both directions over 120 ms.
- **Press on `pointerdown`**: the visual starts on the down event. If the pointer leaves before up, the press cancels and springs back.
  Activation stays on `click` and `Enter` / `Space`.
- **Keyboard echo**: when a shortcut fires (`s`, `h`, `a`, `1`/`2`/`3`, `⌘K`), the matching on-screen control plays its press state
  (100 ms down, then release). The user sees what the key did. This is implemented with a tiny `useEcho(actionId)` that toggles `data-pressed`.
- **Focus**: the ring appears **instantly** (`focus-visible:focus-ring`), and only `outline-offset` eases from 4 px to 2 px over 120 ms (a
  "snap-to" that draws the eye). Focus never animates position, and the ring never fades in.
- **Disabled**: no hover, press or cursor change. `fg-disabled` text with `aria-disabled`, and no transitions.
- **Cursor**: `default` on app chrome (buttons, rows, tabs, menu items), like desktop software; `pointer` only on real links and
  on the landing page's CTAs; `grab`/`grabbing` on drag handles and Kanban cards; `col-resize` on resizable handles.
- **Touch hygiene**: `-webkit-tap-highlight-color: transparent` (our press state replaces it), `touch-action: manipulation`
  on controls (no double-tap delay), `user-select: none` on chrome but never on listing descriptions, and `overscroll-behavior:
  contain` on drawers, sheets, palette lists and Kanban columns (no scroll chaining).
- **Scrollbars**: `scrollbar-width: thin; scrollbar-color: var(--color-border-strong) transparent`.

| Control | Rest | Hover (fine pointer) | Press | Focus-visible | Selected / on | Loading / other |
|---|---|---|---|---|---|---|
| Button, primary | `accent` / `accent-fg` | `accent-hover` (120 ms) | scale 0.97 (`press`), `accent-active`; release with `release` | ring | — | label crossfades to a 16 px spinner (fade 120). Width is locked to the pre-loading width, so there is no layout shift |
| Button, secondary | `surface-raised`, `border` | `surface-hover`, `border-strong` | scale 0.97, `surface-active` | ring | — | as primary |
| Button, ghost | transparent | `surface-hover` | scale 0.97, `surface-active` | ring | — | — |
| Icon button | transparent, `fg-secondary` | `surface-hover`, `fg` | scale 0.92 | ring | `accent-subtle` bg + `accent-subtle-fg` icon (toggled tools) | — |
| Link | `accent-strong`, no underline | underline (offset 3 px), instant | `opacity .7` while held | ring | — | external links get `ArrowUpRight` 16, which nudges x +1 / y −1 on hover (transform, `lift`) |
| Radar row | `surface` | `surface-hover` instant in, 120 ms out; action cluster fades in (fade 120) | `surface-active` (no scale: full-width rows don't shrink) | inset ring + `surface-active` + 2 px `accent-strong` bar | keyboard cursor = same as focus | `x` select: checkbox draws in (`pathLength` 0→1, 120 ms) |
| Kanban card | `surface-raised`, `border` | lift −2 px (`lift`) + shadow fade (§7) + `border-strong` | scale 0.985 | ring (inset) | detail open: card is the `layoutId` source (§5.6) | dragging (§5.10) |
| Filter chip / toggle chip | `surface-sunken`, `fg-secondary` | `surface-hover` | scale 0.97 | ring | `accent-subtle` / `accent-subtle-fg`, and the check icon scales 0.6→1 (`snappy`) | removing: chip scale 0.9 + opacity → 0 (exit), neighbours `layout` (`gentle`) |
| Segmented control / tabs | `surface-sunken` track | label `fg` | scale 0.97 on the pressed segment | ring on segment | indicator pill slides (`layoutId`, `snappy`, §5.13). Label colour crossfades 120 ms | — |
| Switch | track `border-strong` | track `fg-tertiary` | thumb stretches to 1.15× width toward its travel (scaleX) | ring on track | thumb x travels (`snappy`), track crossfades to `accent` (120 ms) | — |
| Checkbox / radio | `border-input` | `border-strong` | scale 0.92 | ring | fill `accent` + mark path draws (`pathLength`, 120 ms ease-out). Radio dot scales 0→1 (`snappy`) | indeterminate: bar scaleX 0→1 |
| Slider | track `surface-sunken`, thumb `surface-raised` + `border` | thumb `shadow-sm` | thumb scale 1.15 (`snappy`) and a value bubble appears above (popover variant). Thumb tracks 1:1 | ring on thumb | fill = band colour for the fit threshold | keyboard: arrow ±1 step, Shift ±10, value animates (`data`) |
| Input / textarea | `surface-raised`, `border-input` | `border-strong` | — | ring (no border colour animation) | — | error: border `danger` + message fades in (fade 120). Invalid paste (source URL): field shakes x ±3 px, 2 cycles, 240 ms total. **This is the only shake in the product** |
| Select / combobox trigger | as secondary | as secondary | as secondary | ring | open: chevron rotates 180° (`snappy`) | — |
| Menu / palette item | transparent | **instant** `surface-hover` | `surface-active` | the active item = `surface-active` (cmdk selection), **instant, never sliding** | checked: check icon instant | submenu chevron x +2 on highlight |
| Tooltip trigger | — | opens after 400 ms, then 0 ms for 300 ms (skip delay) | closes | opens on focus after 0 ms | — | — |
| Toast action ("Undo") | `accent-strong` text | underline | scale 0.97 | ring | — | after Undo the toast content crossfades to "Restored" (fade 120), then dismisses after 1.2 s |
| Mobile tab bar item | `fg-tertiary` icon + label | — | icon scale 0.92 | ring | `fg` + 2 px top indicator slides (`layoutId`, `snappy`) | re-tapping the active tab scrolls to top (smooth scroll) and lifts the icon −2 px for 120 ms |
| Nav tab (desktop) | `fg-secondary` | `fg` | — | ring | `fg` + `accent-strong` underline slides (`layoutId`, `snappy`) | — |

---

## 5. Pattern specs

Each pattern lists what moves, its transition, how it behaves when interrupted, and its reduced-motion equivalent (*RM*).

### 5.1 Press and release

`<m.button {...press.button}>` (or `press.icon` / `press.card`). Scale to 0.97 with `springs.press` on pointer-down, then release with
`springs.release` (bounce 0.2, a tiny pop). Pressing again mid-release retargets from the current scale. Never press-scale
elements wider than 480 px (rows, panels): tint them instead. *RM:* no scale; background tint only.

### 5.2 Hover lift (cards)

`{...hoverLift}`: y 0→−2 (`lift`). The shadow is **not animated**. A `::after` pseudo-element carries `shadow-md` at opacity 0 and fades to 1 over 120 ms
(composited), while the resting `shadow-sm` stays put. The border goes to `border-strong` instantly. *RM:* no lift; shadow fade only.

### 5.3 Detail drawer

| Breakpoint | Mechanism | Open | Close | Interrupt |
|---|---|---|---|---|
| xl (push, non-modal) | The grid column appears **instantly** (no width animation). Content uses `variants.drawerContent` | content x 16→0 + fade (`smooth`). The row's logo, ring and title morph in via a View Transition (§5.6) | content fade-out 120 ms, then the column collapses | `j`/`k` while open: drawer content **crossfades** (fade 120, no x), so the panel never slides again for a change of row |
| lg (overlay panel) | `variants.sidePanel` + no scrim | x 100 %→0 (`smooth`) | x→100 % (180 ms ease-in) | reversing mid-way retargets from the current x |
| md (Sheet, modal) | `sidePanel` + `scrim` | as lg, with the scrim fading in 120 ms | as lg | as lg |

*RM:* the panel appears and disappears with a 120 ms opacity fade, and content swaps instantly.

### 5.4 Bottom sheet (mobile)

shadcn Drawer (Vaul) keeps its gesture and accessibility. Override its 500 ms timing to match the system:

```css
[data-vaul-drawer] { transition-duration: var(--duration-slow) !important; animation-duration: var(--duration-slow) !important; }
[data-vaul-overlay] { transition-duration: var(--duration-fade) !important; }
```

Snap points are `[0.6, 1]`. While dragging, the sheet tracks the finger 1:1, with rubber-band resistance past the top (`gestures.elastic` 0.12).
On release: dismiss if `offset > 30 %` or `velocity > 500 px/s` (`gestures.sheetDismiss*`); otherwise snap using `nearestSnap(value,
velocity, snaps)`, which projects 0.2 s of momentum. Content inside scrolls only when the sheet is at full height. Verify in devtools
that Vaul's transition is overridden. If its inline styles win, implement the sheet with `m.div drag="y"` + `dragConstraints` +
`dragElastic={0.12}` + `onDragEnd` using the same thresholds and `springs.smooth` with the release velocity. *RM:* no slide; fade
in and out, and drag-to-dismiss still works (it's user-driven).

### 5.5 Lists: enter, exit, reorder, live insert

The feed is virtualised (TanStack Virtual), so movement must not fight the virtualiser:

- **Structure**: the outer wrapper is positioned by the virtualiser (`transform: translateY(start)`), and the inner `m.div` animates. Never
  put `layout` on a virtualised row.
- **Initial enter**: inner `variants.row` with `custom={index}`. Only rows `stagger(index) !== null` (the first 12) animate, and only
  once per session per id (`createOnceTracker`). Rows mounted by scrolling **never** animate.
- **Exit (hide/save-to-tracker)**: the inner row plays `variants.row.exit` (x −8 + fade, 120 ms). Then the item is removed from
  data, and rows below move up through a **CSS transform transition on the outer wrapper** (`transition: transform var(--duration-base)
  var(--ease-spring)`). It is applied only while `data-settling` is set for 300 ms, so resizes and scroll never animate.
- **Reorder (sort or filter change)**: if ≤ `MOTION_LIMITS.layoutMaxItems` (30) visible rows change position, rows travel to their new
  offsets via the same outer-wrapper transition. Above that, the feed **crossfades** (old fades out 80 ms, new fades in 120 ms). A
  mass reorder animated row by row is noise.
- **Live insert (warming-up and background updates)**: at the top of an unscrolled, unfocused feed, new rows enter in place
  (`row` variant) and the 2 px `accent-strong` bar fades out over 4 s. Otherwise they queue behind a pill ("9 new fits ·
  Show") that drops in from y −8 (`snappy`). Clicking it scrolls to the top (smooth, ≤ 300 ms) and then inserts.
- **Non-virtualised lists** (Kanban columns, chips, notifications, sources): `<AnimatePresence mode="popLayout">` + `layout` on the items
  with `transition={{ layout: springs.gentle }}`. Exiting items leave the layout immediately, so siblings reflow at once.

*RM:* no y, x or reorder travel. Items fade in and out (fade 120), and reorders swap instantly.

### 5.6 Shared element: card or row → detail

- **Tracker card → detail panel** (App Store pattern): the card container and the detail panel share
  `layoutId={layoutIds.trackerCard(id)}` inside a `LayoutGroup`. On open, the panel grows out of the card's box (`springs.smooth`),
  the card slot shows the card crossfaded out, and the panel's contents use `variants.morphContent` (fade in 60 ms after). On close, it shrinks back into
  the card. Set `borderRadius` through `style`, so Motion scale-corrects it. Text inside uses `layout="position"` (never scaled). The
  score ring is wrapped in a `div` (Motion layout doesn't animate SVG elements).
- **Radar row → xl drawer** (non-modal; both stay on screen): use a **View Transition** rather than `layoutId`, so the row
  keeps its logo while the drawer gains one. On click, set `view-transition-name` to `layoutIds.listingLogo(id)`, `…Ring` and
  `…Title` on the row and on the drawer header, call `document.startViewTransition(() => flushSync(open))`, and clear the names
  in `finished`. CSS: `::view-transition-group(*) { animation-duration: var(--duration-slow); animation-timing-function:
  var(--ease-spring); }`. Keyboard `j`/`k` changes **do not morph** (crossfade only). This is progressive enhancement: where View Transitions are not supported, the drawer
  opens normally.
- **Mobile row → bottom sheet**: no morph (the sheet is moving while it opens, so a morph would land in the wrong place). The sheet slides, and that is the continuity.

*RM:* no morphs. The panel fades in 120 ms with its content.

### 5.7 Skeleton → content

Skeletons appear only after 150 ms (fast responses never flash a skeleton), and once shown they stay at least 300 ms. The
skeleton and the content occupy the **same box** (identical geometry, so the layout shift is zero). The skeleton fades out (`tweens.fadeOut`), and content fades in
(`tweens.fadeIn`) with **no movement**. Rows that arrive later than the first batch use the list rules (§5.5). The shimmer is
a gradient on a pseudo-element translating x −100 %→100 % over 1.2 s, linear (a transform, so no repaint of the bars). *RM:* static
skeleton and instant swap.

### 5.8 Numbers: count-up and digit roll

- **Count-up** (analytics header, credit meter, landing counters): interpolate from the previous value to the new one with
  `tweens.count` (240 ms, ease-out) using Motion's `animate(from, to, { onUpdate })` (or reactbits Count Up), formatted with
  `Intl.NumberFormat('en-IN')`. Mono, tabular, and the width reserved for the final value. Runs on first view only.
- **Digit roll** (live counts: unread badge, "142 fits", column counts): a `Ticker` component renders one slot per digit. Only the
  digits that change animate: the old digit moves y 0→−8 and fades, the new one comes from +8 (−8 when decreasing), `springs.snappy`, with a 15 ms
  stagger from right to left. Commas and units never animate.
- Never count *down* to zero on unmount, and never animate when a number first renders inside a virtualised row.

*RM:* numbers swap instantly.

### 5.9 Score-ring fill

The arc is an SVG `<m.circle>` with `pathLength` from 0 to `score / 100`, using `springs.data` (bounce 0: it lands exactly on the value),
and the number counts up with `tweens.count` at the same time. The arc colour is the final band colour from the start (it never animates through
other bands, which would imply changing meaning). This plays the first time a listing is seen this session (`createOnceTracker`) and when
the score changes (e.g. weights edited): the arc retargets from its current length and the number rolls. *RM:* rendered
filled, no count.

### 5.10 Kanban drag and drop physics (dnd-kit)

- **Sensors**: `PointerSensor` with `activationConstraint: dragActivation.pointer` (4 px), `TouchSensor` with
  `dragActivation.touch` (200 ms hold, 6 px tolerance), and `KeyboardSensor` with `sortableKeyboardCoordinates`.
- **Pick-up**: the card in the column becomes a 40 %-opacity placeholder (its slot is held). The `DragOverlay` copy scales to 1.03
  (`snappy`) and gains `shadow-lg` (via the ::after fade), with the cursor `grabbing`. **No tilt.** The overlay follows the pointer **1:1**.
- **Over a column**: the column's background crossfades to `accent-subtle` at 40 % (fade 120). Siblings part to make room using
  dnd-kit's sortable transforms with `transition: { duration: 180, easing: cssSpring }`.
- **Drop**: `<DragOverlay dropAnimation={dropAnimation}>` (220 ms on `cssSpring`) flies the overlay into the slot while its scale
  returns to 1 and the shadow fades. The destination header's count rolls (§5.8) and the header flashes `accent-subtle` for 240 ms.
  An invalid drop returns to origin with the same animation. Optimistic: the server call happens after drop, and on failure the card
  springs back (`gentle`) with an error toast.
- **Auto-scroll**: horizontal near board edges (dnd-kit `autoScroll`, threshold 15 %, max speed 12 px/frame).
- **Keyboard drag**: each arrow press moves the card one slot, and siblings animate with `layout` (`gentle`), so the movement stays legible.
  Announcements are in DESIGN §9.

*RM:* no scale, shadow or flying drop. The card appears in its new slot (fade 120), and the 1:1 pointer tracking is kept.

### 5.11 Toasts (Sonner)

The Sonner layout is kept and its timing overridden:
`[data-sonner-toast] { transition: transform var(--duration-slow) var(--ease-spring), opacity var(--duration-fade), height
var(--duration-base) var(--ease-spring) !important; }`. Enter: y 12→0 + scale 0.97→1 + fade. Exit: fade + scale 0.97 (120 ms).
The stack shuffles with the spring. Hovering the stack expands it (Sonner `expand` on hover) and pauses timers. Swipe to dismiss
tracks 1:1 and commits at 30 % or 500 px/s. An undo toast's action crossfades to "Restored". *RM:* fade only.

### 5.12 Command palette

Open: scrim fade 120 + panel `variants.palette` (scale 0.97→1, y −6→0, `snappy`). The input is focused on the same frame, and typing before
the animation ends works (it is never blocked). Results never animate while typing, and the selection highlight is **instant**, following Raycast and macOS. The group
headers are sticky. When opening the nested action panel (`⌘K` on an item), the results slide x 0→−16 and fade while the action list
comes in from x +16 (`snappy`). `Esc` reverses it. Close: `exit` (fade + 0.99, 120 ms). Re-opening during close retargets. *RM:* fade only.

### 5.13 Tab and segmented-control indicator

One `m.span` indicator per group with `layoutId={layoutIds.segmentIndicator(group)}` (or `tabIndicator`), rendered inside the active
item, with `transition={springs.snappy}`. The indicator slides and resizes between items. Rapid arrow presses retarget it continuously.
Label colours crossfade (120 ms). Keep it inside a `LayoutGroup id={group}` so two identical controls never share an indicator. *RM:*
the indicator jumps (no travel), and labels still crossfade.

### 5.14 Theme crossfade

```ts
function setTheme(next: Theme) {
  const apply = () => applyThemeAttributes(next); // class + data-theme on <html>
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  document.startViewTransition(apply);
}
```

```css
::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--duration-slow); animation-timing-function: var(--ease-in-out); }
```

The whole page crossfades over 240 ms, so no element flickers through intermediate colours and no per-element colour transitions are
needed. Never add `transition: background-color` globally. Accent, density and text-size changes apply instantly (density
re-lays out every row, and animating that would be a reflow storm). *RM:* instant.

### 5.15 Route transitions

React Router 7 `viewTransition` on nav links. Only `main` has `view-transition-name: main`, and the top bar and tab bar have their own
names with `animation: none`, so the chrome is rock-steady. Old `main` fades out over 80 ms, and new `main` fades in over 120 ms with y 4→0. There are no
slides between top-level sections (they are peers, not a stack). Mobile push pages (Settings section → detail) slide x 24→0 on push and
reverse on back. *RM:* instant.

### 5.16 Popover, menu, tooltip, hover card

`variants.popover` from the Radix transform origin (`style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}`).
Open is `snappy`, and close is a 120 ms fade. Submenus open on hover after 100 ms with Radix's safe-triangle pointer grace. Tooltips use fade only
(no scale), with a 400 ms delay and a 300 ms skip window. The hover card waits 500 ms, then uses the popover variant. *RM:* fade only.

### 5.17 Swipe rows (mobile)

`m.div drag="x"` with `dragDirectionLock`, `dragConstraints={{ left: 0, right: 0 }}` and `dragElastic={0.5}` (resistance),
tracking 1:1. The action background reveals beneath, and its icon scales 0.8→1 as the offset approaches the 30 % threshold. Crossing the
threshold plays the icon pop (`snappy`) and an 8 ms haptic (`navigator.vibrate`, where supported). Release past the threshold (or at more than 500 px/s)
commits: the row continues off-screen with the release velocity (`smooth`), then collapses (§5.5 exit). Below the threshold it springs back (`release`). Vertical
scrolling wins when the gesture starts vertical. *RM:* the same gesture, but commit is an instant hide plus an undo toast.

### 5.18 Optimistic actions and failure

The visual change is immediate (save icon fills, row exits, card moves). If the server rejects it, the state springs back to the
previous value (`gentle`) and an error toast offers Retry. Never shake for server errors (shake is reserved for invalid input, §4).
Pending writes show a 6 px `fg-tertiary` dot that fades in after 1 s if still pending.

### 5.19 Scroll edges and sticky headers

A sentinel above each sticky header (IntersectionObserver) toggles `data-stuck`, and the header crossfades a `::after` hairline and
`shadow-sm` in over 120 ms. No scroll handlers run JS per frame in product UI. *RM:* the same (it's a fade).

### 5.20 Coach marks

The tour popover uses `variants.popover`. Its target gets a 2 px `accent-strong` outline that scales 1.04→1 twice (`smooth`, 480 ms total, the only
repeating emphasis in the product). Between steps the popover **travels** to the next anchor (`layout`, `smooth`) instead of closing
and reopening. *RM:* static outline, and the popover fades between anchors.

---

## 6. Interruptibility and state rules

1. **State first, animation second.** Update state immediately, and let the animation catch up. Never `await` an animation
   before a state change, navigation or network call. Use `onAnimationComplete` only for cleanup (e.g. clearing
   `view-transition-name`).
2. Every `AnimatePresence` that wraps persistent UI uses `initial={false}`, so the first paint never animates (no "page
   assembling" on app load). The landing hero is the one intentional exception.
3. Reversal retargets: open→close mid-way plays back from the current value with the current velocity (Motion's default). Never
   restart from the end.
4. Gestures can grab anything mid-animation: a settling sheet, a returning swipe row or a dropping card are all draggable again
   immediately (Motion drag, and Vaul both support this).
5. Rapid repeats coalesce: holding `j` moves the cursor at key-repeat rate, the drawer content swaps without per-step animation, and
   the score ring in the drawer retargets instead of replaying.
6. No animation is required to read state: every final state is correct without the transition (tests run with reduced
   motion, §10).
7. Exits are faster than enters (120 ms vs 180–240 ms). Leaving should never feel heavier than arriving.

---

## 7. Transform-and-opacity rule

**Animate only `transform` (x, y, scale, rotate) and `opacity`.** Allowed exceptions are compositor-cheap or tiny:

| Property | Where | Why it's OK |
|---|---|---|
| SVG `pathLength` / `stroke-dashoffset` | score ring, checkbox mark | paint of a small element |
| `clip-path: inset()` | landing title reveals | composited in modern engines |
| `outline-offset` | focus snap (4→2 px, 120 ms) | one element, paint only |
| `background-color` / `color` | 120 ms hover tints on small controls | paint of a small box |

**Never animate**: `width`, `height`, `top`, `left`, `margin`, `padding`, `border-width`, `font-size`, `box-shadow` (fade an `::after`
that carries the shadow instead), `filter: blur`, `backdrop-filter`, or gradients. **Never use** `transition: all`. `will-change` is never set
by hand. Motion sets and clears it during animations. Layout changes animate through Motion `layout` (FLIP transforms), within
`MOTION_LIMITS.layoutMaxItems`.

Shadow fade recipe:

```css
.lift { position: relative; }
.lift::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: var(--shadow-md);
  opacity: 0; transition: opacity var(--duration-fade) var(--ease-out); pointer-events: none; }
.lift:hover::after, .lift[data-dragging]::after { opacity: 1; }
```

---

## 8. Landing page storyboard

The landing page tells one story: **noise → one signal → you act**. Scroll *is* the timeline, as on Apple's product pages,
where the scroll position scrubs pinned scenes forward and backward and copy changes per act. Nothing autoplays loudly, the user can stop at any frame, and
every scene's final state is meaningful on its own. All scroll-linked values are Motion values (`useScroll` + `useTransform`),
which run on the browser's hardware-accelerated `ScrollTimeline` where available and never re-render React per frame. Constants
are in `landing` in `motion.ts`.

Global landing rules:
- The nav is sticky and 56 px tall. Its background crossfades from transparent to `bg/85` with an 8 px blur when `scrollY > 8` (`useMotionValueEvent`).
- Section headings reveal with `variants.reveal` (`whileInView`, `viewport={{ once: true, amount: 0.3 }}`).
- Every scene pauses when off-screen (`useInView`) or when the tab is hidden (`visibilitychange`).
- Mobile: pinned scenes are shortened (heights in `svh`, so the URL bar can't cause jumps). Phones use the "mobile" column below.
- Copy is in DESIGN §6.3 and §8 voice: one sentence per act, Instrument Serif display for act titles, Geist for the line under each.

### L1 — Hero: the radar assembles itself (100 svh)

**Static first paint (the LCP)**: lockup, the headline "Every opportunity that fits you. *Nothing that doesn't.*", the one CTA, and the
empty feed frame with reserved height. **The headline does not animate in**, because animating it would delay LCP. The motion lives in the
feed.

| t (ms after hydration) | What moves | How |
|---|---|---|
| 0–240 | Feed frame | opacity 0→1 + scale 0.98→1 (`smooth`) |
| 120–720 | Header "Watching **338** sources · **4,812** listings" | count-up 0→value, 600 ms ease-out (a landing-only exception, decorative) |
| 200 + i·110 | Row i (6 rows) assembles in four beats | (a) the divider draws: scaleX 0→1 from the left, 240 ms; (b) the logo tile scales 0.6→1 + fades (`snappy`); (c) the title reveals with `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, 240 ms; meta fades 120 ms later; chips slide in x 6→0 with a 30 ms stagger; (d) the ring fills (`data`) while its number counts |
| ~1,100 | Row 3 receives its "Possibly stale" badge | scale 1.1→1 + fade (`snappy`), a "stamp" |
| 1,400, then every 2,400 | **Live mode**: a new row inserts at the top | siblings shift with `layout` (`gentle`), the row assembles in one beat (`row` variant), the bottom row fades out under the frame's mask, and the frame's corner **beacon ping** fires: one ring scales 0.4→1.6 and fades 0.24→0 over 1.6 s, ease-out (ambient, landing only, tied to a new signal arriving) |
| on hover / focus of a row | Fit breakdown popover | `variants.popover`. Live mode pauses while the pointer or focus is inside the frame |

**Scroll-out** (`landing.heroScrollOut`, offset `['start start', 'end start']`): headline `opacity` 1→0 and `y` 0→−40 over progress
0→0.6; frame `scale` 1→0.94 and `y` 0→−48. The page gains depth as the hero recedes.

**Mobile:** the frame sits under the CTA, shows 4 rows, and has no scroll-out scale (y only).
**Reduced motion:** a static seeded list with filled rings and no live mode. A small "Play" button can start the live feed
(user-initiated motion is allowed).

### L2 — "Sources → Fit → Alerts": one pinned, scrubbed sequence (320 svh, sticky 100 svh)

`useScroll({ target, offset: landing.story.offset })`. Each act maps its own slice of `scrollYProgress` to 0..1:
`const a1 = useTransform(p, landing.story.acts.sources, [0, 1])` (clamped). The copy column on the left crossfades between the three
act lines (each opacity = a bell over its act). A three-step progress rail at the bottom ("Sources · Fit · Alerts") fills with `scaleX`
from the same progress.

| Act (progress) | Scene | Motion values |
|---|---|---|
| **1 Sources** (0–0.34) — "338 sources. Watched for you." | 36 source chips (favicon + mono name: "Greenhouse · stripe", "Lever", "Devfolio", "Unstop", …) start scattered as noise across the stage, at opacity 0.35 with a ±3° tilt and seeded positions (deterministic PRNG). They converge into a single funnel column at centre | per chip *k*: `t = clamp((a1 − k·0.012) / 0.6)`; `x`, `y` lerp scattered → funnel slot; rotate → 0; opacity 0.35 → 1. A counter scrubs 0 → 338 |
| **2 Fit** (0.34–0.68) — "Ranked against your resume. With the working shown." | The funnel collapses into 6 listing rows (the chips fade and scale to 0.9 as the rows fade in). Rings fill, rows **re-sort by score**, and rows under 60 dim | ring `pathLength` = a2 · score; row `y` lerps feed order → score order (precomputed offsets, eased); opacity of low-fit rows 1 → 0.35. The top row's breakdown bars grow with `scaleX` = a2 · weight |
| **3 Alerts** (0.68–1) — "And it tells you the moment one fits." | The top row (fit 91) lifts and the others fade to 0.2. A push notification card slides in at the top right ("Strong fit: ML Research Intern · Meridian AI Lab · Fit 91 · 9d left"). The beacon mark pings once | top row scale 1 → 1.03, y → −4; notification x 24 → 0 and opacity 0 → 1 over a3 0–0.4. **Ping is a triggered one-shot** when progress crosses `landing.story.pingAt` (0.84), via `useMotionValueEvent`. It re-arms below 0.7 |

Implementation sketch:

```tsx
const ref = useRef<HTMLElement>(null);
const { scrollYProgress: p } = useScroll({ target: ref, offset: landing.story.offset });
const a2 = useTransform(p, landing.story.acts.fit, [0, 1], { clamp: true });
const ring = useTransform(a2, (v) => v * (score / 100));
const y = useTransform(a2, [0, 1], [feedOffset, sortedOffset]);
return (
  <section ref={ref} className="h-[320svh]">
    <div className="sticky top-0 h-svh">
      <m.div style={{ y }}>… <m.circle style={{ pathLength: ring }} /> …</m.div>
    </div>
  </section>
);
```

No scroll snapping: the user can rest mid-act and the frame still makes sense.
**Mobile** (240 svh): 16 chips. Act 2 shows 4 rows, and the notification enters from the top.
**Reduced motion:** no pinning. Three static panels stacked (the final frame of each act) with their copy.

### L3 — Deadline timeline sweep (180 svh, sticky)

A five-week strip (`WeekStrips` in landing mode) wider than the viewport. With `useScroll({ target, offset: landing.timeline.offset })`:
the strip translates `x` from 0 to −(stripWidth − viewportWidth). The **today line** sweeps from the strip's left edge to its date
over `landing.timeline.sweep` (0–0.7). Each pill reveals as the line passes its day: `opacity` and `scale` 0.85→1 mapped over
`[tDay − 0.03, tDay]`, where *tDay* is the pill's x as a fraction of the sweep. Deadline urgency words and colours are visible on each pill. After 0.7, the counter
"6 deadlines in the next 14 days" rolls in (digit roll).
**Mobile:** no pin. A vertical agenda whose day groups reveal with `whileInView` (`reveal`, 40 ms stagger).
**Reduced motion:** a static strip with the today line in place and every pill visible.

### L4 — Fit-score explainer: the weights, alive (not pinned)

A 160 px `ScoreRing` with its number in `mono-lg`, six weight sliders (Semantic, Skills, Role, Eligibility, Location, Freshness),
the contribution bars, and three sample rows beneath.

- **Enter** (`whileInView`, once, amount 0.4): bars grow from 0 (`data`, 40 ms stagger), and the ring fills and counts.
- **Idle demo**: after `landing.explainer.idleBeforeDemo` (4 s) with the section in view and no pointer inside, the weights cycle through three presets
  every 3.2 s: *Balanced → Skills first → Remote first*. Each change animates the slider thumbs (`smooth`), bars (`data`), ring and
  number (`data` + digit roll), and the sample rows **re-sort** with `layout` (`gentle`). A caption names the preset.
- **Hands on**: any pointer or keyboard interaction stops the demo for the session. The dragged slider tracks 1:1. The other weights
  renormalise and glide (`snappy`), and the ring, bars and rows react within the same frame budget. This is the "every score shows its working"
  moment.

**Mobile:** the same, with sliders stacked and the rows below. **Reduced motion:** no idle demo, and values update instantly (still interactive).

### L5 — Privacy (static)

Copy block plus three facts. Reveal is `variants.reveal` only. Nothing else moves here, and the calm is deliberate after L4.

### L6 — Finale: the light lands on the button (100 svh, forced dark)

A full-bleed `.dark` band (dark even in light theme), so the lamp reads as a lamp. The large mark sits left of centre in `accent`
(#FFB547), with the headline "Your radar is ready when you are." and [Continue with Google].
`useScroll({ target, offset: landing.finale.offset })` (`['start end', 'center center']`):

- A flat **light cone** (7 % `accent`, the same construction as the OG card) emerges from the mark's source. Its rotation goes from
  `beamFrom` (−45°, the mark's own beam direction) to `beamTo` (0°, aimed at the CTA), and its length scales 0→1. **The mark itself
  never rotates** (brand rule). Only the light moves.
- When progress ≥ `lightsAt` (0.95), the CTA is "lit": its border crossfades to `accent` and a `::after` halo (`accent` at 12 %,
  16 px spread) fades in (`smooth`). This is triggered once and reversible on scroll back.

**Mobile:** the cone points down at the button and is shorter. **Reduced motion:** the cone is static and already on the button, which is lit.

### L7 — Footer (static)

---

## 9. Reduced-motion matrix

Triggered by `prefers-reduced-motion: reduce` (Settings "System") or Settings "Reduced". "Full" opts out. Tokens set durations to
0.01 ms and distances to 0, and `MotionConfig reducedMotion` drops transform and layout animations. The equivalents:

| Pattern | Full motion | Reduced |
|---|---|---|
| Press / release | scale spring | background tint only |
| Hover lift | y −2 + shadow fade | shadow fade only |
| Drawer / side panel / sheet | slide (`smooth`) | fade 120 ms |
| Bottom-sheet drag | 1:1 + snap spring | 1:1 drag, instant snap |
| List enter / exit / reorder | stagger, x/y travel, FLIP | fade in/out, instant reorder |
| Live inserts | in-place enter + 4 s bar | "N new" pill only, instant insert |
| Shared element morph | layoutId / View Transition | none; fade |
| Skeleton | shimmer + crossfade | static + instant swap |
| Count-up / digit roll | 240 ms / roll | instant value |
| Score ring | `pathLength` fill + count | rendered filled |
| Kanban drag | lift, part, fly-in drop | 1:1 drag, instant placement |
| Toasts | slide + spring stack | fade |
| Palette | scale + y | fade |
| Tab / segment indicator | slides | jumps; labels crossfade |
| Theme / route | View Transition crossfade | instant |
| Coach marks | outline pulse ×2, popover travels | static outline, fade |
| Landing hero | assembling + live feed + ping | static list, "Play" button |
| Landing L2 / L3 | pinned scrub scenes | static stacked final frames |
| Landing L4 | idle demo + animated recompute | no demo, instant recompute |
| Landing L6 | cone sweeps, button lights | cone static, button lit |

Never convey information only through motion. Every reduced variant shows the same final information.

---

## 10. Performance budgets and verification

| Budget | Target |
|---|---|
| Product frame time | 60 fps (≤ 16.7 ms) for feed scroll, drawer open, palette, Kanban drag on a Chrome 4× CPU-throttled laptop and on a mid-range Android phone. At most 1 long task (> 50 ms) per interaction |
| INP | < 200 ms on every interaction (SPEC). The press visual is on the same frame |
| Animation script | ≤ 4 ms per frame of JS during animations, with no React re-render per frame (Motion values only) |
| Concurrency | ≤ 24 simultaneously animating elements in product UI. Layout (FLIP) groups ≤ 30 items, otherwise crossfade |
| Motion bundle | `m` + `LazyMotion` + `domAnimation` (~29 kB) on first load. `domMax` (+38 kB) lazy on Radar and Tracker. No GSAP, Lottie or Three |
| Landing | Lighthouse performance ≥ 95, LCP < 2.0 s on 4G (static headline), CLS < 0.01 (reserved frames), TBT < 150 ms. Scene code is lazy-loaded when the section is within one viewport (`IntersectionObserver` + dynamic import). Scroll scenes drop ≤ 5 % of frames at 4× throttle |
| Off-screen | every looping or scroll-linked scene is paused when not in view or when the tab is hidden |

**Verification** (each phase):

- Playwright: a `page.emulateMedia({ reducedMotion: 'reduce' })` pass over every route, asserting final states. A trace
  (`context.tracing`) of open drawer → `j`×10 → close, and of a Kanban drag, checking for long tasks.
- Chrome Performance panel at 4× CPU: feed scroll, landing L2 scrub. Check for green frames and no "Layout" inside animation frames.
- CI grep lint (fails the build): `transition:\s*all`; `transition[^;]*(width|height|top|left|margin|padding)`;
  `animate=\{\{[^}]*(width|height)`; `stiffness:|damping:|visualDuration:` outside `packages/ui/src/motion.ts`; `motion\.` component usage
  (must be `m.`).
- `packages/ui/src/motion.test.ts` enforces the limits (durations ≤ 0.24, bounce ≤ 0.25, data springs at 0, stagger cap).

---

## 11. References (principles taken, not visuals)

- **Apple Human Interface Guidelines — Motion**: <https://developer.apple.com/design/human-interface-guidelines/motion>.
  Motion should be purposeful, brief and optional, and Reduce Motion replaces movement with fades. Applied in §1 and §9.
- **Apple WWDC23 — Animate with springs**: <https://developer.apple.com/videos/play/wwdc2023/10158/>. Springs "maintain
  continuity" of position and velocity. A retargeted spring "uses the velocity it had when it was retargeted". Duration plus bounce is
  the right mental model (bounce 0 is "the most versatile"; above about 0.4 "may feel too exaggerated for a UI element"). Don't wait for
  settling before user-facing changes. Applied in §1, §3 (all springs use `visualDuration` + bounce ≤ 0.25) and §6.
- **Apple product pages** (e.g. <https://www.apple.com/airpods-pro/>): scroll position is the timeline. Pinned scenes scrub
  forward and back under the user's control, copy changes per act, and the last frame of each scene stands alone. Applied in §8.
- **Linear**: speed is the feel. Hover and selection feedback are instant, the keyboard drives everything, and chrome stays still while
  content changes ([How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)). Applied in §4 (instant
  list hovers, keyboard echo) and §5.15 (static chrome).
- **Raycast**: the selection highlight is instant and the action bar shows each action's shortcut, so feedback teaches the keyboard
  ([A fresh look and feel](https://www.raycast.com/blog/a-fresh-look-and-feel)). Applied in §5.12 and the keyboard echo.
- **Motion docs**: [layout animations](https://motion.dev/docs/react-layout-animations) (`layoutId`, scale correction, SVG
  limitation), [AnimatePresence](https://motion.dev/docs/react-animate-presence) (`popLayout`),
  [scroll animations](https://motion.dev/docs/react-scroll-animations) (`useScroll`, ScrollTimeline acceleration),
  [bundle size](https://motion.dev/docs/react-reduce-bundle-size) (`LazyMotion`, `domAnimation` / `domMax`).
