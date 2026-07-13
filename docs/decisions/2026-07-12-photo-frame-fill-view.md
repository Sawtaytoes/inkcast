# "Photo Frame (Fill)" is a photo view that fills the panel instead of letterboxing

- **Status:** Accepted
- **Date:** 2026-07-12
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

Add a photo view **`Photo Frame (Fill)`** alongside the existing `Photo Frame`.
Both are face-steered ("shift the crop, never zoom into a face" — see
[2026-07-02-face-crop-shifts-never-zooms](2026-07-02-face-crop-shifts-never-zooms.md)),
but they differ in the fallback when the faces span too far to all fit the
maximal cover-crop window:

- **`Photo Frame`** — letterboxes on white so no configured face is cut. (The
  2026-07-02 behavior, unchanged.)
- **`Photo Frame (Fill)`** — always fills the panel: it centres the crop on the
  face mass (keeping the primary/central faces, cropping the outermost) rather
  than adding white bars.

This is a NEW view, selected through the HA View select over MQTT like any other
view; it does not change `Photo Frame`, so both are available per display. The
`Photo Frame (Duo)` columns also use the fill crop (a column never letterboxes).

## Context

On a landscape panel (the 7.3" Impression, 800×480) a portrait photo
cover-crops to a short horizontal band; portrait group/full-body shots have
faces spanning more vertical range than the band holds, so the `Photo Frame`
face-aware crop hits its letterbox fallback constantly — the maintainer reported
"too much letterboxing" on that panel. Rather than change `Photo Frame` (some
displays want the guarantee that no one is ever cut), Fill is offered as a
separate view so the panel can be told to fill.

This does **not** supersede the 2026-07-02 decision: `Photo Frame` still
letterboxes exactly as decided. Fill is an additional, opt-in view.

## Why

The maintainer wants the big/landscape frames to use the whole panel for
portrait photos, keeping the important faces, instead of wasting panel space on
white bars — while keeping the strict no-one-cut `Photo Frame` as its own
choice.

## Evidence

> "the 7.3" … I'd honestly like to look at face zooming again … shift the
> portrait images up or down to ensure faces were all there but use most of the
> panel space" … [too much letterboxing] … "Can we do add that as one of the
> photo views?"

— maintainer, 2026-07-12
