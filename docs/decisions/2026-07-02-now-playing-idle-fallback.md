# Now-playing views fall back to a per-device idle view when nothing plays

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

Each device has an `idleViewName`. When a device's SELECTED view is a
now-playing design and nothing has played for `INKCAST_IDLE_MINUTES`
(default 5), the server renders the idle view instead — without touching the
HA View select. Playback resuming snaps straight back. Idle defaults: the
small pHAT → **"Clock (Weather)"** (time/date/weather), the large
Impression → **"Photo Frame"** (Immich pictures). This is server-side — no HA
automation required. Additionally, follow mode supports
`HOME_ASSISTANT_FOLLOW_EXCLUDE_ENTITIES` so always-on players (the guest
bedroom bedtime-music speaker) can't hold the panels overnight.

## Context

At 12:45 AM the pHAT showed "My Neighbor Totoro - Bedtime Music …". Two
causes: (1) follow mode legitimately followed the kids' bedtime speaker in
the guest bedroom, and (2) the old follow reducer was sticky — it kept
showing "Last Played" forever, and no HA automation existed to switch views.
The compact layout doesn't even show the Last Played banner, so a stale card
was indistinguishable from live playback.

## Why

The maintainer expects panels to return to useful ambient content when
playback ends.

## Evidence

> "Figure out why the default state is a 'now playing' that doesn't exist
> instead of switching back to the time. … The idle state of the small screen
> is the time/date/weather. The idle state of the larger screen are the
> immich pictures."

— maintainer, chat `4cb59eb7-5aea-4f0e-8404-f49dcd7a16e3` (2026-07-02)
