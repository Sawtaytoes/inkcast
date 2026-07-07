# CastKit is one platform: one server, Inkcast (image) and Slatecast (browser) as client modes

- **Status:** Accepted
- **Date:** 2026-07-07
- **Type:** Architecture / Product
- **Supersedes:** —
- **Superseded by:** —

## Decision

The repo is renamed **`castkit`** and becomes the umbrella platform. There is
**one server** (the evolved Inkcast server) with a per-device **client mode**:

- `image` (**Inkcast**): server renders a view → PNG → dither → retained MQTT
  image topic; the device is a dumb sink (e-ink Pis today; ESP32 e-ink later).
- `browser` (**Slatecast**): the device's kiosk browser loads `/d/<id>` and a
  tiny Preact SPA renders live views itself, with a WebSocket to the server.

Devices declare **static capabilities** in the devices file — `renderer`,
`touch`, `colour` (`mono`/`grayscale`/`e6`/`full`), `width`/`height`, `shape`
(`square`/`round`/`rect`) — which gate view availability (a touchless device
never gets an interactive-only view) and adapt rendering (touchless →
controls become passive; grayscale → no color accents; round → circle-safe
insets). Orientation is NOT a capability: it's a runtime HA config knob so an
automation (or a future motorized mount) can change it live. Product names
survive as the modes' branding; the shared MQTT/HA layer lives in
`@castkit/shared` with one test suite so both modes work or break together.

## Context

Slatecast was planned as a separate sibling repo. Two things collapsed that:
the reusable surface (MQTT wrapper, HA discovery, payload contracts, knob
framework) was the load-bearing part of both products, and the maintainer's
incoming M5Paper units (ESP32 **touch e-ink** — can't run a browser, can
display pushed images and report taps) proved the product line isn't
"e-ink vs touch" but **"who renders"**, with touch as a capability on either
side. Building a second server and converging later would have been double
work; the Inkcast server already had the registry, discovery, knobs, and
data stores.

## Why

One device registry, one discovery layer, one views concept, one deploy, one
test suite guarding a shared contract — so future changes can't silently
drift the two halves apart.

## Evidence

> "I like castkit as the monorepo name. I don't mind tangling them. They're
> both my own, and they both have the same surface. They _need_ to share some
> code to avoid AI messing things up as you go write random code in the
> future. […] Only one set of tests. Both apps will work or break together."
>
> "CastKit could be the server name, then InkCast could be the one that goes
> out to each e-ink Pi and SlateCast to interactive screens including
> interactive e-ink."

— maintainer, this chat (2026-07-07)
