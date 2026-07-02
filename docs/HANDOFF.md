# Inkcast — HANDOFF (resume-from-cold)

Everything a fresh agent needs to continue Inkcast. Rewritten 2026-07-02 after
the second build session. Read this + [../AGENTS.md](../AGENTS.md) +
[decisions/README.md](decisions/README.md) first. History of the earlier
phases is in git (`git log docs/HANDOFF.md`).

## One-line status

Inkcast is **fully live in production**: GitHub Actions builds the image to
GHCR, TrueNAS runs it, it streams real playback from Home Assistant (follow
mode across Music Assistant + Plex), renders five selectable views (three
now-playing designs, an Immich photo frame, a clock), and every user knob —
view, dither algorithm, photo-frame people — is edited from the HA device
page. **The one remaining gap:** the physical Impression Pi still runs its
OLD Immich fetcher; the pHAT already runs the Inkcast receiver.

## ⭐ Next steps (start here — prioritized)

1. **Impression receiver cutover (the last Phase-3 item).** Deploy the same
   `device-client/` receiver to `inky-spectra` (IoT VLAN:
   `ssh -J root@storeman.octen pi@192.168.101.200`) with
   `INKCAST_IMAGE_TOPIC=inkcast/inky-impression/image`. Pattern proven on
   the pHAT: `systemctl disable --now immich-impression-frame.service`
   (keep the unit file — rollback is one command), install
   `inkcast-receiver.service` (`Restart=always`), only one process may own
   SPI/GPIO. The retained image topic means it draws the current frame on
   first boot. Everything the old fetcher did now happens server-side.
2. **Hostnames, not IPs, for the Pis** (maintainer ask): reference
   `inky-phat` / `inky-spectra` via `.octen` DNS or mDNS in device-client
   docs/deploy scripts; verify which form resolves. Broker already uses DNS.
3. **Web config UI** (nice-to-have): per-device config now lives in HA
   entities, so this is lower priority than it was. If built, note the
   maintainer's suggestion (2026-07-02): the hand-rolled stores
   (`deviceStore`, `viewDataStore`, `deviceConfigStore`) would map well to
   **Jotai or Redux-Toolkit** — his words, "something to keep in mind", not
   a mandate.
