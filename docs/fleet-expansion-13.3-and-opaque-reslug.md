# Plan: re-slug the two existing screens to opaque ids (+ how to add the two 13.3" later)

**Decision basis:** [decisions/2026-07-05-device-id-is-opaque-immutable-identity.md](decisions/2026-07-05-device-id-is-opaque-immutable-identity.md).
**Architecture:** [architecture.md](architecture.md).

Two separate pieces of work:

- **Now:** re-slug the two screens we have (`inky-phat`, `inky-impression`) to opaque ids.
- **Later (documented, not yet built):** add the two Pimoroni Inky Impression 13.3" panels
  when they arrive.

## As-built starting point

The running app has **no devices file and no mount** — it runs on the built-in
`SEED_DEVICES` (`inky-phat`, `inky-impression`). Introducing a devices file is therefore a
prerequisite: without it the ids are compiled into the image and can't be changed.

## Target slugs (opaque, immutable — never encode location/model)

| Screen | Old id (seed) | New id | geometry | mode |
| --- | --- | --- | --- | --- |
| Inky pHAT | `inky-phat` | `inky-a615f8` | 250×122 | mono |
| Inky Impression 7.3" | `inky-impression` | `inky-6e6697` | 800×480 | e6 |

`inkcast.config.json` (gitignored) is drafted with these two entries; MACs are
`REPLACE_WITH_REAL_MAC_*` placeholders (fill from each Pi's `ip link` during step 4 — the
`mac` field only feeds HA's device `connections` block, it does not affect topics).

## Migration steps (order matters — avoids a blank screen)

1. **Introduce the devices file on the TrueNAS app** (the one step not automatable via the
   TrueNAS MCP — do it in Apps → inkcast → Edit):
   - Add a **host-path storage** mount: host `…/inkcast.config.json` → container
     `/config/inkcast.config.json` (read-only).
   - Add env **`INKCAST_DEVICES_FILE=/config/inkcast.config.json`**.
   - Save → the app redeploys and now serves the two opaque-slug devices.
2. **Purge the retiring seeds' retained data** (else HA shows ghost devices and the broker
   serves stale images): publish an empty retained payload to every
   `homeassistant/<component>/inkcast/inky-phat_*/config` and
   `…/inky-impression_*/config` discovery topic, and to the retained runtime topics under
   `inkcast/inky-phat/#` and `inkcast/inky-impression/#`. (Same technique used to clear the
   pre-HA-agnostic ghost entities on 2026-07-05.)
3. **Verify** the two new opaque-slug devices appear in HA and paint on Refresh.
4. **Reconfigure each Pi** (from this box, `ssh pi@<ip>`; IPs via UniFi): edit the systemd
   drop-in `INKCAST_IMAGE_TOPIC=inkcast/<new-id>/image`, `systemctl restart
   inkcast-receiver`; grab the real MAC (`ip link`) and backfill it into the config file.
   Between steps 1 and 4 the e-ink just holds its last frame (no blank).
5. **Re-apply HA presentation** to the new entities: friendly name ("Kitchen Counter eInk
   Screen" / "Office Kevin's Desk eInk Screen") + area (kitchen / office). These do NOT
   carry over from the old entities — the known cost of re-slugging.
6. **Update the HA automations' `inkcast_device`**:
   `automation.control_kitchen_counter_eink_screen` → `inky-6e6697`;
   `automation.control_office_kevin_s_desk_eink_screen` → `inky-a615f8`.

## Later: adding the two 13.3" panels

Pimoroni Inky Impression 13.3" (Spectra-6 E673, 1600×1200, `colourMode: "e6"`) — provenance
confirmed Pimoroni (clears the no-Chinese-origin constraint). When on hand, append two
entries to `inkcast.config.json` and restart:

```json
{ "id": "inky-07769e", "label": "Inky Impression 13.3\" #07769e", "mac": "…",
  "width": 1600, "height": 1200, "colourMode": "e6", "rotation": 0,
  "ditherProfile": { "algorithm": "floyd-steinberg", "supersampleFactor": 2 } }
{ "id": "inky-4da1be", "label": "Inky Impression 13.3\" #4da1be", "mac": "…",
  "width": 1600, "height": 1200, "colourMode": "e6", "rotation": 0,
  "ditherProfile": { "algorithm": "floyd-steinberg", "supersampleFactor": 2 } }
```

Then per new screen: flash the Pi with `INKCAST_IMAGE_TOPIC=inkcast/<id>/image`, assign HA
friendly name/area, and clone a per-screen automation (Now Playing priority + Weather +
Agenda + 15-min refresh + HA start) with that screen's players/calendars. Slugs
`inky-07769e` / `inky-4da1be` are pre-reserved so nothing is retyped later. Do **not** add
these entries before the panels exist — Inkcast would publish discovery for phantom screens.
