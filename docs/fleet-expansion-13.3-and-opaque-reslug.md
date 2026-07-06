# Plan: re-slug the two existing screens to opaque `eink-<hex>` ids (+ how to add the two 13.3" later)

**Decision basis:** [decisions/2026-07-05-device-id-is-opaque-immutable-identity.md](decisions/2026-07-05-device-id-is-opaque-immutable-identity.md).
**Architecture:** [architecture.md](architecture.md).

Naming scheme (locked 2026-07-05): **hostname = MQTT id = `eink-<hex>`** — one opaque
identity per device for both the Pi's OS hostname and its Inkcast topic base. Human labels
live elsewhere: a **UniFi client alias** (owner-managed) and the HA friendly name/area.

- **✅ DONE 2026-07-05:** re-slugged the two existing screens and renamed their Pi hostnames
  to `eink-<hex>`; verified end-to-end (devices file mounted, both Pis drawing on new topics,
  automations re-pointed, HA relabeled, 92 old `inky-*` retained topics purged).
  - Kitchen Impression → `eink-6e6697` (Pi `192.168.101.200`, wlan0 `b8:27:eb:cf:b8:a4`).
  - Office pHAT → `eink-a615f8` (Pi `192.168.101.177`, wlan0 `b8:27:eb:00:3e:27`).
- **Later (documented):** add the two Pimoroni Inky Impression 13.3" panels when they arrive.

## As-built starting point

The running app has **no devices file and no mount** — it runs on the built-in
`SEED_DEVICES` (`inky-phat`, `inky-impression`). Introducing a devices file is a
prerequisite (the seed ids are compiled into the image otherwise).

## Target identities

| Screen | Old MQTT id (seed) | New id = hostname | geometry | mode | Pi |
| --- | --- | --- | --- | --- | --- |
| Inky pHAT (Office) | `inky-phat` | `eink-a615f8` | 250×122 | mono | offline-flaky tracker; IP via UniFi by MAC |
| Inky Impression 7.3" (Kitchen) | `inky-impression` | `eink-6e6697` | 800×480 | e6 | `192.168.101.200`, MAC `b8:27:eb:cf:b8:a4` |

Deploy config lives at **`/mnt/TrueNAS-Apps/App-Configs/inkcast/inkcast.config.json`**
(owned uid 568 so the container reads it) — NOT the git repo (its dir is `700 kevin`, not
traversable by 568, and every other app already uses `App-Configs/<app>/`). The gitignored
`inkcast.config.json` in this repo is the reviewable draft/source.

## Migration steps (order avoids a blank screen; e-ink holds its last frame in the gap)

1. **Stage the deploy file:** on TrueNAS create `/mnt/TrueNAS-Apps/App-Configs/inkcast/`,
   write `inkcast.config.json` (the two `eink-*` entries, real MACs), `chown -R 568:568`.
   Validate it parses.
