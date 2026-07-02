# Inkcast — HANDOFF (resume-from-cold)

Everything a fresh agent needs to continue Inkcast. Rewritten 2026-07-02 after
the third build session (the "idle fallback + photo controls + Impression
cutover" night). Read this + [../AGENTS.md](../AGENTS.md) +
[decisions/README.md](decisions/README.md) first. History of the earlier
phases is in git (`git log docs/HANDOFF.md`).

## One-line status

Inkcast is **fully live on both panels**: GitHub Actions builds to GHCR,
TrueNAS runs it, BOTH Pis (pHAT + Impression 7.3") run the `device-client/`
receiver — the old on-device Immich fetcher is retired (unit kept for
rollback). Now-playing follows HA players (minus excluded bedtime speakers),
idles back to per-device ambient views, and the photo frame does
recency-weighted, face-safe, query-able Immich photos — all knobs editable
from the HA device page.

## ⭐ Next steps (start here — prioritized)

1. **Verify tonight's features against real life** (shipped 2026-07-02,
   ~1:45 AM, lightly exercised): idle fallback after music stops (5 min →
   pHAT shows "Clock (Weather)", Impression shows "Photo Frame"), the
   Photo Frame Next/Previous buttons, the Query entity ("green shirt"-style
   Immich smart search), Color/B&W + Brightness/Saturation knobs on the
   Impression, and how the neutral-protected dither looks on real photos
   (it kills colour speckle on text; confirm it doesn't flatten photo grays).
2. **Hostnames, not IPs, for the Pis** (maintainer ask): `inky-phat` (LAN
   `10.1.0.32`) / `inky-spectra` (IoT VLAN `192.168.101.200`, reachable via
   `ssh -J root@storeman.octen`); reference via `.octen`/mDNS names in docs +
   deploy scripts; verify which form resolves.
3. **[docs/future-work.md](future-work.md)** — maintainer-deferred ideas:
   photo year/date overlay on the Photo Frame, richer weather (icons,
   condition backgrounds, forecast view), UniFi-Protect-presence-driven
   photo people, collapsing the three now-playing designs into one.
4. **Optional:** web config UI (Jotai/RTK noted), TLS 8883, progress text on
   the Dashboard (NO animated progress bars — e-ink).

## Settled by the maintainer (do not re-litigate)

- **Track title first, above the artist, biggest+bold**; hide an empty/"—"
  artist line (`decisions/2026-07-02-title-above-artist.md`). Editorial +
  Poster stay until he tests them on the big panel.
- **Face crop shifts, never zooms** — maximal cover window steered to keep
  faces in frame; letterbox when impossible
  (`decisions/2026-07-02-face-crop-shifts-never-zooms.md`).
- **Idle fallback is server-side, per device**
  (`decisions/2026-07-02-now-playing-idle-fallback.md`): small panel idles
  to "Clock (Weather)", large to "Photo Frame"; the HA View select is NOT
  touched by fallback.
- **Dither: Floyd-Steinberg preferred on BOTH panels** (A/B'd on glass);
  keep all six algorithms in the select. Per-device choice persists via
  retained MQTT.
- **Now-playing reads HA `media_player`**, not MA directly.
- **Images publish to GHCR via GitHub Actions**, not homelab Gitea.
- **English view names** double as MQTT/API payloads and HA options.
- **Fonts committed to the repo**; Atkinson Hyperlegible + DejaVu fallback.
- All prior locked decisions in [decisions/README.md](decisions/README.md).

## Deploy pipeline (how to ship a change)

1. Commit to `master`, push to GitHub (`origin`; push is authorized).
2. Actions: typecheck + tests (56) → `ghcr.io/sawtaytoes/inkcast:latest`.
3. Bounce the TrueNAS app `inkcast` (MCP `stop_app`/`start_app`) —
   `pull_policy: always`. Env changes: `midclt call --job app.update
   inkcast '{"values": ...}'` on storeman (merge `envs` array; see git log
   of this session) or the UI.
4. Verify: `curl http://storeman.octen:8788/health`, `docker logs` (filter
   `ix-inkcast`), `/api/devices/<id>/image` (Bearer `INKCAST_API_TOKEN`).

App env also carries `HOME_ASSISTANT_WEATHER_ENTITY=weather.pirateweather`.
Follow-mode player exclusions (the famous 12:45a Totoro incident: guest +
kids bedroom speakers) and the per-panel idle view/timeout are HA ENTITIES,
not env vars — see the "Inkcast Server" device and each panel's config
section (`decisions/2026-07-02-global-config-lives-in-ha-entities.md`).
Full env list: `.env.example`.

## Architecture (current)

```text
HA (WS, ws pkg — NOT native WebSocket: HA's multi-MB frames kill undici)
 └─ nowPlayingAdapter: follow players from HOME_ASSISTANT_FOLLOW_PLATFORMS
    (music_assistant,plex) minus the HA-edited exclusion list, or pinned entity
    per device → RxJS dedupe/debounce(1s) → artwork fetch → viewDataStore
    (entries carry stoppedAtMs for the idle timer) → push.
    Same socket streams the weather entity → WeatherData → Clock (Weather).
Immich (REST)
 └─ photoFrameAdapter: people (HA text) + smart-search query (HA text) →
    per-person UNION pool w/ fileCreatedAt (cached 6h) → recency-weighted
    random pick (half-life 365d, 15% floor) → preview JPEG + face boxes →
    face-STEERED maximal cover-crop or letterbox → panel PNG → push.
    20-deep per-device history ← Next/Previous photo buttons.
Idle fallback: pushController.getEffectiveView() — a now-playing selection
    with nothing playing for the HA-set idle minutes renders the HA-set
    idle view (seeds: pHAT → Clock (Weather), Impression → Photo Frame;
    "None" disables). Minute ticker re-pushes clock-bearing EFFECTIVE
    views + any effective-view change.
 ↓
pushController → renderService (Chromium; Satori alt) → dither pipeline
    (per-device: algorithm override, Color/B&W mode, brightness/saturation
    modulate, neutral-protection pass on >2-colour palettes: chroma ≤ 26
    quantizes black/white-only — the text-fringing fix) → retained MQTT
    inkcast/<id>/image → Pi receivers draw it
```

### MQTT topics (base `inkcast`, per device id)

- `<id>/image` (retained PNG) · `availability` (LWT + 60s heartbeat)
- `<id>/view/set|view` — the retained view state also RESTORES the
  selection on server restart (used to silently reset to the default)
- `<id>/refresh/set` · `<id>/last_render`
- `<id>/photo_people/set|photo_people` · `<id>/photo_query/set|photo_query`
- `<id>/photo_next/set` · `<id>/photo_previous/set`
- `<id>/dither/set|dither` · `<id>/colour_mode/set|colour_mode` (e6 only)
- `<id>/brightness/set|brightness` · `<id>/saturation/set|saturation`
  (retained state topics = persistence; defaults seeded 5s after boot)

### HA entities per device (MQTT discovery; config names prefixed by area)

Image (Screen) · Select (View: 3 now-playing / Photo Frame / Clock /
Clock (Weather)) · Buttons (Refresh, Photo Frame: Next/Previous photo) ·
Config: Display: Dither, Display: Color mode (e6 only, Color|Black & White),
Display: Brightness %, Display: Saturation %, Now Playing: Idle view
("None" disables the fallback), Now Playing: Idle minutes, Photo Frame:
People, Photo Frame: Query · Sensor (Last render). The `Display:`/`Photo
Frame:`/`Now Playing:` prefixes are deliberate — HA has no config
sub-groups, names are the grouping.

Plus one server-wide "Inkcast Server" device: `Follow: Excluded players`
(comma-separated media_player ids; applied LIVE — an excluded player is
evicted from the panel via a synthetic idle retraction). Topics:
`inkcast/config/follow_exclude/set|state`.

### Views (`packages/views/src/`)

- `NowPlayingDashboard` — TITLE first (bold anchor), artist (hidden when
  empty/"—"), album; `fitFontSize` shrink-to-fit (≥62%) before ellipsis,
  artist/album cap below the fitted title so hierarchy never inverts;
  compact ≤200px: no banner, body optically high, bold small text,
  `Th-02` / `12:45a` footer. The maintainer's favorite.
- `NowPlayingEditorial` / `NowPlayingPoster` — untested on glass, kept.
- `PhotoFrameView` — full-bleed pre-cropped photo.
- `ClockView` — big clock (date now bold: thin text dies on e-ink).
- `ClockWeatherView` — clock + `79° Partly cloudy` (weather optional).
- All: inline styles + flexbox only (Satori subset), pragma header, sizes
  derive from `height`. `scripts/preview-views.ts` renders every scenario →
  `render-output/preview/` (how layout work is reviewed; e-ink can't be
  screenshotted).

## Where things live

- Repo: `D:\Code-Projects\Personal\inkcast` (local disk). GitHub
  `Sawtaytoes/inkcast` (public, `master`).
- Secrets: repo `.env` (gitignored). TrueNAS app carries its own env copies.
- Devices: `SEED_DEVICES` in `@inkcast/core` (no devices file in use) —
  includes per-device `idleViewName`.
- Receivers: pHAT `pi@10.1.0.32`, Impression `pi@192.168.101.200` (IoT VLAN,
  `-J root@storeman.octen`); both run `inkcast-receiver.service` with a
  root-owned mode-600 creds drop-in. Old units (`inky-phat-fetcher`,
  `immich-impression-frame`) disabled but kept — rollback is one command
  (see `device-client/README.md`).
- Commands: `yarn dev:server` · `yarn build` → `node
  packages/server/dist/index.js` · `yarn typecheck` / `lint` / `test` (56) ·
  `yarn tsx scripts/preview-views.ts`.

## Gotchas learned the hard way (don't rediscover)

- **Node's built-in WebSocket cannot read HA's big frames** — use `ws`.
  Symptom: silent 5s reconnect loop.
- **Two server instances fight** over retained availability; one at a time.
- **Immich AND-matches `personIds`** (metadata AND smart search) — union
  per person client-side; don't "simplify" it back.
- **Chromium in Docker needs `--no-sandbox --disable-dev-shm-usage`**; the
  Dockerfile MUST run `yarn build`.
- **`entity_picture` can be an absolute URL** (Music Assistant).
- **A "stuck" now-playing may be REAL playback** — check
  `media_player` states before debugging the server (the 12:45a "bug" was
  the guest-bedroom bedtime speaker actually playing; fix was the follow
  exclude + idle fallback, not a code bug).
- **midclt syntax:** `midclt call --job app.update inkcast '<json>'` —
  `-job` (one dash) silently parses as `-j -ob` and fails.
- Biome/ESLint auto-fix reorders imports — run `yarn lint` before
  committing, re-stage.
- **Only one process may own the Pi's SPI/GPIO** — disable the old fetcher
  before starting the receiver.
