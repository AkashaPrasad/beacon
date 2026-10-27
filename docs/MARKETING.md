# Public site — concept, pages, verification

Owner: marketing fork (Fable). Authority above this file: `PRODUCT.md`, `docs/DESIGN.md`, `docs/MOTION.md`.

## Concept

**The instrument itself.** The home page opens on a night field — dotted radar grid, grain, the lamp — with a
real 3D beacon (`features/landing/components/Beacon3D.tsx`: emissive core in the mark's open ring, an
additive light cone sweeping once every 12 s, two faint orbit rings, pointer parallax) and the live demo
radar under it. The panel's highlight is driven by the beam angle (`lib/beam.ts`), so the listing cards
brighten as the light passes. Everything after the hero is the **luminous light world**: tinted white
canvas with muted coloured washes (≤ 7 % tints), white elevated cards, role-coloured icon tiles and 2 px
hue rules. Instrument Serif at 36–64 px for display lines, Geist for everything else, Geist Mono for numbers
and eyebrows. Strict rhythm: eyebrow → heading → one sentence → content; sections step in 24/48/96.

Hard bans kept: no multi-hue gradient heroes, no emoji icons, no stock art, no glass as decoration (glass
only on the nav and the finale CTA card). Tech-student framing throughout.

## Pages (`src/routes/public.tsx`; all prerendered via `prerenderPages`)

| Route                | Module                           | Notes                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | `features/landing/LandingScreen` | hero (3D beacon + live radar) → proof strip (count-ups, logo marquee) → Sources→Fit→Alerts pinned scene → deadline timeline → ghost detection + tracker nudges → fit-weights explainer → honesty + FAQ (paper band) → finale (beam lands on a glass CTA card) |
| `/features`          | `marketing/pages/FeaturesPage`   | 12-tile bento with live component vignettes, each tile hued by role                                                                                                                                                                                           |
| `/how-it-works`      | `marketing/pages/HowItWorksPage` | ingestion ladder with real counts, the formula, three AI modes                                                                                                                                                                                                |
| `/packs`             | `marketing/pages/SourcesPage`    | searchable, filterable, virtualised directory of all 338 sources (favicons, kind, read path, counts)                                                                                                                                                          |
| `/pricing`           | `marketing/pages/PricingPage`    | free forever, what is included, honest "typical tool" comparison, money FAQ                                                                                                                                                                                   |
| `/about`             | `marketing/pages/AboutPage`      | the problem in numbers (SPEC §1), five principles, open-source + contact                                                                                                                                                                                      |
| `/privacy`, `/terms` | `legal/*` via `LegalPage`        | same frame, prose column                                                                                                                                                                                                                                      |
| `*`                  | `not-found/NotFoundScreen`       | beam motif, Radar / Home actions                                                                                                                                                                                                                              |

Shared: `marketing/components/MarketingLayout` (glass nav with "Open Beacon" when a session is likely,
phone menu, footer), `Seo` (per-page head tags; prerender writes the static copies), `Atmosphere`
(`Band` tones `night | tint | paper | wash`, `Eyebrow`, `Container`), `CountUp`, `LogoMarquee`, `Faq`,
`Tilt`. Styles: `marketing/marketing.css` (atmosphere layers, beam, panels, tiles, hued palette, type
scale). `public/sitemap.xml`, `public/robots.txt`.

## Motion and performance rules

- Ambient loops (beam, pings, marquee) pause off-screen (`[data-paused]`) and stop under reduced motion;
  the 3D canvas renders only while in view and the tab is visible, DPR ≤ 1.5, `powerPreference: low-power`,
  and is a lazy chunk mounted after hydration (no layout shift: the hero reserves its height).
- Scroll scenes are scrubbed (`useScroll`), transform/opacity only; reveals use `variants.reveal`.
- Below-fold sections are lazy (`SceneSlot` within one viewport) and `content-visibility: auto`.

## Verification (2026-10-27, dev server; production build pending — see below)

- `pnpm --filter @kestrel/web typecheck`: clean for `features/{landing,marketing,legal,not-found}` and `routes/public`.
- `e2e/marketing.spec.ts` (chromium + iPhone 14): every public route renders and is titled, axe serious/critical = 0,
  nav/footer links resolve, directory search/filter, phone menu — see the run log in the fork report.
- Screenshots: `docs/ux-audit/marketing/` (hero desktop/mobile, scroll stops, features, how-it-works, packs, pricing, about).
- **Lighthouse: not run yet.** `vite build` currently fails on an import outside this scope
  (`features/deadlines/DeadlinesScreen.tsx` → missing `features/radar/components/drawer/ListingDrawer`).
  Once that is fixed: `pnpm --filter @kestrel/web build:mock && pnpm --filter @kestrel/web preview`, then
  `npx -y lighthouse http://localhost:4173/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo`
  (targets: ≥ 90 mobile on `/`, ≥ 95 on text pages). Expected risks: the three.js chunk (~150 kB gz) is lazy
  and off the critical path; the hero LCP is the prerendered headline.

## Reference principles

Linear (calm density, one accent), Vercel (tables, empty states, restraint), Raycast (product-in-context
hero), Resend/Clerk (editorial type over instrument UI), Arc (warm honesty copy), Cal.com (open-source
pricing page played straight), PostHog (hued feature tiles), Apple product pages (one idea per viewport,
scroll-scrubbed demonstrations, restrained glow). Stated as principles; nothing was copied.
