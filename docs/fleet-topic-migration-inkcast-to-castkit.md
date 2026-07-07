# Fleet topic migration: `inkcast/…` → `castkit/…` (P6 — GATED)

**Status:** NOT RUN — gated on the maintainer confirming **every e-ink device is
back online** (screens were physically relocated 2026-07-07; PoE ports limited).
**Do not start this while any e-ink Pi is offline** — an offline device can't
pick up its new retained image topic and will wake to a stale/blank panel.

## Current state (since 2026-07-07)

- **castkit app** (TrueNAS, `ghcr.io/sawtaytoes/castkit:latest`, host port 8789,
  `castkit.octen.dev`): browser devices only (`media-controls`,
  `media-view-circle`), `MQTT_BASE_TOPIC=castkit`, `MQTT_NODE_ID=castkit`,
  engine `satori`, devices file `/mnt/TrueNAS-Apps/App-Configs/castkit/castkit.config.json`.
- **inkcast app** (TrueNAS, host port 8788): runs the e-ink fleet on
  `inkcast/…` topics, pinned to the last pre-rename image — CI now publishes
  only `ghcr.io/sawtaytoes/castkit`, so `inkcast:latest` is frozen on GHCR.
- Broker creds: both apps share the `inkcast` Mosquitto login.

## Migration steps (run top to bottom)

1. **Preflight:** every e-ink device online (UniFi / ping); castkit app healthy;
   `mosquitto_sub -t 'castkit/availability'` = `online`.
2. **Merge the devices files:** append the e-ink entries from
   `App-Configs/inkcast/inkcast.config.json` (image devices, no `renderer`
   field needed) into `App-Configs/castkit/castkit.config.json`.
3. **Give the castkit app the render env:** `app.update castkit` — add
   `IMMICH_URL` + `IMMICH_API_TOKEN` (copy from the inkcast app), set
   `INKCAST_RENDER_ENGINE=chromium` (the image bundles Playwright Chromium),
   and mount `App-Configs/inkcast` read-only if the merged file references it.
4. **Stop the inkcast app** (`app.stop inkcast`) so two servers never race on
   the same broker. Do NOT delete it yet.
5. **Restart castkit** → it publishes discovery + retained state for all
   devices under `castkit/…` and renders first frames to
   `castkit/<id>/image`.
6. **Repoint each e-ink Pi:** edit the systemd drop-in
   (`inkcast-receiver.service`) `INKCAST_IMAGE_TOPIC=castkit/<id>/image`,
   `systemctl daemon-reload && systemctl restart inkcast-receiver`. Confirm
   each panel redraws.
7. **Update HA:** the eInk automations + `script.control_inkcast_eink_screen`
   publish to `inkcast/<id>/…/set` — change the topic prefix to `castkit/`.
   HA config entities (view select, knobs) re-appear under the new
   `castkit_<id>` discovery ids: re-pin dashboards/automations that referenced
   old entity ids, then delete the ghost `inkcast_*` HA devices.
8. **Clear ALL old retained topics** (ghost-entity prevention): publish empty
   retained payloads to every retained `inkcast/#` topic, e.g. with a small
   mqtt.js loop over `mosquitto_sub -t 'inkcast/#' --retained-only -v` output.
   Also clear the old `homeassistant/+/inkcast/#` discovery configs.
9. **Verify:** `mosquitto_sub -t 'inkcast/#' -v` (retained) shows nothing;
   every panel redraws on a `refresh/set`; HA shows no unavailable ghosts.
10. **Retire:** delete the inkcast TrueNAS app + NPM host 46
    (`inkcast.octen.dev`); update `home-displays` fleet docs.

## Rollback

The old app + image are untouched until step 10: `app.start inkcast`, revert
the Pi drop-ins, and the retained `inkcast/…` state (not yet cleared before
step 8) restores the panels.
