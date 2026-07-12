# CastKit device client — M5Paper (ESPHome touch e-ink)

The M5Paper is an ESP32 **touch e-ink** panel (960×540 @ 4.7", 16-level
grayscale IT8951E controller, GT911 capacitive touch). It joins a CastKit fleet
as an **image-mode (Inkcast) device** — the server renders + dithers its view to
a 1-bit PNG — but it is self-contained (no Pi), pulls its render over **HTTP**,
and additionally reports **touch** and can **fast-update** a region locally.

Why it's different from the Pi receivers, and what "blurs the lines":

| | Pi-Zero receiver | **M5Paper** | Slatecast (browser) |
| --- | --- | --- | --- |
| Who renders | server | server | the device |
| Transport | MQTT image push | **HTTP pull (token URL)** | WebSocket |
| Touch | no | **yes (GT911)** | yes |
| Colour | mono / e6 | **mono (1-bit; panel is 16-gray)** | full |
| Fast partial update | no | **yes (progress bar)** | n/a |

See the decision records:

- [`../../docs/decisions/2026-07-03-esphome-http-image-delivery.md`](../../docs/decisions/2026-07-03-esphome-http-image-delivery.md)
  — why ESPHome panels pull over HTTP via ephemeral single-use token URLs.
- [`../../docs/decisions/2026-07-08-m5paper-image-plus-touch-plus-fast-update.md`](../../docs/decisions/2026-07-08-m5paper-image-plus-touch-plus-fast-update.md)
  — the M5Paper's blended capabilities and why touch/URL ride the ESPHome API,
  not MQTT.

## Files

| File | Purpose |
| --- | --- |
| `m5paper.yaml` | The flashable ESPHome config (display + touch + API + HTTP image pull). |
| `secrets.yaml` | **Not in git** — wifi + API key. Create it locally (below). |

## How delivery works (the loop)

This is the concrete contract the CastKit server ships (`packages/server/src/app.ts`):

1. HA decides this panel should show a view and **mints a fresh render** by
   calling the server, token-gated:

   ```
   POST /api/devices/m5paper/render      (Authorization: Bearer <INKCAST_API_TOKEN>)
   → 200  { "token": "<hex>", "url": "<CASTKIT_PUBLIC_URL>/render/<token>.png" }
   ```

   The server renders → dithers to the panel's 1-bit palette → keeps the PNG **in
   memory only** under that unguessable single-use token (evicted after the panel
   fetches it, or by a TTL sweeper).
2. HA passes the returned `url` to this panel's ESPHome action:
   `esphome.m5paper_set_image(image_url: "<that url>")` — the action name
   `set_image` is defined in `m5paper.yaml`.
3. The panel re-points `online_image` at the URL, fetches
   `GET /render/<token>.png` (public, single-use), blits, and the e-ink holds the
   frame with zero power.

The panel carries **no** CastKit URL and no house logic — HA passes the URL and
owns all "which view / when / what a tap does" policy, consistent with
view-switching-via-ha-automations.

> **The token URL comes from `CASTKIT_PUBLIC_URL`.** The server builds `url` as
> `${CASTKIT_PUBLIC_URL}/render/<token>.png`. Here that's the LAN host
> `https://castkit.octen.dev` (internal cert), so the ESP32 fetches over https —
> `m5paper.yaml` sets `http_request: verify_ssl: false` to skip cert
> verification on-device.

## Components: what's mainline vs external

Only **`it8951e`** (e-ink controller) and **`m5paper`** (power latch) are external
— they're **vendored + patched in `./components/`** (upstream
`ilia-ae/m5paper_esphome` doesn't compile on current ESPHome; see
[`components/PATCHES.md`](components/PATCHES.md)). **`gt911`** (touch) and **`spi`**
are **mainline** ESPHome — do NOT pull them externally (that conflicts). Board
**`m5stack-grey`** + `psram:`; classic **ESP32** chip (not ESP32‑C6/S3).

> ⚠️ **External repos must expose components under `components/`.** The old
> `sebirdman/m5paper_esphome` repo stores them under `custom_components/`, which
> ESPHome can't find — that was the first "add" error. `external_components` here
> points at the local vendored `./components`.

## First-flash checklist

> ✅ **Status 2026-07-11: FLASHED, online, and painting.** Node `m5paper` is on
> WiFi (`<iot-ssid>` → `<panel-ip>`, mDNS `m5paper.local`), native API port
> 6053 + OTA 3232 open, and a pushed 540×960 image paints correctly. First flash
> was done with **esptool over USB (<flash-host> COM4)**, updates now go **OTA**.
> Full agent-driven procedure: [`RUNBOOK-agent-flash-and-push.md`](RUNBOOK-agent-flash-and-push.md).

