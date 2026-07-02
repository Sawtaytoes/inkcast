# Inkcast — HANDOFF (resume-from-cold)

Everything a fresh agent needs to continue Inkcast. Written 2026-07-01. Read this
+ [../AGENTS.md](../AGENTS.md) + [decisions/README.md](decisions/README.md) +
[phase-0-findings.md](phase-0-findings.md) first.

## One-line status

Inkcast (a self-hostable e-ink render/push platform) is **live end-to-end**: the
server renders per-device views, dithers per panel, pushes PNGs over MQTT; Home
Assistant auto-created the device entities via MQTT discovery, two-way control
works, and the **pHAT now runs the Inkcast receiver** (Phase 3 pHAT done — the old
fetcher is disabled-not-deleted). The **now-playing view is LIVE** (HA
WebSocket, follow-the-active-MA-player by default). **Not yet done:** the
Impression Pi still runs its old fetcher, and the server only runs on a dev
machine (not yet a TrueNAS app).

## ⭐ Next steps (start here — prioritized)

1. **✅ DONE (2026-07-01): Now-playing data adapter (Phase 2) — LIVE.** The
   decision went to **HA `media_player`** (see
   `decisions/2026-07-01-now-playing-reads-ha-media-player.md`; MA-direct stays
   a possible future addition). Built + verified against the real HA: WebSocket
   client (`server/src/homeAssistant/homeAssistantStates.ts`, the **`ws`
   package — NOT Node's built-in WebSocket**, which drops HA's multi-MB
   `get_states`/registry frames with an opaque error) → RxJS dedupe/debounce
   pipeline (`adapters/nowPlayingAdapter.ts`) → view-data store → targeted
   re-push. Clock views also re-push each minute with real time (process `TZ`).
   Env vars are `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` (maintainer
   renamed from `HA_*` — "HA" is ambiguous with High Availability; both are in
   the maintainer's `.env` already). **Default = follow mode**: with no entity
   configured, the server discovers every Music Assistant `media_player` from
   the entity registry (54 found live) and shows whichever most recently
   started playing, switching players automatically (sticky "Last Played" when
   everything stops) — matching the old `ma_nowplaying_bridge.py`. Pin one
   entity globally with `HOME_ASSISTANT_NOW_PLAYING_ENTITY` or per device with
   `nowPlayingEntityId` in the devices file. Also fixed: the server now finds
   the root `.env` when started via `yarn dev:server` (cwd `packages/server`).
2. **Impression receiver (Phase 3 cont.).** Same `device-client` receiver on
   `inky-spectra`, with `INKCAST_IMAGE_TOPIC=inkcast/inky-impression/image`. Then
   build the **Immich photo-frame view** (port `home-displays/eink-clients/
   immich_impression_frame.py`: person-filtered album + face-aware 800×480 crop),
   with kids' `personIds` / Immich URL+token from **config, not code**.
3. **Deploy the server as a TrueNAS app** (durability — panels only update while
   the server runs; today that's a dev machine). Dockerfile exists; build → push
   to `docker-registry.octen.dev` → TrueNAS Custom App. Use **hostnames not IPs**
   throughout (`inky-phat`, `inky-spectra`; broker already `homeassistant.octen`).
4. **On-panel dither A/B** + **font swap** (Atkinson Hyperlegible), and **web
   config UI** (no settings UI yet — env/config-file only) for devices + the
   Immich/now-playing criteria. **TLS 8883** (certs in `/ssl`) is optional.

### Done since first handoff (2026-07-01, same day)
- Phase-3 **pHAT receiver** deployed (`device-client/`, commit 9d85d56): subscribes
  `inkcast/inky-phat/image`, draws via `inky`. Old `inky-phat-fetcher.service`
  `disable --now` (kept for rollback: `sudo systemctl disable --now
  inkcast-receiver && sudo systemctl enable --now inky-phat-fetcher`).
- **Colour-inversion fix** (commit 2bf478b): the dither pipeline now emits a plain
  **RGB** PNG, not an indexed-palette one (palette index order was
  content-dependent → the Inky lib swapped black/white between frames). If a mono
  panel ever inverts again, check for indexed-palette output.

## Where things live

- **Repo (local):** `D:\Code-Projects\Personal\inkcast` (local disk — NOT the G:
  network share; see the local-drive decision). Sibling app repos are in
  `D:\Code-Projects\Personal\` (`mux-magic`, `gallery-downloader`, `image-viewer`).
- **GitHub (public):** `https://github.com/Sawtaytoes/inkcast` (remote `origin`,
  branch `master`). Push freely — it's authorized.
- **Secrets:** gitignored `.env` at the repo root holds `MQTT_URL`,
  `MQTT_USERNAME`, `MQTT_PASSWORD`. Never commit it. `.env.example` documents the
  vars with placeholders.

## Architecture (recap)

```
Home Assistant (data brain, later) ──▶ Inkcast server (Docker on TrueNAS, later)
                                          • device registry (per-device palette, rotation, ditherProfile)
                                          • React view → Chromium/Satori → PNG
                                          • supersample → Lanczos downscale → dither to panel palette
                                          • Hono token API + OpenAPI/Scalar
                                          • MQTT: publishes each device to HA discovery + subscribes to commands
                                          │ MQTT push (retained PNG on inkcast/<id>/image)
                                          ▼
                              Pi Zero W (dumb receiver — PHASE 3, not built) → draws PNG to Inky
```

### Packages
- `@inkcast/core` — panels, palettes (mono + exact E6 Spectra blend), device
  registry (`src/devices/device.ts`), dither pipeline (`src/pipeline/dither.ts`).
- `@inkcast/views` — React views: `NowPlayingCard`, `ClockView` (inline styles,
  flexbox, `/** @jsxRuntime automatic @jsxImportSource react */` pragma required).
- `@inkcast/render` — `chromiumEngine`, `satoriEngine`, `renderDeviceImage` (device→PNG).
- `@inkcast/web` — Vite dev-preview (`yarn dev`) + Storybook (`yarn storybook`).
- `@inkcast/server` — Hono API + MQTT publisher + HA discovery + zod/mini config +
  OpenAPI. Entry `src/index.ts`.

### Commands
- `yarn dev` (web preview) · `yarn dev:server` (tsx watch) · `yarn storybook`
- `yarn build` → esbuild bundle `packages/server/dist/index.js`; prod =
  `node --enable-source-maps packages/server/dist/index.js` (NEVER tsx in prod).
- `yarn bakeoff` (render + dither contact sheets → gitignored `render-output/`)
- `yarn typecheck` · `yarn lint` (biome+eslint) · `yarn test` (20 tests)

## What's LIVE right now

- Broker: HA Mosquitto add-on at **`mqtt://homeassistant.octen:1883`** (=10.1.0.4).
  Login **`inkcast`** created in the add-on's *Logins* (creds mirrored in `.env`).
- Running the server (`node dist/index.js` from repo root, which auto-loads `.env`)
  connects, publishes discovery, and pushes initial frames. HA created 8 entities:
  `image/select/button/sensor` × {`inky-phat`, `inky-impression`} under devices
  "Inky pHAT" / "Inky Impression 7.3"". Two-way verified (HA View select → MQTT →
  re-render → push back).
