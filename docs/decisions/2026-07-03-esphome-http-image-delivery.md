# ESPHome clients pull images over HTTP via ephemeral single-use token URLs

- **Status:** Accepted
- **Date:** 2026-07-03
- **Type:** Architecture / Delivery transport
- **Supersedes:** —
- **Superseded by:** —

## Decision

ESP32 e-ink panels running **ESPHome** (e.g. an M5Paper) join the fleet as dumb
fetchers like the Pi-Zero receivers, but pull pixels over **HTTP** instead of the
Pi receivers' MQTT transport. The delivery contract:

1. **Render → in-memory PNG under a single-use token.** On render the server
   keeps the finished PNG **in memory only** (no disk, no Home Assistant storage)
   keyed by an unguessable, single-use token, and exposes it at
   `https://<inkcast-host>/render/<token>.png`.
2. **Consume-on-read eviction.** Once the device has fetched the image the server
   deletes that entry.
3. **TTL sweeper.** A timer evicts any token that is never fetched, so an
   undelivered render can't leak memory.
4. **Evict only after the response fully flushes — never on request-receipt**,
   and tolerate a re-fetch of the same token while a transfer is in flight (see
   Why). This is the load-bearing rule.
5. **The device is not configured with a URL.** Home Assistant passes the
   freshly-minted token URL to the panel in the trigger action; the ESPHome
   device re-points its `online_image` at runtime (`online_image.set_url`) and
   fetches. HA remains the brain, consistent with
   [view-switching-via-ha-automations](2026-07-02-view-switching-via-ha-automations.md)
   and [global-config-lives-in-ha-entities](2026-07-02-global-config-lives-in-ha-entities.md).

This lives in the planned `@inkcast/server` (the Hono token API); it is the
image-serving half of that package's contract, orthogonal to the MQTT path the
Pi receivers use.

## Context

Today the server pushes per-device PNGs to Pi-Zero-W fetchers over MQTT. An
ESPHome ESP32 e-ink panel is self-contained (no Pi) and fetches over HTTP via the
`online_image` component, which downloads a PNG from a URL and blits it. ESPHome's
native API is a typed protobuf channel for entities/actions — it is **not** a blob
transport and has no inbound image-upload endpoint, so the device must **pull**;
something has to host the bytes at a URL. The maintainer does not want those images
persisted to HA storage or disk — they should live in Inkcast memory only, briefly.

## Why

- **Evict-after-full-flush, not on receipt.** `online_image`/`http_request` can
  retry on a transient failure or drop mid-transfer. If the server evicts the
  instant a GET *arrives*, the retry hits a 404 and the panel gets nothing.
  Evicting only after a completed `200` (and tolerating an in-flight retry of the
  same token) makes delivery robust without a persistent store.
- **Ephemeral is safe on e-ink.** Once the panel has painted, throwing the bytes
  away loses nothing visually — e-ink holds the pixels with zero power, across
  reboot/power-loss. The device's decoded buffer dies on reboot, but the glass
  still shows the last frame, so there is no "lost push" to recover. No persistent
  image store to manage.
- **Single-use unguessable tokens** avoid a stable, scrapeable per-device endpoint
  and make consume-on-read natural.
- **HA passes the URL** so panels carry no server config and all policy stays in
  HA automations, matching the existing view-switching model.

## Evidence

> "1. Inkcast needs the image. 2. When the image is grabbed from ESPHome, it needs
> to remove the image from Inkcast memory. 3. There needs to be a timer to
> eventually remove it as well."

> "I don't wanna write to Home Assistant's storage each time we do these images
> when they can easily be kept in Inkcast's memory temporarily."

> "it won't need the Inkcast URL either. Home Assistant can simply pass that in the
> trigger action, so it doesn't need to be hard-coded."

> [on evict-after-flush] "Great idea! Let's document that."

— maintainer, M5Paper/ESPHome design chat (2026-07-03)
