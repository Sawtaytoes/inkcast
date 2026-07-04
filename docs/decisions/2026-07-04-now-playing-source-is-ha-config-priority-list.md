# The now-playing source is an HA config entity: a per-device priority-ordered media_player list

- **Status:** Accepted
- **Date:** 2026-07-04
- **Type:** Architecture / Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

Which `media_player` entity feeds a display's now-playing view is now **Home
Assistant config**, exposed as a **"Now Playing: Source"** text entity — a
**comma-separated, priority-ordered list** of entity ids — per display, with a
global default on the "Inkcast Server" device (the same global-default +
per-device shape as "Weather: Entity" / "Agenda: Calendars").

Resolution per display:

1. **First candidate in the list that is `playing` wins.** Order is priority —
   list the rich-metadata player first. Kitchen Counter is set to
   `media_player.plex_plex_for_android_tv_family_room_shield,
   media_player.family_room_shield_6` so Plex (title + poster) beats the Shield's
   cast player, while YouTube on the Shield still shows through the cast fallback.
2. Nothing playing → stay on the previous winner while it still has metadata
   (sticky "Last Played").
3. Otherwise the first candidate with any metadata, else the idle placeholder.

A display with a resolved list reads its own winner (keyed by its deviceId in
the view-data store); a display with an **empty** list falls back to **follow
mode** (unchanged). The old env `HOME_ASSISTANT_NOW_PLAYING_ENTITY` and the
devices-file `nowPlayingEntityId` survive only as a **seed default** for that
list before HA sets one — no behavior is removed.

The list is live-editable: on change the server re-pulls the HA snapshot (so a
newly-listed candidate reports its current state immediately) and repaints. An
HA automation can rewrite the text entity too, but the priority list usually
makes that unnecessary.

## Context

The Kitchen Counter eInk now-playing card wasn't updating for Shield playback.
Root cause: the source was chosen by **integration platform**
(`HOME_ASSISTANT_FOLLOW_PLATFORMS=music_assistant,plex`), and there was no
HA-side way to point a screen at a specific `media_player`. Live capture on the
Family Room Shield (2026-07-04) established what each entity exposes:

- **Plex integration player** (`plex_..._family_room_shield`): full title (e.g.
  "Zack Snyder's Justice League (2021)") **and poster**.
- **Cast player** (`family_room_shield_6`, platform `cast`): sees the native
  **YouTube** app with title + channel (as artist) + progress, but **no
  artwork**; for Plex it has the poster but a blank title.
- **androidtv_remote player** (`family_room_shield_2`): power-only (`on`/`off`),
  no media info — unusable for now-playing.

So no single entity is best for both apps, and the user's stated rule — "if Plex
is playing take that first, else use the Shield cast player for YouTube" — is a
priority list, not a single pin. This continues the project-wide move of all
view/source policy into HA config entities (see
[2026-07-03 user-tunable view settings are HA config entities](2026-07-03-user-tunable-view-settings-are-ha-config-entities.md),
[2026-07-02 follow-exclusion moves to the HA automation](2026-07-02-follow-exclusion-moves-to-ha-automation.md)).

## Why

- **No new env var.** A per-screen media_player source is exactly the kind of
  knob every other view already exposes via MQTT; adding a 4th follow platform
  or another env var would regress that direction.
- **Priority beats a single pin.** One entity can't carry both Plex's poster and
  YouTube's title; an ordered list picks the best available per moment.
- **Automatable + visible.** The source is editable live in HA and can be driven
  by automations, with the source of truth on the display's own device page.

## Known limitation (follow-up, not done here)

A display pinned to its own source no longer contributes to the global "Music
playing" binary sensor (same as the old single-pin path). So an automation that
switches a panel *to* the now-playing view off "Music playing" won't fire for a
Shield-only source (notably YouTube, which isn't a followed platform). Rounding
this out needs a **per-device now-playing-active signal** — deferred.

## Evidence

- Live HA capture of `media_player.family_room_shield_6` while the native
  YouTube app played: `app_name=YouTube`, `media_title` = full video title,
  `media_artist` = channel, `media_duration`/`media_position` present, and
  `entity_picture` / `media_image_url` / `entity_picture_local` all empty.
- Plex playback: `plex_..._family_room_shield` reported the movie title + a
  poster; the cast player reported the poster with a blank title.
- User quote: "If Plex is playing, we should take that first. If YouTube is
  playing, then we can use the Shield Cast media_player." (chat, 2026-07-04)
- User quote (on not adding another env var): "If we have FOLLOW_PLATFORMS,
  that['s] yet another env var that needs to be converted to MQTT. I would like
  to configure the shield as the entity via a Home Assistant automation if
  possible. I wanna hardcode as little as possible." (chat, 2026-07-04)
