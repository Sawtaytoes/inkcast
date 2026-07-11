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

> **Mind the URL scheme — it comes from `CASTKIT_PUBLIC_URL`.** The server builds
> `url` as `${CASTKIT_PUBLIC_URL}/render/<token>.png`, so whatever scheme that env
> var uses is what the ESP32 must fetch. TLS on the ESP32 is RAM-hungry and the
> render bytes are ephemeral + single-use, so the easiest path is to point
> `CASTKIT_PUBLIC_URL` at the **plain-HTTP LAN** origin (e.g.
> `http://storeman.octen:8788`). If it's `https://`, uncomment `verify_ssl: false`
> under `http_request:` in `m5paper.yaml` (and expect higher RAM use).

## First-flash checklist

1. **Create `device-client/esphome/secrets.yaml`** (gitignored) next to
   `m5paper.yaml`:

   ```yaml
   wifi_ssid: "<your-ssid>"
   wifi_password: "<your-wifi-password>"
   # Generate once: `openssl rand -base64 32`
   api_encryption_key: "<32-byte-base64-key>"
   ```

2. **Flash over USB the first time** (later updates go OTA). From a machine with
   ESPHome installed, in this directory:

   ```bash
   esphome run m5paper.yaml
   ```

   The `m5paper`, `it8951e`, `gt911`, `bm8563`, and `spi` components are fetched
   from the `external_components` git source at build time.

3. **Adopt in Home Assistant.** The ESPHome integration auto-discovers the node;
   add it and paste the `api_encryption_key`. You'll get the touch/button binary
   sensors and the `set_image` action.

4. **Confirm orientation.** If the first pushed render is sideways or upside
   down, change **`display_rotation`** in `m5paper.yaml`'s `substitutions`
   (`0` / `90` / `180` / `270`) and re-run — rotate on the *device*, never
   server-side, so the render stays 1:1 (the server's `rotation` knob is for a
   different job and would double up).

5. **Confirm geometry matches the CastKit device entry.** `m5paper.yaml` targets
   540×960 portrait to match the `m5paper` entry (width 540 × height 960) in the
   gitignored `inkcast.config.json` (copy from `inkcast.config.example.json`).
   If you mount it landscape, flip **both** the CastKit entry (`width`/`height`)
   and `display_rotation` together.

## Touch & buttons

Three touch thirds (`Touch: Left/Center/Right`) and the three edge buttons
(`Button: Up/Press/Down`) surface as ESPHome **binary sensors**. Wire them in HA
automations to do whatever you want — skip/pause via Music Assistant, cycle the
CastKit view, wake the panel. The zones are a plain default; retune the `x/y`
ranges in `m5paper.yaml` to your mounting, or add gesture handling.

## Fast-update progress bar (experimental)

The IT8951E can partial-refresh a strip much faster than a full flash, so a
now-playing progress bar can be drawn **locally** each second without re-pushing
the whole card. The lambda + the HA `media_position` / `media_duration` sensors
are included but **commented out** in `m5paper.yaml` — enable them only after
confirming the external component exposes a partial/fast refresh (a full flash
every second would strobe and wear the panel). This is the capability that lets a
black-and-white e-ink panel behave a little like a live display.
