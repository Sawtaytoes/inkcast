# Server-wide settings live in HA entities (an "Inkcast Server" MQTT device), not env vars

- **Status:** Superseded
- **Date:** 2026-07-02
- **Type:** Architecture
- **Supersedes:** —
- **Superseded by:** [2026-07-02-follow-exclusion-moves-to-ha-automation.md](2026-07-02-follow-exclusion-moves-to-ha-automation.md)

## Decision

User-tunable settings — global ones AND per-device ones — are exposed as
Home Assistant entities via MQTT discovery, persisted by their retained
state topics. A server-wide **"Inkcast Server"** device carries the global
knobs (first: `Follow: Excluded players`); per-panel knobs (idle view, idle
minutes, display adjustments, photo config) hang off each panel's device.
Env vars are reserved for install-level wiring (broker/HA/Immich URLs +
credentials, port, engine) — `HOME_ASSISTANT_FOLLOW_EXCLUDE_ENTITIES` and
`INKCAST_IDLE_MINUTES` were removed. Entity IDs referenced by behavior
(excluded players) belong in HA-editable config, not the environment.

## Context

The follow-exclusion list and idle timeout first landed as env vars, which
require editing the TrueNAS app config and a redeploy to change, are
invisible from HA, and can't be driven by automations.

## Why

In the maintainer's words — the point of using MQTT and Home Assistant is
to allow this sort of automation, and the config should be visible.

## Evidence

> "I wonder if we should expose *another* MQTT entity that's our Global
> Config entity for stuff like this? … I'd honestly like to get entities
> outta env vars and into a config, so MQTT config 'device' makes the most
> sense to me. … That way, you can also see your global config options."
> "`HOME_ASSISTANT_FOLLOW_EXCLUDE_ENTITIES` can go if we do that MQTT
> device for the config. `INKCAST_IDLE_MINUTES` can go away too." …
> "it might be good to define *which* view is the idle view. … You can even
> have a 'none' for idle if you wanna have Home Assistant always in control."

— maintainer, chat `4cb59eb7-5aea-4f0e-8404-f49dcd7a16e3` (2026-07-02)