2. **Add the mount + env via middleware** (`app.update`, the TrueNAS MCP can't do this):
   - storage `host_path`: `/mnt/TrueNAS-Apps/App-Configs/inkcast` → `/inkcast-config`
     (`read_only: true`).
   - env `INKCAST_DEVICES_FILE=/inkcast-config/inkcast.config.json`.
   - Preserve the full existing `envs` list. App redeploys → now serves the two `eink-*`
     devices and stops serving the seeds.
3. **Per Pi** (`ssh pi@<ip>`, passwordless sudo confirmed on the Kitchen Pi; pHAT IP from
   UniFi by MAC): `sudo hostnamectl set-hostname eink-<hex>`; edit the drop-in
   `/etc/systemd/system/inkcast-receiver.service.d/mqtt.conf`
   `INKCAST_IMAGE_TOPIC=inkcast/eink-<hex>/image`; `systemctl restart inkcast-receiver`;
   capture the real MAC and backfill the config file if needed.
4. **Purge the retiring seeds' retained data:** empty retained payload to every
   `homeassistant/<component>/inkcast/inky-phat_*/config` and `…/inky-impression_*/config`
   discovery topic, and the retained runtime topics under `inkcast/inky-phat/#` /
   `inkcast/inky-impression/#`.
5. **Re-apply HA presentation** to the new entities: friendly name ("Kitchen Counter eInk
   Screen" / "Office Kevin's Desk eInk Screen") + area (kitchen / office). Not carried over
   from the old entities — the known cost of re-slugging.
6. **Update the automations' `inkcast_device`:**
   `automation.control_kitchen_counter_eink_screen` → `eink-6e6697`;
   `automation.control_office_kevin_s_desk_eink_screen` → `eink-a615f8`.
7. **UniFi client alias** for each Pi: set to `Raspberry Pi Zero W - <HA device name>` — i.e.
   `Raspberry Pi Zero W - Kitchen Counter eInk Screen` /
   `Raspberry Pi Zero W - Office Kevin's Desk eInk Screen` (renamed on the onboard-wifi
   `b8:27:eb:*` MAC). Future panels follow the same `Raspberry Pi … - <HA name>` pattern.
8. **Verify:** both screens paint (Refresh), automations fire, no ghost devices remain.

## Later: adding the two 13.3" panels

Pimoroni Inky Impression 13.3" (Spectra-6 E673, 1600×1200, `colourMode: "e6"`) — Pimoroni
provenance confirmed. When on hand, append to the deploy `inkcast.config.json` and restart:

```json
{ "id": "eink-07769e", "label": "eink-07769e (Inky Impression 13.3\")", "mac": "…",
  "width": 1600, "height": 1200, "colourMode": "e6", "rotation": 0,
  "ditherProfile": { "algorithm": "floyd-steinberg", "supersampleFactor": 2 } }
{ "id": "eink-4da1be", "label": "eink-4da1be (Inky Impression 13.3\")", "mac": "…",
  "width": 1600, "height": 1200, "colourMode": "e6", "rotation": 0,
  "ditherProfile": { "algorithm": "floyd-steinberg", "supersampleFactor": 2 } }
```

Then per new screen: set the Pi hostname to the id, flash `INKCAST_IMAGE_TOPIC=inkcast/<id>/image`,
add HA friendly name/area + UniFi alias, and clone a per-screen automation (Now Playing
priority + Weather + Agenda + 15-min refresh + HA start) with that screen's players/calendars.
Slugs `eink-07769e` / `eink-4da1be` are pre-reserved. Do **not** add these entries before the
panels exist — Inkcast would publish discovery for phantom screens.

## ✅ 2026-07-06 — the two 13.3" panels are DEPLOYED

Both Pimoroni Inky Impression 13.3" panels are provisioned, drawing, and discovered in HA.

- **Assignments** (two *distinct* Pi Zero W boards; both had shipped with the same interim
  hostname `pi-13-screen-1` — a collision, resolved by this re-slug):
  - `eink-07769e` — machine-id `fb67…`, eth0 `00:e0:4c:36:07:a3`, wlan0 `b8:27:eb:83:54:91`.
  - `eink-4da1be` — machine-id `ed2d…`, eth0 `00:e0:4c:36:08:0b`, wlan0 `b8:27:eb:0a:b6:49`.
- **Portrait mount:** device entries use **`width:1200, height:1600, rotation:90`** (not the
  landscape 1600×1200 in the draft above). The view renders portrait (1200×1600); the pipeline's
  final `sharp.rotate(90|270)` maps it onto the panel's native 1600×1200 buffer. Started at 90;
  flipped to **270** live from HA (`Display: Rotation`) because 90 came out upside-down for this
  mounting. `mac` recorded = the onboard **wlan0** to match the existing screens' convention.
- **UniFi aliases:** both interfaces of each Pi → `Raspberry Pi Zero W - Inky 13.3" #1/#2 (<slug>)`.

### Device-provisioning gotchas (Pi Zero W / ARMv6 / trixie) — don't rediscover these

1. **numpy must come from apt, NOT pip.** `inky` depends on numpy *unpinned*, so
   `pip install inky` grabs the newest numpy (2.5.x) which has **no piwheels ARMv6 wheel** → pip
   source-builds it (30-60 min, may OOM the 512 MB Pi). Even pinning `numpy==2.2.4` from piwheels
   gave a wheel whose compiled `.so` **fails to load** on the Zero W (numpy then raises the
   misleading "importing numpy from its source directory"). Fix = use Debian's
   `python3-numpy` (`apt install python3-numpy`, 2.2.4+ds) with a `--system-site-packages` venv —
   which is exactly what the working reference Pi (`eink-6e6697`) does. Install `inky` with
   `--no-deps` (or after numpy is satisfied by the system).
2. **`i2c-dev` isn't auto-loaded.** `dtparam=i2c_arm=on` enables the controller but `/dev/i2c-1`
   (needed for the Inky HAT EEPROM autodetect at 0x50, i.e. `inky.auto`) only appears once the
   `i2c-dev` module loads. Add `echo i2c-dev > /etc/modules-load.d/i2c-dev.conf`. Symptom if
   missing: `inky.auto` → "No EEPROM detected".
3. **MQTT client-id collision on same-type panels.** The receiver defaulted its MQTT client-id to
   the *panel type* (`inkcast-receiver-inky`). Two 13.3" panels both detect as `Inky`, so they
   shared one client-id and **kept kicking each other off the broker** (`disconnected: Unspecified
   error` flapping). Fixed in `device-client/inkcast_receiver.py` (default now derives from the
   image topic's device id, unique per screen); a per-device `INKCAST_CLIENT_ID` in the drop-in
   also overrides it.

### Side buttons wired (2026-07-06)

Both 13.3" Pis run `inkcast-buttons.service` (`device-client/inkcast_buttons.py`):
the 4 side buttons publish the server's image-change MQTT commands. **13.3" button
pins (portrait): A=GPIO5 next, B=GPIO6 previous, C=GPIO25 refresh, D=GPIO24 next** —
C moved off GPIO16 vs the 7.3" because the EL133UF1 driver claims GPIO16/26 (found
via `gpioinfo`; pins confirmed empirically with a `gpiod` press-detector). Verified
end-to-end: a press logs `[press] BCM<pin> -> …/set` and the panel redraws a new photo.