4. **Optional:** TLS 8883 (broker certs in HA `/ssl`; see git history of
   this file for the step-by-step), progress text ("2:14 / 4:05") on the
   Dashboard view if the maintainer asks — do NOT attempt animated
   progress bars (e-ink: Impression has no partial refresh at all; pHAT's
   controller could but the `inky` lib doesn't expose it).

## Settled by the maintainer (do not re-litigate)

- **Dither: Floyd-Steinberg preferred on BOTH panels** (he A/B'd on the
  real glass 2026-07-02). Keep all six algorithms in the HA select —
  "It depends on the content." His per-device choice persists via the
  retained `inkcast/<id>/dither` topic; registry defaults stay as-is.
- **Now-playing reads HA `media_player`**, not MA directly
  (`decisions/2026-07-01-now-playing-reads-ha-media-player.md`).
- **Images publish to GHCR via GitHub Actions**, not the homelab Gitea
  registry (`decisions/2026-07-01-images-publish-to-ghcr-not-homelab-registry.md`).
- **English view names** ("Now Playing (Dashboard)", not `now-playing`) —
  they double as MQTT/API payloads and HA select options.
- **Fonts are committed to the repo** (no network fetch at build/runtime).
  Panel face = Atkinson Hyperlegible (OFL), embedded base64 `@font-face`
  for Chromium + loaded from disk for Satori; DejaVu is the CJK fallback.
- All prior locked decisions in [decisions/README.md](decisions/README.md).

## Deploy pipeline (how to ship a change)

1. Commit to `master`, push to GitHub (`origin`; push is authorized).
2. GitHub Actions runs typecheck + 35 tests, then builds + pushes
   `ghcr.io/sawtaytoes/inkcast:latest` (+ sha tag). Public package.
3. Bounce the TrueNAS app `inkcast` (MCP `stop_app`/`start_app`, or UI) —
   `pull_policy: always` re-pulls `:latest`.
4. Verify: `curl http://storeman.octen:8788/health`, container logs
   (`docker logs` on storeman, filter `ix-inkcast`), and
   `/api/devices/<id>/image` for an actual render.

App config: ix-app Custom App, port 8788, 16 CPU / 16GB (Chromium headroom),
env = `MQTT_*`, `HOME_ASSISTANT_URL/TOKEN`, `IMMICH_URL/API_TOKEN`,
`INKCAST_PHOTO_MINUTES`, `PORT`. No volumes. The Immich key is named
"Inkcast" in Immich (asset.read/view/download + person.read).
`inkcast.octen.dev` reverse-proxies to `storeman.octen:8788` via NPM; `/`
redirects to `/docs` (Scalar API reference).

## Architecture (current)

```
HA (WS, ws pkg — NOT native WebSocket: HA's multi-MB frames kill undici)
 └─ nowPlayingAdapter: registry lookup → follow players from
    HOME_ASSISTANT_FOLLOW_PLATFORMS (music_assistant,plex) OR pinned
    entity per device → RxJS dedupe/debounce(1s) → artwork fetch
    (entity_picture → data URI, cached) → viewDataStore → push
Immich (REST)
 └─ photoFrameAdapter: people from HA text entity → per-person asset UNION
    (cached 6h) → random asset → preview JPEG + face boxes → face-aware
    crop or letterbox (sharp, tested) → panel-sized PNG → push (rotates
    every INKCAST_PHOTO_MINUTES; minute ticker checks staleness)
Clock ticker: minute-aligned re-push of clock-bearing views
    (Clock + Now Playing (Dashboard))
 ↓
pushController (single render+publish path; applies the HA dither override)
 → renderService (Chromium default; Satori alt) → dither pipeline → MQTT
 → retained inkcast/<id>/image → Pi receivers draw it
```

### MQTT topics (base `inkcast`, per device id)

- `<id>/image` (retained PNG) · `availability` (LWT + **60s heartbeat** —
  a stale retained `offline` from a dead second instance self-heals)
- `<id>/view/set|view` · `<id>/refresh/set` · `<id>/last_render`
- `<id>/photo_people/set|photo_people` (retained state = persistence)
- `<id>/dither/set|dither` (retained; seeded with the registry default)

### HA entities per device (all MQTT discovery, no custom integration)

Image (Screen) · Select (View: 3 now-playing designs / Photo Frame /
Clock) · Button (Refresh) · Select (Dither, config) · Text (Photo Frame
People, config — unique first names, full names, or UUIDs) · Sensor
(Last render, diagnostic).

### Views (`packages/views/src/`)

- `NowPlayingDashboard` — art + artist/title/album; large: banner + clock
  corner + date footer; small (≤200px): no banner, compact `Th-02` /
  `12:31a` footer pair. The maintainer's current favorite on the pHAT.
- `NowPlayingEditorial` — record-sleeve typography, framed art plate.
- `NowPlayingPoster` — Bauhaus flat-ink blocks, all six E6 inks, art column.
- `PhotoFrameView` — full-bleed pre-cropped photo (placeholder when
  unconfigured). `ClockView` — big clock.
- All: inline styles + flexbox only (Satori subset), sizes derive from
  `height`, `/** @jsxRuntime automatic @jsxImportSource react */` pragma.
- Music-note glyphs (♪♫) are stripped from metadata server-side. YouTube
  Music videos often have NO artist/album — the whole blob is the title;
  that's a data limitation, not a layout bug.

## Where things live

- Repo: `D:\Code-Projects\Personal\inkcast` (local disk, not the share).
  GitHub `Sawtaytoes/inkcast` (public, `master`).
- Secrets: repo `.env` (gitignored): `MQTT_*`, `HOME_ASSISTANT_URL/TOKEN`.
  The TrueNAS app carries its own env copies (incl. Immich).
- Devices: `SEED_DEVICES` in `@inkcast/core` (no devices file in use).
- pHAT receiver: `pi@10.1.0.32`, `inkcast-receiver.service` (old
  `inky-phat-fetcher.service` disabled, kept for rollback).
- Commands: `yarn dev:server` (now finds the root `.env` from any cwd) ·
  `yarn build` → `node packages/server/dist/index.js` (never tsx in prod) ·
  `yarn typecheck` / `lint` / `test` (35).

## Gotchas learned the hard way (don't rediscover)

- **Node's built-in WebSocket cannot read HA's big frames** (get_states /
  entity_registry on a 157-player install) — it drops with an EMPTY error.
  Use the `ws` package. Symptom: silent 5s reconnect loop.
- **Two server instances fight**: shared retained availability topic — the
  dying one's `offline` sticks and HA ignores the live one's pushes. The
  60s heartbeat heals it, but still: one server at a time.
- **Immich AND-matches `personIds`** — union per person client-side for
  "any of the kids" (already implemented; don't "simplify" it back).
- **Chromium in Docker needs `--no-sandbox --disable-dev-shm-usage`**
  (safe: renders only our own SSR markup) and the Dockerfile MUST run
  `yarn build` (start:prod runs the bundle).
- **`entity_picture` can be an absolute URL** (Music Assistant), not
  always an HA-relative path.
- Biome/ESLint auto-fix on `yarn lint` reorders imports and renames
  `it`→`test` — run it before committing, re-stage.
