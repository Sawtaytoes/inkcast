# Phase 0 — findings & recommendations

The Phase-0 proof-of-concept "spine" is built and runs end-to-end: a React
now-playing view → rendered by two engines → per-panel supersample/downscale/
dither → comparison contact sheets, plus a browser dev-preview. This doc records
what the bake-offs showed so the engine + dither choices can be made from
evidence. Regenerate the sheets any time with `yarn bakeoff` (output under
`render-output/`, which is gitignored).

## What's built

- **`@inkcast/core`** — panels, palettes (mono + the exact Spectra-6 E6 palette,
  blended 0.5 vivid/device to match the on-device look), device registry, and the
  supersample→Lanczos-downscale→dither pipeline (threshold, ordered/Bayer,
  Floyd–Steinberg, Atkinson, Stucki, Sierra).
- **`@inkcast/views`** — the now-playing card (inline styles, flexbox — renders
  identically under both engines).
- **`@inkcast/render`** — Chromium (Playwright) and Satori (SVG→resvg) engines.
- **`@inkcast/web`** — Vite dev-preview: live-edit the track, see every panel at
  native size (`yarn dev`).
- **bake-off scripts** — `yarn bakeoff:render` (Decision 1) and
  `yarn bakeoff:dither` (Decision 2).

## Decision 1 — render engine (Chromium vs Satori)

See `render-output/render/engine-comparison.png`.

- **Chromium — recommended default.** Layout is faithful on both panels: the
  `space-between`/`flex-grow` column lays out correctly, "Twilight Force" fits on
  one line on the E6, banner spacing is clean. Because the dev-preview is a real
  browser, **what you see in the preview is what the device gets** (pre-dither).
- **Satori — diverges, use only for the simplest cards.** On the E6 the
  `NOW PLAYING` banner overlapped the (oversized) artist text and the title
  wrapped to two lines; font metrics + flex handling differ from the browser. On
  the tiny mono panel it's passable but heavier. It's faster/lighter, but the
  preview/device divergence erodes the WYSIWYG-editor goal.

**Recommendation:** Chromium as the render engine. Keep the Satori engine in the
repo as a lightweight fast-path option, but it needs per-view tuning to match and
isn't trustworthy for arbitrary layouts.

## Decision 2 — dithering (per panel, the maintainer wanted to SEE this)

Sheets: `render-output/dither/<panel>--{card,gradient,photo}.png`. Rows =
supersample 1×/2×/4×, columns = algorithm. Mono and E6 are separate sheets so the
choice can differ per panel (as the maintainer noted it likely should).

### Mono pHAT (250×122, 1-bit) — text is the job

- **Threshold** and the error-diffusion kernels all render text crisply (the card
  is already near-black/white, so diffusion barely changes it).
- **Ordered (Bayer)** is wrong for text — it stipples the white background with a
  dot texture. Avoid for text screens.
- Supersample gains are subtle for pure text (mostly slight edge smoothing).
- **Recommendation:** **threshold** (or Floyd–Steinberg) at **2×** for the pHAT's
  text screens. If a photo ever goes on the pHAT, switch that screen to
  error-diffusion.

### E6 Impression (800×480, 6-colour) — photos, colour fidelity

This sheet directly addresses the "colour looks awful" concern:

- **Threshold** is unusable for photos — posterized slabs of pure red/blue/yellow.
  (This naive quantization is what makes E6 look bad.)
- **Ordered (Bayer)** is surprisingly good — smooth, film-like halftone.
- **Floyd–Steinberg / Stucki / Sierra** are the winners — photographic with rich
  tonal gradation.
- **Atkinson** is cleaner but loses shadow detail / washes highlights.
- **Supersampling helps** — 4× visibly refines the error-diffusion grain vs 1×.
- The muted 0.5 device-palette blend keeps colour realistic rather than garish.
- **Recommendation:** **Floyd–Steinberg** (or Stucki) at **2×–4×** for the
  Impression's photo frame. Worth an A/B of FS vs Stucki on a real kids' photo on
  the actual panel before locking it.

### Current per-device defaults (in the registry, ready to tune)

| Device | Algorithm | Supersample |
| --- | --- | --- |
| pHAT (mono) | atkinson | 4× |
| Impression (E6) | floyd-steinberg | 2× |

These are starting points; adjust in `@inkcast/core/devices/device` after you
review the sheets. (The mono default is currently atkinson; the sheets suggest
**threshold** may be the better call for text — easy one-line change.)

## Open items

- **Render engine:** confirm Chromium (recommended) so Phase 1 can build the
  server around it.
- **Dither defaults:** pick per-panel algorithm + supersample from the sheets;
  ideally verify E6 on a real kids' photo on the physical panel.
- **Font:** DejaVu Sans is a placeholder — see
  [research/eink-fonts.md](research/eink-fonts.md) (Atkinson Hyperlegible is the
  leading candidate for the mono panel). Swappable in one place
  (`@inkcast/render/fonts` + the view `font-family`).
- **MQTT broker creds** (host + token/user) — needed to wire the HA Image-entity
  push (Phase 0's last step / Phase 1).
- **GitHub publish** — repo is a clean local git repo; not pushed yet (awaiting
  go-ahead; it's outward-facing).

## Regenerate

```bash
yarn install
yarn playwright install chromium
yarn bakeoff            # both sheets → render-output/
yarn dev                # browser dev-preview
```
