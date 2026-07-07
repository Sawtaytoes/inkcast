# Fleet topic migration: `inkcast/…` → `castkit/…` (P6 — GATE SATISFIED, ready to run)

**Status:** NOT RUN. The original gate — **every e-ink device back online after
the 2026-07-07 physical relocation** — was **confirmed by the maintainer the
morning of 2026-07-07** ("All Pis are connected"). Still **re-verify at
execution time** (step 1): an offline device can't pick up its new retained
image topic and will wake to a stale/blank panel.

## Current state (updated 2026-07-07 morning)

- **castkit app** (TrueNAS, `ghcr.io/sawtaytoes/castkit:latest`, host port 8789,
  `castkit.octen.dev`): browser devices only (`media-controls`,
  `media-view-circle`), `MQTT_BASE_TOPIC=castkit`, `MQTT_NODE_ID=castkit`,
  engine `satori`, devices file `/mnt/TrueNAS-Apps/App-Configs/castkit/castkit.config.json`.
  Image is at ≥ `898758a` (Ambient browser view; **display branding renamed to
  CastKit** — "CastKit Server" HA device, manufacturer "CastKit", "CastKit API"
  OpenAPI title). Both kiosk Pis are live on their Slatecast pages — don't
  break them; they're untouched by this migration except the shared server
  device below.
- **inkcast app** (TrueNAS, host port 8788): runs the e-ink fleet on
  `inkcast/…` topics, pinned to the last pre-rename image — CI now publishes
  only `ghcr.io/sawtaytoes/castkit`, so `inkcast:latest` is frozen on GHCR.
- Broker creds: both apps share the `inkcast` Mosquitto login.
- **Known cosmetic flap this migration resolves:** both apps publish the shared
  global server device (`identifiers: ["inkcast_server"]`). The castkit app
  names it "CastKit Server", the frozen inkcast app's retained configs still
  say "Inkcast Server" — the HA display name can flap on HA restart until
  step 8 clears the old retained configs and step 10 retires the app.

## Entity identity — read this before touching HA (verified in code 2026-07-07)

Per-device discovery **topics** carry the node id
(`homeassistant/<component>/<nodeId>/<deviceId>_<entity>/config` —
`discovery.ts` line ~233), so they move `inkcast` → `castkit`. But every
entity's **`unique_id` is hardcoded `inkcast_<deviceId>_<entity>`** and does
NOT change (deliberate, so HA never recreates entities). Consequences:

- HA reclaims the **same entity_ids** (`select.eink_6e6697_…_view`, etc.) —
  dashboards, the two eInk automations, and customizations keep working.
  Step 7 is *verify*, not re-pin.
- **Ordering matters:** HA refuses a discovery config whose `unique_id`
  already belongs to a live entity from a *different* discovery topic. So the
  old retained `homeassistant/+/inkcast/<eink-id>_*/config` payloads must be
  **cleared before (or immediately after) castkit publishes the e-ink
  discovery** — then restart the castkit app once more so its discovery
  configs are the only ones and get accepted. (Deleting a discovery config
  removes the entity but its registry entry persists; the re-published config
  with the same unique_id reclaims the same entity_id.)

## Worker environment notes

- Run from the CloudCLI container. E-ink Pis: `ssh pi@<host>` works with the
  container's key, passwordless sudo (fleet-wide). Device ids/hosts are in
  `home-displays` fleet docs (`eink-a615f8` pHAT, `eink-6e6697` Impression
  7.3", `eink-07769e` + `eink-4da1be` Impression 13.3").
- TrueNAS app ops: `ssh root@storeman.octen 'midclt call -j app.stop inkcast'`
  etc. (`app.update`, `app.pull_images`, `app.start`).
- MQTT: `mosquitto_sub`/`mosquitto_pub` via `docker exec` into the Mosquitto
  container on TrueNAS (creds = the `inkcast` login from the app env), or use
  HA's `mqtt.publish` (retain + empty payload clears a retained topic) through
  the HA MCP for one-offs. For the bulk clear in step 8, script it against
  `mosquitto_sub -t 'inkcast/#' --retained-only -v`.
- HA-side edits go through the HA MCP (`ha_config_get/set_script`,
  `ha_config_set_automation`). What publishes to `inkcast/…` today:
  - `script.control_inkcast_eink_screen` — topic prefix appears **3×**
    (now_playing / weather / agenda publishes).
  - `automation.control_kitchen_counter_eink_screen` and
    `automation.control_office_kevin_s_desk_eink_screen` — call the script
    (device ids as data, no topics inline) and reference `select.eink_*` /
    `text.eink_*` entities, which survive per the entity-identity note.

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
5. **Clear the old retained discovery configs FIRST** (see "Entity identity"
   above — HA rejects a duplicate `unique_id` arriving from a different
   discovery topic): empty retained payloads to every
   `homeassistant/+/inkcast/#` config topic. The `eink_*` entities go
   unavailable/removed momentarily — expected; their registry entries persist.
6. **Restart castkit** → it publishes discovery (same `unique_id`s → the
   entities come back under their **existing** entity_ids) + retained state
   under `castkit/…` and renders first frames to `castkit/<id>/image`.
7. **Repoint each e-ink Pi:** edit the systemd drop-in
   (`inkcast-receiver.service`) `INKCAST_IMAGE_TOPIC=castkit/<id>/image`,
   `systemctl daemon-reload && systemctl restart inkcast-receiver`. Confirm
   each panel redraws.
8. **Update HA + clear remaining retained data topics:**
   - `script.control_inkcast_eink_screen`: change the `inkcast/` topic prefix
     to `castkit/` in all **3** publishes (now_playing / weather / agenda).
     Nothing else in HA hardcodes the topics (see the worker notes inventory).
   - **Verify** the `select.eink_*` / `text.eink_*` / knob entities kept their
     entity_ids and are available (they should, per Entity identity); only if
     one actually ghosted, re-pin and delete the ghost device.
   - Clear ALL remaining retained `inkcast/#` data topics (images, states,
     availability): loop empty retained publishes over
     `mosquitto_sub -t 'inkcast/#' --retained-only -v` output.
9. **Verify:** `mosquitto_sub -t 'inkcast/#' -v` (retained) shows nothing;
   every panel redraws on a `refresh/set`; HA shows no unavailable ghosts;
   the shared server device now reads **"CastKit Server"** and stays that way
   across an HA restart; both Slatecast kiosks are still live
   (`binary_sensor.*_browser_connected` ON).
10. **Retire:** delete the inkcast TrueNAS app + NPM host 46
    (`inkcast.octen.dev`); update `home-displays` fleet docs.

## Rollback

The old app + image are untouched until step 10: `app.start inkcast`, revert
the Pi drop-ins, and revert the script's topic prefix. Note the retained
`inkcast/…` state is progressively cleared from step 5 on — after step 5 the
inkcast app must re-publish its discovery on start (it does, on boot), and
after step 8's data-topic clear the panels redraw on the app's next render
rather than from retained state.

## When done

Update this doc's Status, `home-displays` fleet docs, the CastKit row in
`agentic/todo/README.md`, and remove the "name-flap" caveat from
`agentic/home-assistant/castkit-slatecast-screens.md`'s paper trail if noted
there. Commit + push each repo.
