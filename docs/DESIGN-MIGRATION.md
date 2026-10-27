# Design migration — Quiet instrument

The final direction is recorded in `PRODUCT.md` and `docs/DESIGN.md`: graphite actions,
warm-neutral canvas, white surfaces and restrained evergreen selection. Earlier cobalt,
gradient, grain, glow and heavy card-outline guidance is superseded.

Token names and API preset IDs remain compatible. Every screen uses the shared tokens,
button/input primitives, motion constants and shell. Legacy appearance presets now retain
neutral actions; the settings labels describe the actual colours.

Verify new work at desktop and phone widths in both themes. Keep the Radar rail, full-page
details, visible touch actions, readable status text, a visible keyboard focus ring and
reduced-motion support. Source entry, inline profile edits and Undo must remain operable.

`apps/web/scripts/verify-release.mjs` audits dashboard routes with axe, captures reference
screenshots, checks runtime errors and checks horizontal overflow. The interaction smoke
suite is `apps/web/e2e/smoke-all.spec.ts`.
