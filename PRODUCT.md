# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students in tech (CS/engineering undergrads and fresh grads, India-first, global reach) hunting internships, first jobs, hackathons, scholarships/fellowships, research and open-source programs. Situation: 10–30 tabs, unfiltered alerts, missed deadlines, ghost listings, no idea whether they fit. Job: see only what fits them, never miss a deadline, apply where it counts, and keep track without a spreadsheet.

## Product Purpose

Beacon is an explainable opportunity radar. It watches any source a student adds (company career pages via ATS APIs, public job/hackathon APIs, feeds, or a crawler), ranks everything by a transparent fit score against the student's parsed resume and preferences, flags ghost/stale listings, alerts through web push and in-app rules, and tracks applications with follow-up nudges. Success: a student finds and acts on fitting opportunities in minutes a day, with confidence about why they fit.

## Positioning

Every match is explained (score breakdown, why it fits, what's missing) and every source is the student's choice — no black box, no paywall on alerts, bring-your-own AI or none. One radar across jobs, internships, hackathons, scholarships and open-source programs, instead of one tool per vertical.

## Operating Context

Daily check-ins on laptop and phone between classes; onboarding once from a resume; deadlines drive hackathons/scholarships; applications tracked over weeks. Evaluated as a graded end-term project (viva demo) and used by real students.

## Capabilities and Constraints

Google sign-in and email/password; conversational onboarding from a resume; Radar feed with fit scores and a left filter rail; full-page listing detail with Back; deadline timeline; sources manager with live ATS detection and 7 curated packs (338 verified sources); alert rules (push + in-app only — no email/Telegram); tracker Kanban with nudges; profile editor; settings (appearance, AI keys/BYOK, notifications, privacy/export/delete); admin overview. Stack: React 19 + Tailwind v4 + shadcn + Motion, Express API, BullMQ worker, MongoDB Atlas. Free product; server LLM default is Meta Muse Spark; AI-off mode must work. Hosted at beacon.spacesdrive.cc.

## Brand Commitments

Name: Beacon. Mark: dot + ring + one beam (brand/). Tagline: "Every opportunity that fits you. Nothing that doesn't." Owner's binding visual direction (2026-10-27, revised late evening): **NO blue accent, NO gradients anywhere; professional, seamless, minimalist colours** (graphite primary actions, warm-neutral canvas, flat white surfaces with hairline borders, one restrained evergreen accent, very muted type tints). Earlier direction: **not flat, not basic; depth and layered surfaces; a new, more vivid colour system (replace the amber-on-paper look); rich, seamless motion and transitions everywhere; professional and polished like Linear/Vercel/Arc/Apple; uncluttered yet complete; keep the Radar's left filter rail; detail views are full pages.** Previous DESIGN.md bans on multi-hue gradient heroes, emoji icons and stock illustrations still stand; the ban on depth/glow/atmosphere does not.

## Evidence on Hand

Real verified sources and API samples in `seed/`; research statistics in `docs/SPEC.md` §1 (cited); fixture listings/profiles in `packages/shared/src/__fixtures__` (fictional, labelled). No testimonials or customer logos as endorsements (company logos appear only as sources).

## Product Principles

1. Explain every score; never hide why.
2. The student chooses the sources; the product does the watching.
3. Fast and calm: one glance → one decision; power features one click or one key away.
4. Honest states and honest copy; no hype, no dark patterns.
5. Privacy-first AI: BYOK, consent, and an AI-off mode that still works well.

## Accessibility & Inclusion

WCAG 2.2 AA; full keyboard operation; reduced-motion variants for all motion; colour never the only signal.
