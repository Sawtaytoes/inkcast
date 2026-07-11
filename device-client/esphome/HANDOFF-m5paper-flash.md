# HANDOFF — M5Paper ESPHome flash blocked by `device expects esp32c6`

Status: **BLOCKED at flashing.** The config compiles to a valid ESP32 firmware,
but the ESPHome browser installer aborts with a chip mismatch every time. This
doc is written for a fresh agent to take over. It records ground-truth facts,
what's been ruled out, and the untried leads — including where the previous agent
(me) was wrong.

## Objective

Flash an **M5Paper** (ESP32 touch e-ink) so it joins the CastKit fleet as an
image-mode device (see `README.md` + `../../docs/decisions/2026-07-03-esphome-http-image-delivery.md`).
The firmware itself is written and compiles; only the **flash step** is blocked.

## The blocker (verbatim)

ESPHome dashboard → Install → Plug into this computer → COM4:

```
esptool.js
Serial port WebSerial VendorID 0x1a86 ProductID 0x55d4
Detecting chip type... ESP32
Chip is ESP32-D0WDQ6-V3 (revision 3)
...
Chip mismatch: detected ESP32-D0WDQ6-V3 (revision 3) but device expects esp32c6.
```

It aborts here every time — **before writing flash**. It is NOT a connection or
boot-mode problem: esptool connects, runs the stub, and reads Flash ID fine.

### ⚠️ Disputed interpretation — resolve this first

- **esptool's `detected ESP32-D0WDQ6-V3`** is the *physical silicon*. D0WDQ6 =
  classic **ESP32** (Xtensa LX6 dual-core). An ESP32‑C6 is a *different CPU
  architecture* (RISC‑V) and would report `ESP32-C6`. So the silicon in hand is
  classic ESP32, and classic-ESP32 firmware is what can run on it. (You cannot run
  C6 firmware on Xtensa silicon.)
- **`device expects esp32c6`** = the ESPHome *device/manifest the installer is
  about to flash* is built/tagged for C6.
- **The user's position:** they read this as "it NEEDS to be C6" and feel the
  config should target C6. Take this seriously and verify hardware, but note it
  conflicts with the detected silicon above. **Do not assume either side is
  right until you re-read the FULL install log and confirm (a) exactly which
  device entry the dialog is installing, and (b) the exact M5Paper hardware model
  (original M5Paper = ESP32; M5PaperS3 = ESP32‑S3; no official C6 M5Paper is
  known).** The previous agent may have misjudged this; you should re-derive it.

## Ground-truth facts (all verified on the NAS, not inferred)

Everything server-side says **classic ESP32**, yet the installer says C6 — that is
the core mystery:

| Source | Value |
| --- | --- |
| `/config/m5paper.yaml` → `esp32: board:` | `esp32dev` (classic ESP32) |
| Build `platformio.ini` | `board = esp32dev`, `-DUSE_ESP32_VARIANT_ESP32` |
| `.esphome/storage/m5paper.yaml.json` | `"esp_platform": "ESP32"`, `"core_platform": "esp32"` |
| `.esphome/.device-builder-devices.json` (`m5paper.yaml`) | only `expected_config_hash` — **no board/chip field** |
| `esphome compile m5paper.yaml` | `Successfully created ESP32 image` / SUCCESS |
| grep `esp32-?c6` across `/config` (excl. `archive/` + toolchain caches) | **no m5paper hit** |

So there is **no esp32c6 anywhere in the config, build, storage, or the Device
Builder record store.** The C6 expectation must be coming from somewhere not yet
found — see "Untried leads".

## What was tried and RULED OUT (don't repeat these)

1. **`external_components` "could not find components folder"** — the original
   error. Cause: `sebirdman/m5paper_esphome` stores components under
   `custom_components/`, which ESPHome can't load. FIXED by vendoring the
   components locally (see below). This is settled.
2. **it8951e C++ build failure on ESPHome 2026.6.5** (`get_loop_priority ...
   marked 'override'`). FIXED by the vendored patch (`components/PATCHES.md`).
   Settled — the firmware compiles.
3. **"Stale PWA/service-worker cache" theory** → had the user Ctrl+F5. **Did not
   help. Wrong theory.**
4. **"Rename the node busts the cache" theory** → renamed `m5paper` →
   `m5paper-eink`, recompiled (still ESP32). **Did not help. Wrong theory — a
   rename shouldn't be, and wasn't, the fix.**
5. **Full clean-slate recreate** → deleted every `m5paper*` YAML, build, storage
   json, idedata, and validated cache; wrote a fresh `m5paper.yaml` with
   `board: esp32dev`; recompiled clean (ESP32). **User flashed again — SAME C6
   error.** This is the damning result: a from-scratch ESP32 device still makes
   the installer expect C6.
6. **Wrong ESPHome instance** — ruled out. There is exactly one ESPHome
   (container `ix-esphome-esphome-1`), and its `/config/m5paper.yaml` is the file
   the dashboard reads (its errors tracked our edits).

Observed but unexplained: while editing, the **Device Builder editor header
showed the board as "Espressif ESP32‑C6‑DevKitM‑1"** even though the YAML said a
classic-ESP32 board and the PLATFORM column in the device list said `esp32`. This
is the most likely lead (below).

## Untried leads (in priority order)

1. **Click "Change board → ESP32" in the Device Builder UI.** The editor header
   showed the device's board as ESP32‑C6‑DevKitM‑1. No filesystem edit changed
   that display. The previous agent could not drive the browser UI. This UI
   action likely rewrites whatever the installer reads as the expected chip. Try
   it (or have the user do it) and re-Install. **Most promising.**