- The dev-machine server may be stopped (the maintainer is fine with entities
  showing *unavailable* while temporary — retained discovery + last image persist).

### MQTT topic scheme (base `inkcast`, per device id)
- `inkcast/<id>/image` — the panel PNG (retained). **Phase-3 receiver subscribes here.**
- `inkcast/availability` — bridge LWT (`online`/`offline`).
- `inkcast/<id>/view/set` (cmd) · `inkcast/<id>/view` (state) · `inkcast/<id>/refresh/set` (cmd)
- `inkcast/<id>/last_render` (state)

## PHASE 3 — device-side receiver (NOT built; the maintainer wants this next)

**Goal:** replace the OLD fetcher on each Pi with a tiny Inkcast MQTT subscriber
that draws `inkcast/<id>/image` to the Inky panel. The physical panels still show
the old TRMNL/Terminus content until this is done.

### Devices (from the home-displays repo)
- **pHAT:** `pi@10.1.0.32` (hostname `inky-phat`, dual-homed eth0). Panel: Inky
  pHAT 250×122 mono. Old service: **`inky-phat-fetcher.service`** (polls Terminus;
  code in `home-displays/eink-clients/inky_phat_byos_fetcher.py`). `inky` 2.4.0 in
  `~/inky-venv` (needs `dtoverlay=spi0-0cs`). Mounts USB-up → rotate 180.
- **Impression:** `inky-spectra` @ `192.168.101.200` (IoT VLAN — reach via
  `ssh -J root@storeman.octen pi@192.168.101.200`). Inky Impression 7.3" E6
  800×480. Old service: `immich-impression-frame.service`.
- SSH: key-based from this workstation for `pi@10.1.0.32`; ProxyJump for the VLAN Pi.

### Receiver design (Python, ARMv6-safe)
- `paho-mqtt` + `inky` in the existing venv. Subscribe to `inkcast/<id>/image`
  (QoS1, retained), on message decode PNG (PIL) → `inky.set_image(...)` →
  `show()`. Report availability if you like. Match the device id used server-side
  (`inky-phat`, `inky-impression`).
- The image arrives **already dithered + rotated** for the panel (server does it),
  so the receiver just draws bytes. (If double-rotation appears, the server's
  `rotation` in the registry already applies 180 for the pHAT — set the receiver
  to draw as-is.)
- **Safety:** do NOT delete the old service — `systemctl disable --now` it and keep
  the file, so rollback is one command. Back up before changing. Add a new
  `inkcast-receiver.service` (`Restart=always`). Only one process may own SPI/GPIO
  — stop the old one first.
