# Landscape photo frames can show two portraits side by side (server-composed)

- **Status:** Accepted
- **Date:** 2026-07-12
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

A landscape image-mode panel (e.g. the 13.3" e-ink Photo Frames) can render
**two portrait photos side by side** in a single frame instead of one
letterboxed/cover-cropped photo. It is a distinct **view** — `Photo Frame
(Duo)` — selected through the existing HA View select over MQTT, **not** a
config knob. (An earlier draft made it a "Photo Layout" config entity; it was
reworked into a view before shipping so displays are chosen the same way as
every other view — through automations that set the View select. There are
three photo views: `Photo Frame` (letterbox), `Photo Frame (Fill)`, `Photo
Frame (Duo)`.)

When a device is on `Photo Frame (Duo)` and the panel is landscape, the server
picks two portrait assets, face-steers each into its own half-panel column
(reusing the fill crop so a column never letterboxes) and composites them with a
thin white gutter into one panel-sized PNG. The composition is **server-side**
(Inkcast image mode): the device still just draws one PNG. On a portrait panel
the view falls back to a single photo.

**Fallback:** on `Photo Frame (Duo)`, when two *portrait* assets aren't
available this cycle (only landscape matches, or the pool is too small), the
frame falls back to a single full-panel (fill) photo. A frame is always shown;
the view never leaves the panel blank or half-empty.

## Context

The 13.3" frames are landscape. A portrait photo cover-cropped to landscape is a
narrow horizontal band that discards most of the image, and the face-aware crop
often letterboxes it (see
[2026-07-02-face-crop-shifts-never-zooms](2026-07-02-face-crop-shifts-never-zooms.md)).
ImmichKiosk fills a landscape screen by pairing two portraits — using the whole
panel and keeping both photos whole. CastKit's crop function already takes an
arbitrary target size, so a half-width target per photo reuses all the existing
face-steering logic; only a compositing step and a picker for two portrait
assets are new.

## Why

The maintainer wants the big landscape frames to use the whole panel for portrait
photos instead of wasting it on bars or a heavy crop — matching the ImmichKiosk
side-by-side layout — while keeping every configured face in frame.

## Evidence

> "With a horizontal screen, this ImmichKiosk app does two portrait images
> side-by-side. We should be able to update CastKit to do that right? Good for my
> big screens. … it's my 13.3" e-ink screens that I want this right now"

— maintainer, 2026-07-12
