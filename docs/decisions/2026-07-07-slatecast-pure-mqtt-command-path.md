# Slatecast commands are pure MQTT through Home Assistant — no Music Assistant WebSocket, no token proxy

- **Status:** Accepted
- **Date:** 2026-07-07
- **Type:** Architecture
- **Supersedes:** the MA-WebSocket-primary + token-proxy recommendation in `home-displays/docs/custom-ma-controller-build-handoff.md` (external doc, marked superseded there)
- **Superseded by:** —

## Decision

Browser-mode touch commands flow: SPA → WebSocket → CastKit server →
**`castkit/<id>/command`** (QoS 1, not retained, single JSON topic:
`{action, value?, ts}` with actions `play_pause | next | previous | seek |
volume_set | volume_mute`) → an HA automation triggers on the topic and
`choose:`s on `payload_json.action` to call `media_player.*` services. The
device→player mapping lives entirely in that HA automation. Inbound data is
the same story reversed: HA templates an extended `now_playing` payload
(position/duration/`positionUpdatedAt`/volume) off the MA `media_player`
entity and pushes it retained; the client computes live position locally
(`position + (now − positionUpdatedAt)`), so nothing publishes per-second.
No MA or HA credentials exist anywhere in CastKit; there is no token proxy.

## Context

The original build handoff recommended Music Assistant's WebSocket API as the
primary interactive path (richer queue/position) behind a token-guarding
proxy, with MQTT only for ambient data. The maintainer overrode this: MQTT is
already proven with Inkcast, is the easiest HA integration, and keeps the
platform generic (any backend HA can automate, not just MA). This extends the
locked Inkcast decision `2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md`
to the interactive direction.

## Why

One integration surface (MQTT), one brain (HA), zero credentials in CastKit,
and the platform stays backend-agnostic. If HA-automation command latency
ever disappoints in practice, that measurement becomes the evidence for a
future decision — not a reason to pre-build the MA path.

## Evidence

> "We use MQTT instead of HTTP because it's easier to connect to Home
> Assistant, and it's already proven to work with Inkcast."

— maintainer, this chat (2026-07-07); command-path option "Pure MQTT"
explicitly selected over "MQTT + MA proxy".
