# Inkcast — HANDOFF (resume-from-cold)

Everything a fresh agent needs to continue Inkcast. Rewritten 2026-07-02 after
the third build session (the "idle fallback + photo controls + Impression
cutover" night). Read this + [../AGENTS.md](../AGENTS.md) +
[decisions/README.md](decisions/README.md) first. History of the earlier
phases is in git (`git log docs/HANDOFF.md`).

## ⚠️ 2026-07-04 — ARCHITECTURE PIVOT IN PROGRESS (read this first)

Inkcast is mid-migration to a **dumb, Home-Assistant-agnostic renderer**. The
locked decision is
[decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md](decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md)
(supersedes "now-playing reads HA media_player" and "agenda pulls from HA").

**Target architecture:** Inkcast's only contract with the house is **MQTT**. HA
*computes and pushes* each view's data per device
(`inkcast/<device>/now_playing/set`, `.../weather/set`, `.../agenda/set`);
Inkcast subscribes and renders what it's handed. Inkcast **stops connecting to
HA entirely** — delete the HA WebSocket client, `media_player` reading, the
"followed platforms" registry lookup, the now-playing follow/priority resolver,
the weather/calendar fetchers, and the "Music playing" binary sensor. **All**
"which player / idle-vs-active / priority / exclusions / when to switch a view"
logic moves to **HA templates + automations**. Time is the one exception:
rendered locally from Inkcast's own clock; only timezone/format are MQTT config.

**Landed on `master` (this session, deployed):**

- The other agent's branch `feat/inkcast-mqtt-data-in`, merged: emoji-strip in
  titles (no tofu), art-forward Editorial redesign, the decision record above,
  and **scaffolding** — `packages/server/src/mqtt/viewDataPayloads.ts` (payload
  parsers, 84 tests green) + `packages/server/src/render/artworkFetch.ts`
  (plain-URL artwork fetch, since HA will push an artwork **URL**, not bytes).
  Scaffolding is **dormant** (not wired) — the WebSocket still runs.
- Small fixes shipped tonight (all deployed, verified): compact pHAT agenda now
  stacks up to 3 events with the time shrunk/moved up; duplicate agenda events
  (same event shared across two calendars) are de-duped; all-day agenda events
  stay visible their whole day (were wrongly filtered at midnight); and a real
  HA-WebSocket bug — `get_states` reused a fixed command id so HA rejected every
  on-demand refresh (`id_reuse`), meaning a just-configured weather entity
  didn't appear until a restart. Fixed with unique incrementing ids
  (`homeAssistantStates.ts`). **NOTE:** that fix lives in code the pivot will
  delete — keep it until the WebSocket is ripped out, then it goes with it.

**Still TODO (the atomic slice + HA side):**

1. **Rip out the HA WebSocket + wire MQTT data-in.** Replace the now-playing /
   weather / agenda *fetchers* with MQTT subscriptions using the parsers in
   `viewDataPayloads.ts`; keep the view renderers. Delete the follow resolver,
   `homeAssistantStates.ts`, `haArtwork.ts` (use `artworkFetch.ts`), the
   "Music playing" sensor, and the HA URL/token env.
2. **Clock timezone/format become MQTT config entities** (like dither/crop).
3. **HA-side templates/automations** publish each view's payload to Inkcast's
   MQTT topics — this is where the now-playing priority (Plex before the
   Shield's cast player), follow-the-active-player, and exclusions now live.

**A live HA config gap found tonight (fix on the HA side, not in the app):** the
"Weather: Entity" MQTT config (`text.inkcast_server_weather_entity`) was unset
(`unknown`), so no weather rendered on either clock. I set it to
`weather.pirateweather` — weather now shows. Under the new architecture HA will
push weather data instead, but until then that config must stay set.

**Do NOT** add follow/priority/exclusion logic to Inkcast (I mistakenly built a
"follow players allowlist" config entity this session and reverted it — it
violated both the follow-exclusion decision and the pivot above). The now-playing
"wrong player" symptom the maintainer reported (a panel showing a speaker's last
track instead of the Shield) is a *consequence* of the old shared follow-
aggregate and is **resolved by the pivot**: once HA pushes each panel's
now-playing payload, HA fully decides what each panel shows.

**HA view-switching automations (already correct, HA-side):**
`automation.inky_impression_now_playing_view` (Kitchen Counter →
`select.inky_impression_7_3_view`, triggers off `media_player.family_room_shield_6`)
and `automation.inky_phat_now_playing_view` (Office Desk → `select.inky_phat_view`,
triggers off the office/downstairs players). They pick *when* to show Now Playing;
under the pivot they'll also publish *what* to show.

## One-line status

Inkcast is **fully live on both panels**: GitHub Actions builds to GHCR,
TrueNAS runs it, BOTH Pis (pHAT + Impression 7.3") run the `device-client/`
receiver — the old on-device Immich fetcher is retired (unit kept for
rollback). Now-playing follows HA players (HA automations decide which
players count), and the photo frame does
recency-weighted, face-safe, query-able Immich photos — all knobs editable
from the HA device page.

## ⭐ Next steps (start here — prioritized)

1. **Verify tonight's features against real life** (shipped 2026-07-02,
   lightly exercised): the view-switching automations (another agent is
   building them off the "Music playing" binary sensor + the Plex family
   room player), Photo Frame Next/Previous buttons, the Query entity
   ("green shirt"-style Immich smart search), Color/B&W +
   Brightness/Saturation knobs on the Impression, and how the
   neutral-protected dither looks on real photos (it kills colour speckle
   on text; confirm it doesn't flatten photo grays).
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
- **No server-side idle logic — HA automations drive the View select,
  immediately** (`decisions/2026-07-02-view-switching-via-ha-automations.md`,
  supersedes the same-day idle-fallback decision). The server provides the
  "Music playing" binary sensor as the signal.
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
View switching: HA AUTOMATIONS drive the View select (no server-side
    idle logic — decisions/2026-07-02-view-switching-via-ha-automations.md).
    The server publishes the signal: retained "Music playing" binary
    sensor (inkcast/now_playing_active, exclusions already applied).
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
Display: Brightness %, Display: Saturation %, Photo Frame: People,
Photo Frame: Query · Sensor (Last render). The `Display:`/`Photo Frame:`
prefixes are deliberate — HA has no config sub-groups, names are the
grouping.

Plus one server-wide "Inkcast Server" device: the `Music playing` binary
sensor (`binary_sensor.inkcast_server_music_playing` — THE signal for the
view-switching automations). It has no editable global config. Which
followed players drive the panels, and which to ignore (e.g. the always-on
guest-bedroom bedtime speaker), is now an HA-automation concern — the
server-side follow-exclusion setting was removed (see
`docs/decisions/2026-07-02-follow-exclusion-moves-to-ha-automation.md`).

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
