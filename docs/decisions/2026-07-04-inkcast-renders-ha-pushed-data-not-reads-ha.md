# Inkcast is a HA-agnostic renderer: HA pushes view data over MQTT; Inkcast never reads HA

- **Status:** Accepted
- **Date:** 2026-07-04
- **Type:** Architecture
- **Supersedes:**
  [2026-07-01 Now-playing data comes from HA `media_player`, not Music Assistant](2026-07-01-now-playing-reads-ha-media-player.md),
  [2026-07-02 The Clock (Agenda) view pulls calendar events from HA](2026-07-02-clock-agenda-view-pulls-calendar-from-ha.md)
- **Superseded by:** —

## Decision

Inkcast is a **dumb, Home-Assistant-agnostic renderer**. Its only contract with
the rest of the house is **MQTT**: it receives view *data* on MQTT topics,
holds display *config* on MQTT topics, and renders images. It does **not** open
a connection to Home Assistant, does not know what a `media_player` /
`weather` / `calendar` entity is, and does not compute or expose any
"is-something-playing / idle-vs-active" state.

Concretely:

- **View data is PUSHED to Inkcast over MQTT, per device.** Home Assistant
  computes each view's payload and publishes it — e.g.
  `inkcast/<device>/now_playing/set` `{ title, artist, artwork, isPlaying }`,
  `inkcast/<device>/weather/set` `{ temperature, condition }`,
  `inkcast/<device>/agenda/set` `{ events: [...] }`. Inkcast subscribes and
  renders whatever it was handed.
- **All "what / when / which player / idle-or-active" logic lives in HA** — as
  templates and automations. The Plex-before-Shield-cast priority, the
  follow-the-active-player choice, the exclusion of a bedtime speaker, the
  decision to switch a panel's view: every bit of that is Home Assistant's,
  where it is automatable and visible.
- **Inkcast is removed from that loop.** Deleted from Inkcast: the Home
  Assistant WebSocket client, the `media_player` reading, the "followed
  platforms" registry lookup, the now-playing priority resolver, and the
  **"Music playing" binary sensor** (HA already knows whether music is playing;
  it never needed Inkcast to tell it).
- **Time is the one exception, and it proves the rule (see Why).** Inkcast
  renders the clock from its **own** system clock on its local minute ticker;
  HA does not push time. **Timezone and format are MQTT config entities**
  (like dither/crop), so HA can still say "this panel shows `America/Chicago`,
  `h:mm A`" without a per-minute data feed.
- **View templates + display config stay in Inkcast.** Decoupling removes
  Inkcast's data *fetching*, never its *rendering*. The layout/typography of
  every view, and the display-tuning config (dither, crop, brightness, photo
  format, timezone/format, which view is active), remain Inkcast's job over
  MQTT.

## Context

The `2026-07-01` decision (this author's) chose "Inkcast reads now-playing
directly from HA's `media_player` states over the HA WebSocket," and the agenda
and weather views followed the same read-from-HA pattern. The maintainer
questioned that coupling: Inkcast opening a HA WebSocket, knowing about
`media_player` entities and "followed platforms," computing which player is
active, and publishing a "Music playing" sensor is Inkcast doing Home
Assistant's job. A prototype that let HA *configure* a per-device priority list
of source players inside Inkcast made it worse, not better — it moved *config*
to MQTT (good) but put *priority-resolution logic* (which player wins) into the
renderer, which is more HA-domain knowledge, the wrong direction. That
prototype is abandoned in favour of this decision.

The maintainer's framing: "All Inkcast has to do is generate some images and
hold some settings configs over MQTT. It shouldn't be changing any screen
values nor controlling entities and how automations handle them. It needs to be
mostly agnostic to Home Assistant other than MQTT. On the other hand, Home
Assistant is doing a ton of heavy-lifting, and that's what I want."

## Why

- **One coupling, one protocol.** Inkcast ↔ house is MQTT and nothing else. No
  HA URL/token in Inkcast, no HA schema knowledge, no reconnect logic, no
  entity-registry lookups. Inkcast could render for a non-HA controller
  unchanged.
- **Heavy lifting belongs in HA**, where it is automatable, visible, and where
  the household already expresses all its other logic. Priority, exclusions,
  idle/active, and view-switching are policy — HA's domain.
- **The data-vs-ambient split for time.** The test is "can Inkcast know this
  value on its own?" It cannot know the current track, the weather, or the
  calendar — those are data and must be pushed. It *can* know the current
  time. Pushing per-minute time ticks would be fragile (a dropped MQTT message
  freezes the clock) and wasteful, and would discard the one value Inkcast
  legitimately owns. So time is rendered locally; only its *presentation*
  (timezone, format) is configured over MQTT — which is a settings concern, not
  a data feed.

## Consequences

- **Supersedes** the two prior decisions above (now-playing reads HA, agenda
  pulls from HA). HA — via a template/automation — now *publishes* each view's
  payload to Inkcast's MQTT topic rather than Inkcast reading HA, and the
  now-playing priority logic (Plex before the Shield's cast player, etc.) lives
  in an HA template. (The `home-displays` `ma-nowplaying-bridge` is still
  correctly gone; this is not that bridge — HA's own automations publish
  straight to Inkcast's MQTT, no separate service.)
- **The abandoned source-picker prototype** (never merged) is dropped; its
  priority logic relocates to an HA template.
- **HA gains template sensors / automations** to compute each view's MQTT
  payload. This is the "heavy lifting in HA" the maintainer wants.
- **Artwork:** HA pushes a poster/cover **URL**; Inkcast fetches it (it already
  has an artwork-fetch path) — lighter than pushing image bytes over MQTT.
- **The art-forward Editorial redesign + the emoji-strip both survive** — they
  are rendering concerns, unaffected by where the data comes from. (Emoji
  stripping may move to the HA template that builds the title, or stay as a
  render-time safety net — TBD during implementation.)

## Evidence

- Maintainer, 2026-07-04 (this chat): "Why the heck is Inkcast holding any
  information on the types of things Home Assistant is going to change the
  screen off? … all Inkcast has to do is generate some images and hold some
  settings configs over MQTT. … It needs to be mostly agnostic to Home
  Assistant other than MQTT."
- On time, the maintainer's own framing of the nuance: "Inkcast does know its
  own time, but you could theoretically wanna display a different
  time/timezone and use the existing Inkcast template." → resolved as: render
  locally, configure timezone/format over MQTT.
