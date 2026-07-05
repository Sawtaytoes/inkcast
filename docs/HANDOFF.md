# Inkcast — HANDOFF (resume-from-cold)

Everything a fresh agent needs to continue Inkcast. Rewritten 2026-07-02 after
the third build session (the "idle fallback + photo controls + Impression
cutover" night). Read this + [../AGENTS.md](../AGENTS.md) +
[decisions/README.md](decisions/README.md) first. History of the earlier
phases is in git (`git log docs/HANDOFF.md`).

## ✅ 2026-07-05 (later) — HA-SIDE DATA-PUSH BUILT + VERIFIED (pivot TODO #3 done)

The HA templates/automations that push each view's data over MQTT (the remaining
half of the pivot) are **built and live in HA**, and the loop is **verified on
both real panels** (rendered PNGs pulled from `http://storeman.octen:8788/api/devices/<id>/image`).
The app was restarted onto `:latest` first so it was guaranteed to be the pivot
image (the deployed env still carried stale `HOME_ASSISTANT_*` vars — see cleanup
note below).

**Live device ids (confirmed):** `inky-phat` (Office Kevin's Desk, mono) and
`inky-impression` (Kitchen Counter, e6). The HA entity slug `inky_impression_7_3`
comes from the device *name* ("Inky Impression 7.3\""), **not** the MQTT topic id
— the topic base is `inkcast/inky-impression/…`. No `INKCAST_DEVICES_FILE` in the
deploy, so ids come from `SEED_DEVICES`.

**Structure (mirrors the maintainer's room-light automations: a shared `Control …`
script + per-thing `Control …` automations driven by trigger IDs).** Real
house-specific entity ids are intentionally kept OUT of this public repo (locked
decision); the concrete ids live in HA + the next agent's memory.

- **Shared script `Control Inkcast eInk Screen`** (`script.control_inkcast_eink_screen`,
  Media category + `media` label) — all the publish logic. Typed `fields:`
  `device_id`, `players` (priority list), `weather_entity`, `calendars`,
  `ha_base_url`, `trigger_id`. It branches on `trigger_id` and publishes to
  `inkcast/<device_id>/{now_playing,weather,agenda}/set` (retained). Now-playing
  picks the first `playing` player (empty → idle placeholder); artwork prefixes
  the HA base URL onto a relative `entity_picture`; agenda runs `calendar.get_events`
  over the passed `calendars`, guarded by `continue_on_error` + `{{ cal is defined }}`
  so a calendar outage **skips** (never clobbers the last-good retained agenda).
- **Two per-display automations** `Control Kitchen Counter eInk Screen` +
  `Control Office Kevin's Desk eInk Screen` (Media category + `media` label) —
  triggers only, each calls the script with `trigger_id: "{{ trigger.id }}"` and
  that display's params. Trigger ids: `Now Playing` (its players' state changes),
  `Weather` (weather entity change), `Refresh Periodic` (`/15` → weather+agenda),
  `Refresh All` (HA start → all three).