2. **Inspect the exact manifest ESP Web Tools fetches.** The "expects esp32c6"
   comes from the install manifest's `chipFamily`. Find the dashboard endpoint
   that serves it for this device (esptool.js/esp-web-tools manifest) and read
   `chipFamily` directly — from the SAME browser session that fails. If it says
   `ESP32`, the failure is 100% client-side (wrong cached manifest / wrong device
   clicked); if `ESP32-C6`, the server is generating a C6 manifest despite the
   ESP32 build — a dashboard bug to file/work around.
3. **Confirm WHICH device is being installed.** The dialog title has been
   "M5Paper" / "M5Paper (e-ink)". Confirm the user isn't clicking Install on a
   *different* device entry (there are 8 devices) that is genuinely a C6 config,
   with the classic-ESP32 M5Paper on COM4. Check every entry's board.
4. **Try a totally clean browser / different machine.** New browser profile,
   never used with this dashboard → Install. If it works there, it was client
   state all along.
5. **Bypass the dashboard installer entirely.** `Download` the
   `firmware.factory.bin` and flash with `esptool`/esptool-js directly to COM4
   (`esptool --chip esp32 write_flash 0x0 firmware.factory.bin`). This removes the
   manifest/chipFamily check from the loop — if it boots, the firmware was always
   correct and the block is purely the dashboard's chip gate.
6. **Verify the hardware model** (address the user's claim). `esptool flash_id` /
   `chip_id` already say ESP32‑D0WDQ6‑V3. Re-read the full log with the user; if
   they have a non-standard/rebadged board, that changes everything.

## Environment — exact locations & commands

- **ESPHome is a standalone TrueNAS app** at `https://esphome.octen.dev` —
  **NOT** a Home Assistant add-on. (HA's `/config/esphome` is a stray legacy dir;
  ignore it.)
- Container: `ix-esphome-esphome-1` on storeman (`ssh root@truenas.octen.dev`).
- Config dir (host): `/mnt/TrueNAS-Apps/App-Configs/esphome/config/` (= `/config`
  in the container). Not mounted into the CloudCLI agent container — reach it via
  SSH to storeman.
- ESPHome version: **2026.6.5**, framework arduino.
- Validate: `docker exec ix-esphome-esphome-1 sh -c "cd /config && esphome config m5paper.yaml"`
- Full compile (catches C++/component breaks; ~50–80s):
  `docker exec ix-esphome-esphome-1 sh -c "cd /config && esphome compile m5paper.yaml"`
- Build output: `/config/.esphome/build/m5paper/.pioenvs/m5paper/firmware.*.bin`
- Device Builder record store: `/config/.esphome/.device-builder-devices.json`
- Docker is NOT reachable from the HA SSH shell (protection mode); it IS reachable
  from the storeman (TrueNAS) SSH shell.

## What IS done and working

- **Firmware compiles cleanly to a valid ESP32 image** (display + online_image +
  api + 3 buttons; touch commented out — see below).
- **Vendored + patched components** live in `./components/` (`it8951e`, `m5paper`)
  from `ilia-ae/m5paper_esphome`; `it8951e.h` patched (`components/PATCHES.md`) to
  build on ESPHome 2026.6. `external_components: type: local, path: components`.
  `gt911` + `spi` are mainline (do not vendor).
- **Touch is intentionally disabled** (`touchscreen:` block commented) — ESPHome
  2026.3.0+ drives the GT911 interrupt pin as an output, failing on the M5Paper's
  input-only GPIO36 (esphome/esphome#14953). Re-enable after the base works.
- Secrets already present in `/config/secrets.yaml`: `wifi_ssid`, `wifi_password`,
  `api_encryption_key` (`QlOvaGcKUba/8lMshlm5BmGW8nY0FDoUu7n3CIdAz58=`),
  `ota_password`.

## CastKit integration (for AFTER it flashes — server side is DONE)

- HA delivers renders via the ESPHome native API action **`set_image`**:
  `esphome.m5paper_set_image(image_url: "https://castkit.octen.dev/render/<token>.png")`.
- CastKit is at the LAN host **`https://castkit.octen.dev`** (internal cert) — the
  config sets `http_request: verify_ssl: false`. NOT MQTT, NOT a public URL, NOT
  `storeman:8788` (all earlier mislabels by the previous agent).
- Server endpoint already shipped: `POST /api/devices/m5paper/render` →
  `{token, url}`; public `GET /render/<token>.png` (single-use). CastKit device
  entry `m5paper` (540×960 mono) exists in `inkcast.config.example.json`.
- CastKit device id `m5paper` (MQTT/topics) is independent of the ESPHome node
  name; renaming the ESPHome node does not affect CastKit.

## Repo state

- Branch `master`, repo `github.com/Sawtaytoes/castkit`. All ESPHome work is under
  `device-client/esphome/`: `m5paper.yaml`, `components/` (vendored+patched),
  `components/PATCHES.md`, `README.md`, this handoff.
- Relevant recent commits: the vendored-components fix, the `esp32dev` board
  change, and the (now-known-wrong) "PWA cache/rename" note that was later
  corrected. `git log device-client/esphome/` has the full trail.

## Honest note from the previous agent

I burned the user's time on two wrong theories (browser PWA cache; renaming the
node) before proving the whole server side is ESP32. The unresolved fact is:
**every server-side artifact is classic ESP32, but the browser installer still
expects esp32c6.** Start at "Untried leads" #1 and #2 — the Device Builder UI
board field and the actual served manifest — rather than touching the YAML again.