- **Dependency:** the panel only updates while the Inkcast **server is running and
  pushing**. For a persistent panel, the server must be deployed (below). A retained
  image means the receiver draws the last frame on boot.

## Server deployment (persistent) — TrueNAS app (NOT done)

Currently the server only runs on the dev machine. To make it durable:
- Multi-stage `Dockerfile` exists (esbuild bundle → `node` runtime, Playwright
  Chromium installed in-image). Build + push to the homelab registry
  (`docker-registry.octen.dev`) and deploy as a TrueNAS **Custom App** (structured
  ix-app form, per `truenas/AGENTS.md`), env: `MQTT_URL`, `MQTT_USERNAME`,
  `MQTT_PASSWORD`, `INKCAST_API_TOKEN`, optional `INKCAST_DEVICES_FILE`.
- Chromium in a container needs enough RAM/shm; verify the render path in-container.

## Open items / decisions pending

- **Dither defaults (on-panel A/B):** registry defaults are pHAT=atkinson@4×,
  Impression=floyd-steinberg@2×. Phase-0 sheets suggest **threshold** for mono text
  and **FS/Stucki** for E6 photos — confirm on the real panels once Phase 3 is up.
- **Font:** DejaVu Sans is a placeholder. `docs/research/eink-fonts.md` recommends
  **Atkinson Hyperlegible** (OFL) for the mono panel. Swap in `@inkcast/render/fonts`
  (add the TTF to `packages/render/src/assets/fonts/`) + the view `font-family`.
- **NowPlayingCard vs the old screen:** the old Terminus screen shows time + date;
  the Inkcast `NowPlayingCard` currently shows only banner/artist/title. If we want
  time/date on it, extend the view (mind the 250px mono width — long text truncates,
  e.g. "Kids Bedroo…").
- **Views are data-less right now:** the server renders sample/static data. Wiring
  real now-playing (Music Assistant / HA `media_player`) + clock time is a follow-up
  (Phase 2 data adapters; RxJS is the right tool for the event/debounce/cancel
  pipeline there — deliberately deferred, not used in the request/response paths).
- **TLS on 8883:** see below.

## TLS on 8883 (how to add the certs)

8883 isn't listening because `fullchain.pem`/`privkey.pem` (set in the Mosquitto
add-on config) aren't present/valid in HA's **`/ssl`** folder. To enable:
1. Get a cert+key whose name matches how Inkcast will connect (e.g. a cert for
   `homeassistant.octen` — but that's a `.octen` LAN name, so it'd be self-signed;
   a real LE cert would be for a public domain that must also resolve on the LAN).
2. Put `fullchain.pem` + `privkey.pem` in HA's `/ssl` (via the **Samba share**
   add-on → `\\homeassistant\ssl`, or the **File editor / Studio Code Server**
   add-on, or `scp` to the HA host `/root/ssl` equivalent).
3. Restart the Mosquitto add-on; confirm 8883 now listens.
4. Point Inkcast at `MQTT_URL=mqtts://<cert-hostname>:8883`. If the cert isn't
   publicly trusted / name-mismatched, set `MQTT_REJECT_UNAUTHORIZED=false` (LAN)
   or provide `MQTT_CA_FILE`. **No client cert needed** ("Require Client
   Certificate" is OFF). Inkcast does NOT need copies of fullchain/privkey — the
   broker presents them.
Meanwhile plain `mqtt://homeassistant.octen:1883` works fine on the LAN.

## Requested follow-ups (2026-07-01)

- **Immich photo-frame view + data source (NOT built).** Views currently render
  STATIC sample data (e.g. the now-playing card is hardcoded). The Impression's
  Immich photo frame from the home-displays repo
  (`eink-clients/immich_impression_frame.py`: person-filtered album, face-aware
  800×480 crop, E6 dither) is NOT yet ported into Inkcast. Port it as an Inkcast
  view + data adapter. **Search criteria (kids' Immich `personIds`, album, Immich
  URL+token) must be config, not code** — via env / the gitignored devices/config
  file, and ideally editable from a **web config UI** (Inkcast doesn't have a
  settings UI yet — only env/config-file today; a config/editor UI is a desirable
  addition and fits the "see + test views" editor goal).
- **Use hostnames, not IPs, for the Pis.** The Pis' IPs are dynamic. Deploy /
  reference them by hostname (`inky-phat`, `inky-spectra`) — via `.local` mDNS or
  the `.octen` DNS domain — in the device-client docs and any deploy scripts.
  (The broker is already referenced by DNS: `homeassistant.octen`.) Verify which
  form resolves on the LAN and standardise on it.

## Git state

12+ commits on `master`, pushed to GitHub. Clean tree. mux-magic has an unpushed
local commit adding the `2026-07-01-prod-runs-esbuild-bundle-not-tsx` decision.
