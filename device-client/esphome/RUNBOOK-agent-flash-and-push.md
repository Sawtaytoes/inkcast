# RUNBOOK — agent builds, flashes, and drives the M5Paper firmware (hands-off)

How an AI agent (running in the CloudCLI container) manages this panel's firmware
**end to end without the user touching a browser, a cable, or the ESPHome
dashboard**. Proven working 2026-07-11 (first USB flash + OTA + image push all
driven from the container over SSH). This is the answer to "write firmware
yourself without me managing it."

The only step that ever needs a human is the **very first** flash of a *blank*
board, because a factory ESP32 has no OTA — and even that we do over SSH to
whatever machine the board is cabled to (no browser). Every update after that is
pure network.

## The three things the agent can do

| Task | Physical access? | How |
| --- | --- | --- |
| Edit + compile firmware | none | SSH → ESPHome container `esphome compile` |
| **First** flash (blank board) | board on USB to a reachable host | pull `firmware.factory.bin` → `esptool write_flash` over SSH |
| **Update** flash (already running ESPHome) | **none** | `esphome upload` (OTA over WiFi) |
| Push an image / read buttons | none | `aioesphomeapi` from the container, or an HA service call |

## Fixed facts (verified 2026-07-11)

- **ESPHome is a standalone TrueNAS app**, container `ix-esphome-esphome-1` on
  storeman. Config dir (host) `/mnt/TrueNAS-Apps/App-Configs/esphome/config` =
  `/config` in the container. Docker is reachable from the **storeman** SSH shell,
  NOT from the HA SSH shell. ESPHome 2026.6.5.
- The M5Paper firmware source of truth is **this repo** (`device-client/esphome/`);
  the copy under the ESPHome app config is the deploy target. Keep them in sync.
- **Node:** `m5paper`, MAC `<panel-mac>`, silicon **ESP32‑D0WDQ6‑V3, 16 MB**
  (classic ESP32 — NOT C6, see the dashboard-bug note below).
- **Network:** panel joins WiFi SSID **`<iot-ssid>`** → currently DHCPs to
  `<panel-ip>`, mDNS `m5paper.local`. **The Octen VLANs are NOT isolated
  right now** — so the container, HA (`homeassistant.octen`), and storeman all
  reach the panel on **6053** (native API) and **3232** (OTA), and the panel
  reaches LAN HTTP hosts across subnets (it fetched `http://<nas-ip>:8099/…`
  fine, appearing as NAT source `<nat-src>` from other subnets or its own
  `<panel-ip>` when same-routed). ⚠️ **If the IoT VLAN is ever firewalled
  off, these cross-subnet paths break** — OTA/API pushes would then have to
  originate from an IoT-reachable host, and the panel would need a route to
  whatever HTTP host serves its renders. Re-verify reachability first (below).
- **Secrets** live only in the ESPHome app's `/config/secrets.yaml` (gitignored,
  never in this repo): `wifi_ssid`, `wifi_password`, `api_encryption_key`,
  `ota_password`. Read them at runtime; don't paste values into committed files.

## Reachability preflight (run before any OTA/API/image push)

```sh
# panel alive + native API + OTA ports open, from storeman
ssh root@storeman.octen 'avahi-resolve -n m5paper.local; \
  for p in 6053 3232; do (timeout 3 bash -c "cat </dev/null >/dev/tcp/<panel-ip>/$p" \
    && echo "$p OPEN") || echo "$p closed"; done'
```

## 1. Edit + compile (no hardware)

```sh
# put the new YAML/components in place on the ESPHome app, then:
ssh root@storeman.octen 'docker exec ix-esphome-esphome-1 \
  sh -c "cd /config && esphome compile m5paper.yaml"'
# → "Successfully compiled program." Build artifacts land in
#   /config/.esphome/build/m5paper/.pioenvs/m5paper/firmware*.bin
```

## 2. First flash of a blank board (USB, over SSH — no browser)

**Do NOT use the ESPHome dashboard "Install → Plug into this computer" flow — it
is broken by a known upstream bug (see below).** Flash `firmware.factory.bin`
straight to the device with esptool:

```sh
# a) copy the merged factory image to the machine the board is cabled to.
#    (2026-07: M5Paper was on <flash-host> COM4 — USB-Enhanced-SERIAL CH9102, VID 0x1A86)
scp root@storeman.octen:/mnt/TrueNAS-Apps/App-Configs/esphome/config/.esphome/build/m5paper/.pioenvs/m5paper/firmware.factory.bin /tmp/
scp /tmp/firmware.factory.bin <user>@<flash-host>:C:/Users/<user>/firmware.factory.bin   # hash-verify both ends

# b) one-time esptool on that host
ssh <user>@<flash-host> 'powershell -NoProfile -Command "python -m pip install esptool"'

# c) flash at 0x0, chip forced to the real silicon (bypasses the dashboard chip gate)
ssh <user>@<flash-host> 'powershell -NoProfile -Command "python -m esptool --chip esp32 --port COM4 flash_id"'   # sanity: reports ESP32-D0WDQ6-V3
ssh <user>@<flash-host> 'powershell -NoProfile -Command "python -m esptool --chip esp32 --port COM4 --baud 460800 write_flash --flash_size detect 0x0 C:/Users/<user>/firmware.factory.bin"'
# → "Hash of data verified. Hard resetting." Board boots ESPHome, joins WiFi.
```

> **pwsh-over-SSH quoting:** use forward-slash Windows paths and avoid nested
> `\"…\"` — escaped double-quotes get mangled through bash→ssh→pwsh. `C:/Users/…`
> works; `Join-Path $env:USERPROFILE "x"` does not survive the hop.

## 3. Update an already-running board (OTA — fully hands-off)

Once ESPHome is on the board, never touch USB again:

```sh
ssh root@storeman.octen 'docker exec ix-esphome-esphome-1 \
  sh -c "cd /config && esphome upload m5paper.yaml --device <panel-ip>"'
# → "OTA successful. Successfully uploaded program." (~5s over WiFi)
```

⚠️ **OTA reboots the board, which re-runs `on_boot` — and this firmware's
`on_boot` does `it8951e.clear`, so the panel goes BLANK after every OTA/reboot
until something pushes an image again.** (That clear-on-boot contradicts the
design doc's "don't clear on boot for crash recovery" guidance — a candidate
change: drop the `it8951e.clear` so the last frame survives reboots.) After an
OTA, re-push the current view (step 4).

## 4. Push an image / read the buttons (no HA needed)

The panel exposes the ESPHome native-API action **`set_image`** and three button
binary-sensors. Drive it directly with `aioesphomeapi` using the noise key from
`/config/secrets.yaml` (`api_encryption_key`):

```python
# /tmp/m5venv (uv venv; pip install aioesphomeapi)
import asyncio
from aioesphomeapi import APIClient
async def main():
    cli = APIClient("<panel-ip>", 6053, None, noise_psk="<api_encryption_key>")
    await cli.connect(login=True)
    _, services = await cli.list_entities_services()
    svc = next(s for s in services if s.name == "set_image")
    await cli.execute_service(svc, {"image_url": "http://<reachable-host>/frame.png"})  # 540x960 1-bit PNG
    await asyncio.sleep(8); await cli.disconnect()
asyncio.run(main())
```

The panel GETs the URL, `on_download_finished` runs `update_slow()`, and it
paints. Watching the HTTP server's access log for a GET from the panel's IP is a
headless "did it paint?" check (no eyes on glass needed).

In production this URL comes from CastKit (`POST /api/devices/m5paper/render` →
`{token,url}`), and HA calls `esphome.m5paper_set_image` with it — but that server
render endpoint returned **404** as of 2026-07-11, so the CastKit push path is not
wired end-to-end yet. Direct `set_image` (above) works today.

## The dashboard "expects esp32c6" bug — why step 2 avoids the browser

The ESPHome **Device Builder browser installer** aborts with
`Chip mismatch: detected ESP32-D0WDQ6-V3 … but device expects esp32c6` for this
classic-ESP32 board. It is an **upstream dashboard bug**, not our firmware: the
web-install manifest's `chipFamily` comes from the device-builder record / a
defaulted `ESP32‑C6‑DevKitM‑1` board, independent of the compiled variant
(`-DUSE_ESP32_VARIANT_ESP32`, `esp_platform: ESP32`). Same class as
[esphome/dashboard #776](https://github.com/esphome/dashboard/issues/776). The
documented workaround — and what we do — is to **flash the downloaded binary with
esptool** (step 2) or OTA (step 3), which read/target the real silicon and never
consult the manifest. No new bug report needed; it's tracked upstream.
