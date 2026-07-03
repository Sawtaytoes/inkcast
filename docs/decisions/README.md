# Inkcast decision records

Append-only log of settled decisions (newest first). One decision per file,
`YYYY-MM-DD-<kebab-slug>.md`. Never edit a past decision to change its meaning —
supersede it with a new dated file and link both ways. Check this index before
proposing a change; a settled decision here overrides default instinct.

| Date | Decision | Status |
| --- | --- | --- |
| 2026-07-03 | [ESPHome clients pull images over HTTP via ephemeral single-use token URLs (evict after full flush)](2026-07-03-esphome-http-image-delivery.md) | Accepted |
| 2026-07-03 | [User-tunable view settings are HA/MQTT config entities (global + per-device), never env vars](2026-07-03-user-tunable-view-settings-are-ha-config-entities.md) | Accepted |
| 2026-07-02 | [Agenda calendars are HA/MQTT config entities (global + per-device), never env vars](2026-07-02-agenda-calendars-are-ha-config-entities-not-env.md) | Accepted |
| 2026-07-02 | [The Clock (Agenda) view pulls calendar events from HA; it is not pushed](2026-07-02-clock-agenda-view-pulls-calendar-from-ha.md) | Accepted |
| 2026-07-02 | [The "no dithering" option is labeled `off`, not `none` (HA reserves `none`)](2026-07-02-dither-off-token-not-none-ha-reserved.md) | Accepted |
| 2026-07-02 | [Follow-mode player exclusion is decided by the HA automation, not by Inkcast](2026-07-02-follow-exclusion-moves-to-ha-automation.md) | Accepted |
| 2026-07-02 | [A "none" dither option hands the panel a full-colour image](2026-07-02-none-dither-panel-native.md) | Superseded |
| 2026-07-02 | [Mat safe-area crop is a per-device MQTT/HA control, not device config](2026-07-02-safe-area-crop-via-mqtt.md) | Accepted |
| 2026-07-02 | [Fitted text has a readable floor and condenses before it shrinks](2026-07-02-fit-text-readable-floor-and-condense.md) | Accepted |
| 2026-07-02 | [Now-playing Dashboard uses one compact layout at every panel size](2026-07-02-now-playing-single-compact-layout.md) | Accepted |
| 2026-07-02 | [View switching is driven by HA automations; no server-side idle fallback](2026-07-02-view-switching-via-ha-automations.md) | Accepted |
| 2026-07-02 | [Server-wide settings live in HA entities (Inkcast Server MQTT device), not env vars](2026-07-02-global-config-lives-in-ha-entities.md) | Superseded |
| 2026-07-02 | [Now-playing views fall back to a per-device idle view when nothing plays](2026-07-02-now-playing-idle-fallback.md) | Superseded |
| 2026-07-02 | [Photo-frame face awareness shifts the crop; it never zooms in on faces](2026-07-02-face-crop-shifts-never-zooms.md) | Accepted |
| 2026-07-02 | [Now-playing layouts put the track title first, above the artist](2026-07-02-title-above-artist.md) | Accepted |
| 2026-07-01 | [Docker images publish to GHCR via GitHub Actions, not the homelab registry](2026-07-01-images-publish-to-ghcr-not-homelab-registry.md) | Accepted |
| 2026-07-01 | [Now-playing data comes from HA `media_player`, not Music Assistant](2026-07-01-now-playing-reads-ha-media-player.md) | Accepted |
| 2026-07-01 | [Production runs an esbuild bundle with node, never tsx](2026-07-01-esbuild-bundle-not-tsx-in-prod.md) | Accepted |
| 2026-07-01 | [Inkcast is a public open-source app, not a private repo](2026-07-01-public-oss-app-on-github.md) | Accepted |
| 2026-07-01 | [Develop on a local disk with the node-modules linker (not a network share)](2026-07-01-local-drive-not-network-share.md) | Accepted |
| 2026-07-01 | [Views use inline style objects (Satori-safe), not Emotion or Tailwind](2026-07-01-inline-styles-for-views.md) | Accepted |
| 2026-07-01 | [Always use latest dependencies; never scaffold with old ones](2026-07-01-latest-dependencies.md) | Accepted |
