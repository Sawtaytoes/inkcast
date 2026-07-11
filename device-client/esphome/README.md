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

ESPHome runs as its **own TrueNAS app** at `esphome.octen.dev` (container
`ix-esphome-esphome-1`, config at `/mnt/TrueNAS-Apps/App-Configs/esphome/config`)
— **not** a Home Assistant add-on. Deploy `m5paper.yaml` + `components/` there,
plus `api_encryption_key` in that app's `secrets.yaml`.

1. Open the **ESPHome dashboard** (`esphome.octen.dev`) — the **m5paper** node
   appears.
2. With the M5Paper plugged into **this computer** over USB, click
   **Install → Plug into this computer** (browser WebSerial). It compiles + flashes
   over serial. Later updates go **OTA**.
3. **Adopt in Home Assistant.** The ESPHome integration auto-discovers the node;
   the encryption key is the `api_encryption_key` secret. You'll get the button
   entities and the `set_image` action.

> ⚠️ **Chip-mismatch after a re-create.** If Install shows
> `Chip mismatch: ... device expects esp32c6`, the browser (ESPHome dashboard is a
> PWA) cached the firmware from when the device was first created as an ESP32‑C6.
> Ctrl+F5 does NOT clear the service-worker cache, and "Retry" re-flashes the same
> cached blob. **Reliable fix: rename the node** (`esphome: name:` / `node_name`)
> so every build + download URL changes — the cache can't shadow a new name. Then
> Install the new card. (Confirm the server build is right first:
> `docker exec ix-esphome-esphome-1 sh -c "grep board /config/.esphome/build/<node>/platformio.ini"`
> → `m5stack-grey`.)

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
