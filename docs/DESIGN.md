---
name: Beacon — Quiet instrument
description: A calm, explainable opportunity workspace for students.
colors:
  canvas: '#fafaf9'
  surface: '#ffffff'
  graphite: '#111318'
  secondary: '#52555e'
  muted: '#62656e'
  evergreen: '#1e6b4f'
  border: '#e6e6e3'
typography:
  body:
    fontFamily: Geist Variable, Geist, sans-serif
    fontSize: 0.875rem
    lineHeight: 1.5
  display:
    fontFamily: Geist Variable, Geist, sans-serif
    fontWeight: 600
rounded:
  panel: 14px
spacing:
  small: 8px
  medium: 16px
  large: 24px
---

# Beacon design system

## Overview

The dashboard is an operating surface: students scan opportunities, understand their fit,
then save, apply or track. Warm neutral surfaces and graphite actions keep the content first.
Evergreen identifies selection, links and focus. This contract supersedes the earlier
“Luminous instrument” cobalt, grain and glow direction. Product truth lives in `PRODUCT.md`;
tokens are implemented in `packages/ui/tokens.css`.

## Colors

Light is the default, with a warm canvas, white panels, graphite foreground and muted secondary
text. Dark mode uses charcoal surfaces and light foregrounds. Primary actions remain neutral
in every appearance preset. Saved legacy preset IDs remain compatible with the API; settings
present evergreen, forest, teal and ink. Opportunity types and tracker stages use restrained
slate, graphite, clay, moss, plum, teal and ochre tints, always accompanied by text.

No blue accent, decorative gradients, glows or background grain. Status labels, fit scores,
closed listings and hidden listings must remain readable; do not fade entire data rows.

## Typography

Self-hosted Geist provides interface headings and body text. Geist Mono is reserved for
scores, amounts, dates and keyboard shortcuts. Instrument Serif is used for marketing and
onboarding questions. Headings wrap; metadata may truncate with its full value available in
the detail page. All sizes follow the user's font-size setting.

## Layout

The desktop shell has persistent top navigation and a pinned Radar filter rail. The rail may
collapse or move into a popover. Phones use a bottom navigation bar, a Me page for secondary
destinations, and a bottom sheet for filters. Content uses `px-gutter` and responsive grids.

Radar defaults to cards, with explicit list, timeline and board views. The daily summary,
search, count and Tune control stay visible; Tune contains sorting, minimum fit and saved
views. Each card shows identity, title, company/location/pay, type, deadline and fit.
Touch actions remain visible and wrap without horizontal page scrolling.

Details are full pages. Back restores the originating list; a deadline opened from Deadlines
returns there. Profile and settings are grouped by task. Sources has a persistent URL input;
detection reveals additional options only once they are relevant. Onboarding presents one
question at a time and lets students review or edit answers before finishing.

## Elevation & Depth

`e1`, `e2`, and `e3` provide surface, raised and overlay levels. Panels use a single hairline
border and a restrained soft shadow. Avoid overlapping border-like shadow strokes. Floating
menus and dialogs remain distinct from their scrim. Blur is limited to functional chrome and
overlays; it does not decorate content.

## Shapes

Panels and cards use a 14px radius; small controls use the smaller token radii. Pills are for
compact types, statuses and chips. Dividers group rows inside a surface; avoid nested cards.

## Components

- Buttons use shared variants: primary, secondary, ghost, danger and link. Each region has one
  clear primary action. Icon-only controls have accessible names.
- All inputs and keyboard controls have a visible evergreen focus ring, including embedded
  chip editors. Touch targets use the density-aware control sizes.
- Loading uses a quiet skeleton pulse with reserved layout space; reduced motion removes it.
- Motion comes from shared springs and tweens: brief route transitions, bounded row entrances,
  tactile presses and continuity between related states. Reduced-motion settings are honoured.
- Fit is shown as a number with an accessible description. Full explanations live on details.
- Errors identify the problem and recovery; empty states give a useful next action. Counts
  represent actual API data. Mock examples stay in mock mode.
- Undo waits for the original mutation to settle before writing its inverse. Toasts expand so
  multiple actions remain reachable.
- Company favicons have a local initial fallback. A third-party favicon failure must never
  prevent reading or operating the application.

## Do's and Don'ts

Keep daily decisions visible and advanced controls discoverable. Use whitespace and alignment
to establish hierarchy; preserve information through details and disclosures. Keep one
consistent shell across Radar, Deadlines, Tracker, Sources, Alerts, Profile and Settings.
Do not introduce invented claims, decorative statistics, emoji icons, gradients or a new
accent palette. Do not hide touch actions or use opacity to make important text illegible.

The UX structure follows [NN/g's progressive-disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/)
and [Carbon's data-table guidance](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines):
common decisions remain available, while clearly labelled secondary controls contain advanced work.
