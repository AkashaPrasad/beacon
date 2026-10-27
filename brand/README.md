# Beacon brand

**Tagline:** Every opportunity that fits you. Nothing that doesn't.

Alternates (same voice: precise, no hype):

1. The signal, without the noise.
2. Watches everything. Lights up what fits.
3. Internships, hackathons and scholarships, ranked against your resume, with reasons.

## The mark

A beacon is a light that cuts through noise. The mark has three geometric parts, all concentric with one point:

- **Source**: a solid dot, which is you and your profile, the point everything is measured from.
- **Field**: an open ring, standing for every listing, source and deadline out there, the noise.
- **Beam**: one tapered ray that leaves the source and exits the field through its only gap: the opportunity
  worth acting on.

The mark reads as a signal escaping a field, and at small sizes it still reads as "radar", which is what the product is.
It is deliberately not a lighthouse drawing, and it avoids the generic Wi-Fi/RSS arcs.

Construction, on the 512 master grid:

| Part | Geometry |
|---|---|
| Source | circle, centre (237.4, 274.6), r 62 |
| Field | arc r 160, stroke 30, round caps, open ±40° around the 45° axis (up-right) |
| Beam | annular sector r 92 → 248, ±22° on the same axis. Its inner edge is concentric with the source, leaving an even 30-unit gap |
| Bounding box | 62.4, 46.4 → 465.6, 449.6 (403 square). The ring centre is pulled 30 % back toward the canvas centre for optical balance |
| Favicon | its own heavier 32-grid drawing (ring r 8.4 / stroke 3.2, source r 3.6, beam ±24°, gap ±44°). It is not a scaled copy |

In the wordmark lockup, the mark is 1.12 × the cap height of Instrument Serif and centred on the cap band, with a gap of 24
units at a word size of 112.

## Files

| File | Use |
|---|---|
| `beacon-mark.svg` | Mark only, 512 viewBox, `currentColor`. Use it in the app (nav, empty states, loading) for both themes |
| `beacon-mark-accent.svg` | Lamp-black mark on the signal-amber tile (radius 112). Use it for the app icon and PWA icons |
| `beacon-wordmark.svg` | Horizontal lockup with live `<text>` in Instrument Serif and `currentColor`. Use it in the app header once the webfont is loaded |
| `beacon-wordmark-outlined.svg` | The same lockup with the word converted to outlines. Use it anywhere the font is not guaranteed: README, GitHub, email, slides |
| `favicon.svg` | Simplified mark tuned for 16 and 32 px, on the amber tile. It reads on light and dark tab bars |
| `og-image.svg` | 1200 × 630 social card source: the source and its field at top right, casting one beam onto the row it found |
| `png/icon-192.png`, `png/icon-512.png` | PWA `icons` with `"purpose": "any"` (rounded tile, transparent corners) |
| `png/icon-maskable-512.png` | PWA icon with `"purpose": "maskable"`. It is full-bleed, and the mark sits inside the 80 % safe circle (farthest point 154 of 205) |
| `png/apple-touch-icon.png` | 180 × 180, full-bleed and opaque (iOS applies its own mask) |
| `png/favicon-32.png` | PNG fallback for `favicon.svg` |
| `png/og-image.png` | The `og:image` and `twitter:image` file. Social platforms do not accept SVG |
| `scripts/` | `render-icons.cjs` (icons via sharp), `og-render.html` (OG via headless Chrome with webfonts), `gen-wordmark.cjs` (both wordmarks via opentype.js) |

Copy whichever of these the web app needs into `apps/web/public/brand/`.

```html
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/brand/png/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/brand/png/apple-touch-icon.png" />
<meta name="theme-color" content="#F7F6F3" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#131110" media="(prefers-color-scheme: dark)" />
<meta property="og:image" content="https://beacon.spacesdrive.cc/brand/png/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

## Colour

Signal amber has two roles (see `docs/DESIGN.md` §3.1): `accent` #F5A524 / #FFB547 is the light itself, used for fills, and `accent-strong`
#945300 / #FFB547 is amber you read on a surface.

| Context | Mark colour | Ground |
|---|---|---|
| In product, light | `--color-fg` #1C1917 | `--color-bg` / `--color-surface` |
| In product, dark | `--color-fg` #EDEAE6 | `--color-bg` / `--color-surface` |
| Brand moments, light (landing lockup, empty-state hero) | `--color-accent-strong` #945300 | neutral paper only |
| Brand moments, dark (landing night section, OG) | `--color-accent` #FFB547 | charcoal only. This is the lamp in the dark |
| App icon, favicon | lamp black #1F1505 | amber tile #F5A524 |

The mark is always a single colour: source, field and beam are never coloured differently. Never place it on photos, gradients,
patterns or another saturated colour. Never use bright amber (`#F5A524`) for the mark on paper: at 2:1 it reads as a stain, not
a light. Use `accent-strong` instead.

## Clear space and minimum sizes

- **Clear space** is the diameter of the source on every side: 124 units on the master, about 31 % of the mark's width. For the
  wordmark, measure the source at lockup scale (about 28 units in the SVG file).
- **Mark:** at least 20 px. Below 20 px, use the `favicon.svg` geometry (on its tile) instead of scaling the master,
  because the master's ring stroke drops under 1.2 px.
- **Wordmark:** at least 96 px wide, or 24 px tall. Below that, use the mark alone.
- **App tile:** 16 px is the minimum, and only with `favicon.svg`.

## Don'ts

- Don't add gradients, glows, glass, outlines or drop shadows. The one exception is the OG and landing "beam" cone, which
  is a flat fill at 7 % opacity, never a gradient.
- Don't rotate the mark (the beam always exits up and to the right), mirror, skew or re-proportion it, and don't close the ring.
- Don't add more rings or beams: one signal is the whole point.
- Don't put the wordmark in another typeface (if the webfont is not loaded, use the outlined file). Don't change its case or
  letter-spacing.
- Don't pair it with emoji or sparkles, or with "AI" badges.

## Typography (brand)

The word is always **Beacon**, in sentence case, set in **Instrument Serif 400** with tracking of −1 at 112 (about −0.009 em). Taglines use
Instrument Serif and may set the second sentence in italic. Supporting text uses Geist, and numbers use Geist Mono. Fonts are free
(OFL) and self-hosted in the app via `@fontsource/instrument-serif`, `@fontsource-variable/geist` and
`@fontsource-variable/geist-mono`.

## Regenerating assets

The icons contain no text, so they can be rendered with sharp:

```sh
mkdir -p /tmp/beacon-render && npm i --prefix /tmp/beacon-render sharp@0.34.4 opentype.js@1.3.4
NODE_PATH=/tmp/beacon-render/node_modules node brand/scripts/render-icons.cjs
```

Generate the wordmarks (live and outlined) from the font file:

```sh
curl -sSLo /tmp/beacon-render/InstrumentSerif-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf
NODE_PATH=/tmp/beacon-render/node_modules node brand/scripts/gen-wordmark.cjs /tmp/beacon-render/InstrumentSerif-Regular.ttf
```

The OG card contains text, so render it in Chrome with the webfonts loaded. `og-render.html` inlines the SVG after the fonts
finish loading:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=10000 \
  --allow-file-access-from-files --screenshot="$PWD/brand/png/og-image.png" \
  "file://$PWD/brand/scripts/og-render.html"
```

(sharp's librsvg resolves fonts through CoreText on macOS and ignores `@font-face`, so it would render the card in a fallback face.)

Validate the SVGs after any edit:

```sh
for f in brand/*.svg; do python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" "$f" && echo "ok $f"; done
```