ESPHome runs as its **own TrueNAS app** at `esphome.octen.dev` (container
`ix-esphome-esphome-1`, config at `/mnt/TrueNAS-Apps/App-Configs/esphome/config`)
— **not** a Home Assistant add-on. Deploy `m5paper.yaml` + `components/` there,
plus `api_encryption_key` in that app's `secrets.yaml`.

**Do NOT use the dashboard "Install → Plug into this computer" flow** — it is
broken by an upstream bug (below). Flash with esptool instead:

1. Compile on the container:
   `docker exec ix-esphome-esphome-1 sh -c "cd /config && esphome compile m5paper.yaml"`.
2. **First flash (blank board):** copy
   `.esphome/build/m5paper/.pioenvs/m5paper/firmware.factory.bin` to the machine the
   board is cabled to and flash it:
   `python -m esptool --chip esp32 --port <COMx> --baud 460800 write_flash --flash_size detect 0x0 firmware.factory.bin`.
   → *Hash of data verified.* (See the runbook for the exact copy/verify steps.)
3. **Updates:** OTA, no cable —
   `docker exec ix-esphome-esphome-1 sh -c "cd /config && esphome upload m5paper.yaml --device <panel-ip>"`.
   ⚠️ OTA reboots the board, which re-runs `on_boot`’s `it8951e.clear` → the panel
   blanks until an image is pushed again.
4. **Adopt in Home Assistant** (optional). The ESPHome integration auto-discovers
   the node; the encryption key is the `api_encryption_key` secret. You get the
   button entities and the `set_image` action. (You can also drive `set_image`
   directly with `aioesphomeapi` — see the runbook — no HA needed.)

> ⚠️ **`Chip mismatch: ... device expects esp32c6` is an upstream dashboard bug —
> flash with esptool/OTA, don't fight it.** The compiled build and this YAML are
> classic ESP32 (`-DUSE_ESP32_VARIANT_ESP32`, `esp_platform: ESP32`; esptool reads
> the silicon as **ESP32‑D0WDQ6‑V3, 16 MB**). Only the browser installer's manifest
> `chipFamily` is wrong — it comes from a defaulted `ESP32‑C6‑DevKitM‑1` device
> record, independent of the compiled variant. Editing the YAML, renaming, and
> Ctrl+F5 all fail. Same class as
> [esphome/dashboard #776](https://github.com/esphome/dashboard/issues/776); no new
> report needed. **esptool `write_flash --chip esp32` (first flash) and `esphome
> upload` OTA (updates) both bypass the manifest entirely** and are the sanctioned
> path here. ("Change board → ESP32" in the Device Builder UI may also clear it, but
> the esptool/OTA route is what's verified working.)

### After flashing
- **Confirm orientation.** If the first pushed render is sideways or upside down,
  change **`rotation`** on the `it8951e` display in `m5paper.yaml`
  (`0` / `90` / `180` / `270`) and re-flash — rotate on the *device*, never
  server-side, so the render stays 1:1 (the server's `rotation` knob is for a
  different job and would double up).
- **Touch is disabled by default in this config.** ESPHome 2026.3.0+ regressed
  the GT911 reset to drive the interrupt pin as an output, which fails on the
  M5Paper's input-only GPIO36 (esphome/esphome#14953). The `touchscreen:` block
  is left commented so the panel flashes cleanly; re-enable it once the base
  works and the GPIO36 handling is confirmed on your ESPHome version.
- **Confirm geometry matches the CastKit device entry.** `m5paper.yaml` targets
  540×960 portrait to match the `m5paper` entry (width 540 × height 960) in the
  gitignored `inkcast.config.json` (copy from `inkcast.config.example.json`). If
  you mount it landscape, flip **both** the CastKit entry (`width`/`height`) and
  the display `rotation` together.
- **Validated on:** ESPHome 2026.6.5 — `esphome compile m5paper.yaml` →
  "Successfully created ESP32 image / SUCCESS" (display + image + buttons; touch
  commented).

## Buttons & touch

The three edge buttons (`Button: Left/Center/Right`, GPIO39/38/37) surface as
ESPHome **binary sensors** — wire them in HA automations to do whatever you want
(skip/pause via Music Assistant, cycle the CastKit view, wake the panel).

**Touch is commented out** for now (the GT911/GPIO36 regression above). When you
re-enable the `touchscreen:` block, taps publish `(x, y)` to a text sensor HA can
act on; add touch-zone binary_sensors for fixed hit targets.

## Fast-update progress bar (experimental)

The IT8951E can partial-refresh a strip much faster than a full flash, so a
now-playing progress bar can be drawn **locally** each second without re-pushing
the whole card. The lambda + the HA `media_position` / `media_duration` sensors
are included but **commented out** in `m5paper.yaml` — enable them only after
confirming the external component exposes a partial/fast refresh (a full flash
every second would strobe and wear the panel). This is the capability that lets a
black-and-white e-ink panel behave a little like a live display.
