# The M5Paper is an image-mode device that also declares touch + fast-update — capabilities blur, the model doesn't

- **Status:** Accepted
- **Date:** 2026-07-08
- **Type:** Architecture / Device capabilities
- **Supersedes:** —
- **Superseded by:** —

## Decision

The M5Paper (ESP32 touch e-ink, IT8951E 960×540 16-gray + GT911 touch) joins the
fleet as an **image-mode (Inkcast) device** — the server renders and dithers its
view to a 1-bit PNG — while additionally declaring two capabilities that don't fit
the "dumb e-ink sink" mould:

- **`touch`** — it reports taps, and
- **fast-update** — its IT8951E can partial-refresh a region far faster than a
  full flash, so a live element (a music progress bar) can be drawn **locally**
  without re-pushing the whole card.

These extra capabilities do **not** move it to browser mode and do **not** add a
new device class. The M5Paper stays "the server renders, the device displays,"
plus flags. Concretely:

1. **Image delivery is HTTP pull**, exactly as
   [2026-07-03-esphome-http-image-delivery.md](2026-07-03-esphome-http-image-delivery.md)
   locked: HA hands the panel a single-use token URL via the ESPHome API action
   `set_image`; the panel re-points `online_image` and fetches. It is mono
   (1-bit) even though the glass is 16-level grayscale — CastKit dithers to black
   and white, which is what "Black and White" means for this panel and keeps the
   on-device buffer in internal RAM (BINARY, no PSRAM dependency).
2. **Touch and buttons ride the native ESPHome API, not MQTT.** The panel exposes
   its touch zones and edge buttons as ESPHome binary sensors; HA reads them and
   runs automations (skip/pause via Music Assistant, cycle the view, wake). This
   is the deliberate ESPHome exception to CastKit's "MQTT and nothing else" house
   contract — the same exception the HTTP-image decision already carved out for
   the URL hand-off. The device holds no house logic; HA is still the brain.
3. **Fast-update is a local overlay.** The progress bar reads `media_position` /
   `media_duration` imported from HA and is drawn by the panel's own display
   lambda on a partial refresh — the pushed render stays the static card. Shipped
   commented-out until partial refresh is confirmed on hardware (a full flash per
   second would strobe and wear the panel).

## Context

CastKit already models devices by **who renders** plus static capabilities —
`renderer` (`image` vs `browser`), `touch`, `colour`, `shape` — precisely so a
device can mix traits without a new class
([2026-07-07-castkit-platform-one-server-two-client-modes.md](2026-07-07-castkit-platform-one-server-two-client-modes.md),
which explicitly cited the incoming M5Paper as the proof that the axis is "who
renders, with touch as a capability on either side"). Today that capability
vocabulary is wired on the **browser** device schema (`hasTouch`, `colour`,
`shape`); the **image** schema still carries only render metadata. The M5Paper is
the first image device that is also touch-capable and fast-update-capable, so it
is the concrete case that says whether those flags belong on the image schema too.

## Why

- **Don't grow the software to fit one panel.** The maintainer's constraint is
  that this "e-ink with touch" screen should blur the lines "without making the
  software too complex." Keeping it an image device + two optional flags — rather
  than a third renderer or a browser panel that happens to be e-ink — is the
  minimal model that still lets each device *register its features*.
- **Follow the locked transports.** HTTP-pull for the image and ESPHome-API for
  touch are both already-settled; reusing them means no new server surface for
  this device to work. The panel is functional today purely through HA
  (URL-in via the action, touch-out via binary sensors) with **no CastKit code
  change required** — the firmware is the deliverable.
- **Fast-update is genuinely new and worth capturing** so a future view can key
  off it (only a fast-update panel gets a live progress bar; every other e-ink
  panel shows a static one).

## Follow-up (not blocking the firmware)

When the image-device schema next gains capability flags, mirror the browser
schema: add optional **`hasTouch`** and **`fastUpdate`** booleans (default
`false`) to the image `DeviceConfigSchema` so an image device can declare them,
and let views/HA gate on them (fast-update → live progress bar; touchless → none).
Until then the M5Paper works via HA alone; the flags are an ergonomics upgrade,
not a prerequisite.

## Evidence

> "I wanna make sure we get the ESPHome config for M5Paper in there. … Since each
> device registers its features with CastKit, this 'e-ink with touch' screen can
> blur the lines without making the software too complex. It can say 'I have
> touch, and I'm e-ink', but also, it's Black and White _and_ has fast-update of
> the screen. So it could probably display a progress bar of music too!"

— maintainer, M5Paper/ESPHome chat (2026-07-08)