**Kitchen now-playing priority** stays Plex family-room player → Shield cast
player (Plex title+poster beats the cast player's YouTube title/no-art — per
[decisions/2026-07-04-now-playing-source-is-ha-config-priority-list.md](decisions/2026-07-04-now-playing-source-is-ha-config-priority-list.md)),
passed as the `players` field. **Which calendars a display shows is the automation's
`calendars` field** — set it there per display (there is no Inkcast "Agenda:
Calendars" config entity anymore; the pivot removed it).

**Verified 2026-07-05 (rendered on glass, PNGs pulled from the image API):** with
the calendar integration restored, calling the script with `trigger_id: Refresh All`
made the pHAT Clock (Weather) show temp + condition, a Now Playing view show the
`Nothing playing` idle placeholder, and Clock (Agenda) render the **real** all-day
event for the day (correct sort / 12-hour times / all-day handling). To seed all
topics on demand, call `script.control_inkcast_eink_screen` with `trigger_id:
Refresh All` (manual `automation.trigger` won't set `trigger.id`).

**Plex-priority follow-up (Kitchen):** the Plex family-room player is one of ~50
ephemeral per-client Plex entities; it exists and is used now, but if Plex
recreates it under a new id the Kitchen `players` field must be updated to match.

**Cleanup — DONE 2026-07-05.** Deploy env trimmed to the 6 infra vars
(`MQTT_URL/USERNAME/PASSWORD`, `PORT`, `IMMICH_URL`, `IMMICH_API_TOKEN`) via
`midclt call --job app.update inkcast '{"values":{"envs":[…]}}'` on storeman —
dropped `HOME_ASSISTANT_URL`/`_TOKEN`/`_WEATHER_ENTITY` + `INKCAST_PHOTO_MINUTES`
(all unread by the pivot code; only a stale comment in `index.ts` mentions them).
The stale `binary_sensor.inkcast_server_music_playing` / `text.…weather_entity` /
`text.…agenda_calendars` / `text.…follow_excluded_players` HA entities were
already gone (the app restarts reconciled discovery), and the 4 orphaned retained
**state** topics (`inkcast/{agenda_calendars,weather_entity,now_playing_active}`,
`inkcast/config/follow_exclude`) were cleared with empty retained payloads. Broker
+ HA verified clean.

## ⚠️ 2026-07-05 — ARCHITECTURE PIVOT: CODE CUTOVER DONE (read this first)

Inkcast is now a **dumb, Home-Assistant-agnostic renderer**. The locked decision
is
[decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md](decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md)
(supersedes "now-playing reads HA media_player" and "agenda pulls from HA").

**Architecture:** Inkcast's only contract with the house is **MQTT**. HA
*computes and pushes* each view's data per device
(`inkcast/<device>/now_playing/set`, `.../weather/set`, `.../agenda/set`);
Inkcast subscribes and renders what it's handed. Inkcast **does not connect to HA
at all**. **All** "which player / idle-vs-active / priority / exclusions / when
to switch a view" logic lives in **HA templates + automations**. Time is the one
exception: rendered locally from Inkcast's own clock; only timezone/format are
MQTT config (still TODO — see below).

**Landed on `master` 2026-07-05 (`824862b`, the code cutover):** the HA
WebSocket client, the now-playing follow/priority/source resolver + pinned-entity
wiring, the HA calendar REST poller, the HA artwork proxy, the "Music playing"
binary sensor + `now_playing_active` publish, the "Weather: Entity" / "Agenda:
Calendars" config entities, and all `HOME_ASSISTANT_*` / `INKCAST_CALENDAR_MINUTES`
env are **all deleted** (−1.7k lines, `ws` dep dropped). The three per-device
data topics are wired through the `viewDataPayloads.ts` parsers +
`artworkFetch.ts` (plain-URL artwork), and `viewDataStore` now keys now-playing +
weather by device id. typecheck + 64 tests + lint + build green.

**⚠️ HA-side work now REQUIRED for the panels to show anything** (the app renders
idle placeholders until HA pushes): add HA templates/automations that publish
each view's payload to `inkcast/<device>/{now_playing,weather,agenda}/set`
(retained). This is where the now-playing priority (Plex before the Shield's cast
player), follow-the-active-player, exclusions (the 12:45a Totoro bedtime speaker),
and weather/calendar selection now live. Any automation that referenced
`binary_sensor.inkcast_server_music_playing` must instead trigger off the HA-side
player state directly.

**Still TODO:**

1. ~~Rip out the HA WebSocket + wire MQTT data-in.~~ **DONE 2026-07-05
   (`824862b`).**
2. ~~Clock timezone/format become MQTT config entities.~~ **DONE 2026-07-05** —
   "Clock: Timezone" (text), "Clock: Time format" (12/24-hour select), and
   "Clock: Date style" (Long/Numeric select), each global default + per-device
   override. `TZ` is now only the boot fallback.
3. **HA-side templates/automations** publish each view's payload to Inkcast's
   MQTT topics — this is where the now-playing priority (Plex before the
   Shield's cast player), follow-the-active-player, and exclusions now live.
   **Without this, the panels render idle placeholders.**

**Do NOT** add follow/priority/exclusion or any "which HA entity" logic back into
Inkcast — it all belongs in the HA templates that produce the pushed payloads
(a "follow players allowlist" config entity was built once and reverted; the
priority-ordered source picker was likewise dropped in the cutover). The
now-playing "wrong player" symptom (a panel showing a speaker's last track
instead of the Shield) is **resolved by the pivot**: once HA pushes each panel's
now-playing payload, HA fully decides what each panel shows.

**HA view-switching automations (already correct, HA-side):**
`automation.inky_impression_now_playing_view` (Kitchen Counter →
`select.inky_impression_7_3_view`, triggers off `media_player.family_room_shield_6`)
and `automation.inky_phat_now_playing_view` (Office Desk → `select.inky_phat_view`,
triggers off the office/downstairs players). They pick *when* to show Now Playing;
under the pivot they must ALSO publish *what* to show (the data topics below).
⚠️ These (and any other automation) can no longer reference
`binary_sensor.inkcast_server_music_playing` — **it was deleted in the pivot**.
Re-point any such trigger to the HA-side `media_player` state directly (e.g.
`{{ is_state('media_player.family_room_shield_6','playing') }}`), which is the
same value HA now computes to build the pushed `now_playing` payload.

## 🏗️ HA-SIDE WORK — the remaining half (BUILD THIS NEXT; app side is done)

**The panels render idle placeholders until HA publishes the data topics below.**
Inkcast no longer connects to HA — it only renders what HA pushes over MQTT. All
"which player / priority / exclusions / which weather entity / which calendars"
logic lives HERE now, in HA templates + automations. A prior agent has HA MCP
access and may build these; the maintainer confirmed **it is safe to restart the
`inkcast` TrueNAS app** at any time (MCP `truenas` `stop_app`/`start_app` on app
`inkcast`, `pull_policy: always`; or the Deploy pipeline section below).

### Topic base + device ids

Base topic `inkcast/<device-id>`. Default seed ids: **`inky-phat`** (mono pHAT)
and **`inky-impression`** (e6 Impression). The real deploy may set
`INKCAST_DEVICES_FILE` with different ids — confirm the live ids from the HA
device page (each display's Image entity) or the retained `inkcast/+/image`
topics before hard-coding them in automations.

### Payload contracts (retained JSON; parsers in `viewDataPayloads.ts` — defensive)

**`inkcast/<id>/now_playing/set`** — `{ title, artist?, album?, isPlaying, artwork? }`
- `title` (string), `artist`/`album` (string, optional) — Inkcast strips emoji/♫
  and hides an empty/"—" artist. If BOTH title and artist are empty → the idle
  "Nothing playing" placeholder renders.
- `isPlaying` (boolean) — must be literally `true` for the playing state.
- `artwork` (string, optional) — a URL Inkcast fetches with a **plain GET, no
  auth header, no base URL**. ⚠️ It MUST be absolute and fetchable by the Inkcast
  container. HA's `entity_picture` is a *relative* proxy path with the auth token
  already in the query string, so publish `<ha_base_url> ~ entity_picture` (the
  container-reachable HA URL + the relative path). Music Assistant often exposes
  an absolute art URL directly. A bad/unreachable URL just renders without art.

**`inkcast/<id>/weather/set`** — `{ temperature, condition? }`
- `temperature` (number, raw) — Inkcast rounds and appends `°`. No numeric
  temperature → the weather line is omitted (plain clock).
- `condition` (string, optional) — an HA weather condition CODE (`sunny`,
  `partlycloudy`, `rainy`, `snowy`, `lightning-rainy`, …); Inkcast maps it to
  friendly text. `unknown`/`unavailable` → blank; an unmapped code passes through.

**`inkcast/<id>/agenda/set`** — `{ events: [{ start, summary, isAllDay? }] }`
- `start`: epoch ms (number) OR an ISO-8601 string. `summary`: string (empty →
  dropped). `isAllDay`: boolean (optional; all-day events stay visible their whole
  day). Push the WHOLE day's events across all the display's calendars — Inkcast
  sorts, drops already-started timed events, de-dupes, and slices to the panel
  budget (3 compact / 4 large).

### Example automations (adapt entity ids; publish per device)

Now-playing — priority order + exclusions live in the `select('is_state',...)`
list (first playing wins; omit e.g. bedtime speakers to exclude them):
```yaml
alias: Inkcast — push Office now_playing
triggers:
  - trigger: state
    entity_id: [media_player.office_speaker, media_player.downstairs]
actions:
  - variables:
      players: [media_player.office_speaker, media_player.downstairs]
      active: >
        {{ (players | select('is_state','playing') | list + players)
           | first }}
  - action: mqtt.publish
    data:
      topic: inkcast/inky-phat/now_playing/set
      retain: true
      payload: >
        {{ {
          'title':  state_attr(active,'media_title') or '',
          'artist': state_attr(active,'media_artist') or '',
          'album':  state_attr(active,'media_album_name') or '',
          'isPlaying': is_state(active,'playing'),
          'artwork': (state_attr(active,'entity_picture') and
                      ('http://homeassistant.local:8123' ~ state_attr(active,'entity_picture')))
                     or ''
        } | to_json }}
```
Weather (repeat the publish for each device id; trigger on the weather entity +
a 15-min `time_pattern`):
```yaml
  - action: mqtt.publish
    data:
      topic: inkcast/inky-phat/weather/set
      retain: true
      payload: >
        {{ {'temperature': state_attr('weather.pirateweather','temperature'),
            'condition': states('weather.pirateweather')} | to_json }}
```
Agenda (trigger on a 15-min `time_pattern` + HA start; flatten today's calendars):
```yaml
actions:
  - action: calendar.get_events
    target: { entity_id: [calendar.family, calendar.work] }
    data:
      start_date_time: "{{ today_at('00:00') }}"
      end_date_time: "{{ today_at('00:00') + timedelta(days=1) }}"
    response_variable: cal
  - variables:
      events: >
        {% set ns = namespace(items=[]) %}
        {% for entity, result in cal.items() %}
          {% for e in result.events %}
            {% set ns.items = ns.items + [{
              'start': e.start, 'summary': e.summary,
              'isAllDay': (e.start | length) == 10 }] %}
          {% endfor %}
        {% endfor %}
        {{ ns.items }}
  - action: mqtt.publish
    data:
      topic: inkcast/inky-phat/agenda/set
      retain: true
      payload: "{{ {'events': events} | to_json }}"
```
(`calendar.get_events` returns all-day events with a date-only `start` of length
10, e.g. `2026-07-05`; timed events carry a full ISO datetime — Inkcast's parser
accepts both.)

### Verifying the loop end to end

1. Restart `inkcast` (safe) so it re-subscribes; watch `docker logs` (filter
   `ix-inkcast`) for `push <id>` lines when a payload lands.
2. Publish a test now_playing payload (HA Developer Tools → Services →
   `mqtt.publish`, retain on) and confirm the panel repaints (the panel must be
   on a Now Playing view — the view select is still HA-automation-driven).
3. `curl` the image API or check the HA Image entity to see the render without
   waiting for the panel refresh.

## One-line status

Inkcast is **live on both panels** as a HA-agnostic MQTT renderer: GitHub
Actions builds to GHCR, TrueNAS runs it, BOTH Pis (pHAT + Impression 7.3") run
the `device-client/` receiver — the old on-device Immich fetcher is retired (unit
kept for rollback). Now-playing / weather / agenda are **pushed by HA over MQTT**
(HA decides which player, weather entity, and calendars); the photo frame does
recency-weighted, face-safe, query-able Immich photos — all knobs editable from
the HA device page. **Until the HA-side templates publish the data topics
(pivot TODO #3), the now-playing/weather/agenda views render idle placeholders.**

## ⭐ Next steps (start here — prioritized)

1. ~~Build the HA-side data-push templates (pivot TODO #3).~~ **DONE + verified
   2026-07-05** (see the top ✅ section). **Remaining real-life verification:**
   now-playing with *actual* playback (Plex/YouTube on the Shield, MA in the
   office — idle placeholder + weather + agenda-render are already confirmed);
   confirm real agenda populates once the calendars leave `unavailable`; the
   view-switching automations (retrigger off the HA-side player, not the removed
   "Music playing" sensor), Photo Frame
   Next/Previous buttons, the Query entity
   ("green shirt"-style Immich smart search), Color/B&W +
   Brightness/Saturation knobs on the Impression, and how the
   neutral-protected dither looks on real photos (it kills colour speckle
   on text; confirm it doesn't flatten photo grays).
2. ~~**Hostnames, not IPs, for the Pis** (maintainer ask).~~ **DONE 2026-07-05**
   — both resolve by `.octen` name (bare name works too): **`inky-phat.octen`
   → `192.168.101.177`** (IoT VLAN — the old `10.1.0.32` LAN address is stale)
   and **`inky-spectra.octen` → `192.168.101.200`** (IoT VLAN, `ssh -J
   root@storeman.octen`). Docs now use the names; the `device-client/` scripts
   already used `pi@<host>` placeholders (no hardcoded IPs). `storeman.octen`
   → `<nas-ip>`, `homeassistant.octen` → `10.1.0.4`.
3. **[docs/future-work.md](future-work.md)** — maintainer-deferred ideas:
   photo year/date overlay on the Photo Frame, richer weather (icons,
   condition backgrounds, forecast view), UniFi-Protect-presence-driven
   photo people, collapsing the now-playing designs into one.
4. **Optional:** web config UI (Jotai/RTK noted), TLS 8883, progress text on
   the Dashboard (NO animated progress bars — e-ink).

## Settled by the maintainer (do not re-litigate)

- **Track title first, above the artist, biggest+bold**; hide an empty/"—"
  artist line (`decisions/2026-07-02-title-above-artist.md`). **Editorial was
  removed 2026-07-05** (maintainer's call); Poster stays as a selectable view,
  but both displays' view-switch automations now select Now Playing (Dashboard).
- **Face crop shifts, never zooms** — maximal cover window steered to keep
  faces in frame; letterbox when impossible
  (`decisions/2026-07-02-face-crop-shifts-never-zooms.md`).
- **No server-side idle logic — HA automations drive the View select,
  immediately** (`decisions/2026-07-02-view-switching-via-ha-automations.md`,
  supersedes the same-day idle-fallback decision). The signal now lives HA-side
  (the server's "Music playing" sensor was removed in the pivot).
- **Dither: Floyd-Steinberg preferred on BOTH panels** (A/B'd on glass);
  keep all six algorithms in the select. Per-device choice persists via
  retained MQTT.
- **Now-playing / weather / agenda are pushed by HA over MQTT**; Inkcast never
  reads HA (`decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md`,
  supersedes "now-playing reads HA `media_player`" + "agenda pulls from HA").
- **Images publish to GHCR via GitHub Actions**, not homelab Gitea.
- **English view names** double as MQTT/API payloads and HA options.
- **Fonts committed to the repo**; Atkinson Hyperlegible + DejaVu fallback.
- All prior locked decisions in [decisions/README.md](decisions/README.md).

## Deploy pipeline (how to ship a change)

1. Commit to `master`, push to GitHub (`origin`; push is authorized).
2. Actions: typecheck + tests (67) → `ghcr.io/sawtaytoes/inkcast:latest`.
3. Bounce the TrueNAS app `inkcast` (MCP `truenas` `stop_app`/`start_app`) —
   **safe to restart anytime** (maintainer-confirmed); `pull_policy: always` so
   it pulls the latest image. Env changes: `midclt call --job app.update
   inkcast '{"values": ...}'` on storeman (merge `envs` array; see git log
   of this session) or the UI.
4. Verify: `curl http://storeman.octen:8788/health`, `docker logs` (filter
   `ix-inkcast`), `/api/devices/<id>/image` (Bearer `INKCAST_API_TOKEN`).

Deploy-time env is infrastructure only (MQTT broker, Immich, render engine,
ports, `TZ`) — **no `HOME_ASSISTANT_*` vars anymore**. Player priority /
exclusions (the famous 12:45a Totoro incident: guest + kids bedroom speakers)
and weather/calendar selection are decided HA-side in the templates that publish
the data topics. Full env list: `.env.example`.

## Architecture (current)

```text
HA templates + automations (the ONLY thing that talks to HA — HA-side, not app):
    resolve which player / weather entity / calendars per display, then PUSH:
      inkcast/<id>/now_playing/set  {title, artist?, album?, isPlaying, artwork?}
      inkcast/<id>/weather/set      {temperature, condition?}
      inkcast/<id>/agenda/set       {events: [{start, summary, isAllDay?}]}
 └─ Inkcast subscribes → viewDataPayloads.ts parsers → viewDataStore (keyed by
    device id) → artworkFetch.ts inlines the pushed artwork URL → re-push if the
    affected view is showing. Inkcast NEVER connects to HA.
Immich (REST)
 └─ photoFrameAdapter: people (HA text) + smart-search query (HA text) →
    per-person UNION pool w/ fileCreatedAt (cached 6h) → recency-weighted
    random pick (half-life 365d, 15% floor) → preview JPEG + face boxes →
    face-STEERED maximal cover-crop or letterbox → panel PNG → push.
    20-deep per-device history ← Next/Previous photo buttons.
View switching: HA AUTOMATIONS drive the View select (no server-side idle
    logic — decisions/2026-07-02-view-switching-via-ha-automations.md). The
    "which player is playing" signal now lives HA-side too.
 ↓
pushController → renderService (Chromium; Satori alt) → dither pipeline
    (per-device: algorithm override, Color/B&W mode, brightness/saturation
    modulate, neutral-protection pass on >2-colour palettes: chroma ≤ 26
    quantizes black/white-only — the text-fringing fix) → retained MQTT
    inkcast/<id>/image → Pi receivers draw it
```

### MQTT topics (base `inkcast`, per device id)

- `<id>/image` (retained PNG) · `availability` (LWT + 60s heartbeat)
- **`<id>/now_playing/set` · `<id>/weather/set` · `<id>/agenda/set`** — the
  HA-pushed view data (retained; HA is the publisher, Inkcast the subscriber)
- `<id>/view/set|view` — the retained view state also RESTORES the
  selection on server restart (used to silently reset to the default)
- `<id>/refresh/set` · `<id>/last_render`
- `<id>/photo_people/set|photo_people` · `<id>/photo_query/set|photo_query`
- `<id>/photo_next/set` · `<id>/photo_previous/set`
- `<id>/dither/set|dither` · `<id>/colour_mode/set|colour_mode` (e6 only)
- `<id>/brightness/set|brightness` · `<id>/saturation/set|saturation`
  (retained state topics = persistence; defaults seeded 5s after boot)

### HA entities per device (MQTT discovery; config names prefixed by area)

Image (Screen) · Select (View: 2 now-playing [Dashboard, Poster] / Photo Frame / Clock /
Clock (Weather) / Clock (Agenda)) · Buttons (Refresh, Photo Frame:
Next/Previous photo) · Config: Display: Dither, Display: Color mode (e6 only,
Color|Black & White), Display: Brightness %, Display: Saturation %,
Photo Frame: People, Photo Frame: Query, Clock: Timezone (text),
Clock: Time format (12/24-hour), Clock: Date style (Long/Numeric) · Sensor
(Last render). The `Display:`/`Photo Frame:`/`Clock:` prefixes are deliberate —
HA has no config sub-groups, names are the grouping. **The "Weather: Entity" and
"Agenda: Calendars" config entities were removed** in the pivot (Inkcast no
longer reads any HA entity).

Plus one server-wide "Inkcast Server" device: the Clock global-default knobs
(Timezone, Time format, Date style) + the Photo Frame global-default knobs
(Rotation minutes, Recency half-life days, Format, Quality). **The "Music
playing" binary sensor was removed** — what's playing is HA's own knowledge now
(it computes the pushed payload).

### Views (`packages/views/src/`)

- `NowPlayingDashboard` — TITLE first (bold anchor), artist (hidden when
  empty/"—"), album; `fitFontSize` shrink-to-fit (≥62%) before ellipsis,
  artist/album cap below the fitted title so hierarchy never inverts;
  compact ≤200px: no banner, body optically high, bold small text,
  `Th-02` / `12:45a` footer. The maintainer's favorite.
- `NowPlayingPoster` — untested on glass, kept as a selectable view
  (`NowPlayingEditorial` was removed 2026-07-05).
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
- Receivers: pHAT `pi@inky-phat.octen` (IoT VLAN `192.168.101.177`), Impression
  `pi@inky-spectra.octen` (IoT VLAN `192.168.101.200`, `-J root@storeman.octen`);
  both resolve by `.octen` name. Both run `inkcast-receiver.service` with a
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
