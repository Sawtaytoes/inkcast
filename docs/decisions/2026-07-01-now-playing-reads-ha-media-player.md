# Now-playing data comes from Home Assistant `media_player`, not Music Assistant

- **Status:** Superseded
- **Date:** 2026-07-01
- **Type:** Architecture
- **Supersedes:** —
- **Superseded by:** [2026-07-04 Inkcast is a HA-agnostic renderer: HA pushes view data over MQTT; Inkcast never reads HA](2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md)

> **Superseded.** Now-playing data still originates from HA `media_player`, but
> Inkcast no longer *reads* it — HA computes the payload and *pushes* it to
> Inkcast over MQTT. Inkcast holds no HA connection. See the superseding record.

## Decision

The Phase-2 now-playing data adapter reads playback state from **Home
Assistant's `media_player` entities** over the HA WebSocket API — not from
Music Assistant's own WebSocket API.

## Context

The now-playing view rendered static placeholder data. Two candidate sources
were on the table: Music Assistant directly (as the retired
`ma_nowplaying_bridge.py` did) or HA's `media_player` entities (which proxy MA
players plus every other player HA knows about).

## Why

The maintainer wants Home Assistant to stay the single integration point for
household state; Inkcast already leans on HA for MQTT discovery and control.
Reading MA directly stays open as a possible future addition, not the default.

## Evidence

> "We might look at using the Music Assistant WS API in the future, but for
> now, let's try keeping as much in Home Assistant as possible."

— maintainer, chat `901a94bc-24c1-4de7-b3cd-e9e80b9ea9d9` (2026-07-01)
