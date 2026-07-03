# User-tunable view settings are HA/MQTT config entities (global + per-device), never env vars

- **Status:** Accepted
- **Date:** 2026-07-03
- **Type:** Architecture
- **Supersedes:** —
- **Superseded by:** —

## Decision

Every setting a user tunes to change what a display *shows* — not how the
install *connects* — is exposed as a Home Assistant entity via MQTT discovery,
settable at **two levels**: a **global default** on the **"Inkcast Server"**
device and a **per-screen override** on each display's device. Persistence is
the retained MQTT state topic (no config file, no redeploy). This is the same
rule already settled for the agenda calendars
([2026-07-02-agenda-calendars-are-ha-config-entities-not-env.md](2026-07-02-agenda-calendars-are-ha-config-entities-not-env.md));
this record generalizes it so we stop re-deciding it per setting.

Concretely, these moved out of env and onto HA entities (global + per-device):

- **Weather entity** (`Weather: Entity`, text) — the HA `weather` entity feeding
  the `Clock (Weather)` view. Was `HOME_ASSISTANT_WEATHER_ENTITY`.
- **Photo Frame rotation interval** (`Photo Frame: Rotation minutes`, number) —
  was `INKCAST_PHOTO_MINUTES`.
- **Photo Frame recency half-life** (`Photo Frame: Recency half-life days`,
  number) — was `INKCAST_PHOTO_RECENCY_HALF_LIFE_DAYS`.

### Conventions this establishes

- **Text overrides inherit on empty.** A per-device text entity left blank falls
  back to the global default (as with `Agenda: Calendars`).
- **Number overrides inherit on `0`.** An HA `number` entity always carries a
  value, so `0` is the per-device "inherit the global" sentinel (a 0-minute
  rotation / 0-day half-life is meaningless as a real value). Per-device number
  entities have `min: 0`; the global ones have `min: 1`.
- **Number entities are seeded** with their default retained state at boot so HA
  shows a concrete value instead of `unknown` (same reason as
  [2026-07-02-dither-off-token-not-none-ha-reserved.md](2026-07-02-dither-off-token-not-none-ha-reserved.md)).
- **Live, no reconnect.** The weather stream watches the *union* of every
  device's resolved weather entity, recomputed live; a config change re-pulls the
  HA snapshot so a just-pointed entity shows its value immediately.

### What stays in env

Only install-level wiring (broker / HA / Immich URLs + credentials, port,
render engine) and **server-internal cadences that are not display settings** —
e.g. `INKCAST_CALENDAR_MINUTES`, how often the agenda adapter re-polls HA. That
is a background poll rate, not a knob a user reaches for to change what a screen
shows, so it is not an HA entity.

## Context

The agenda-calendars record already moved one setting off env, but its
parenthetical cited `INKCAST_PHOTO_MINUTES` as an example of tuning that
"stays in env." The maintainer then flagged the weather entity, the photo
interval, and the photo recency half-life as the *same mistake*: entity ids and
display knobs referenced by behavior must be HA-editable, visible, and
automatable — not buried in the environment where changing them means editing
the TrueNAS app config and redeploying. This record supersedes that
parenthetical: photo timing is a display setting and belongs in HA.

## Why

- **Reinforces the settled principle:** user-tunable settings (global AND
  per-device) live in HA entities via MQTT, persisted by retained state; env
  vars are install wiring only.
- **Visible + automatable + no redeploy:** the knobs appear on the device pages
  in HA, change live, and can be driven by automations — the whole point of the
  MQTT/HA integration.
- **Two levels match how the maintainer thinks about it:** one household default,
  overridable per screen.
- **A general rule, not a per-setting one:** the next tunable display setting is
  an HA entity by default; env is the exception, reserved for wiring.

## Evidence

> "`HOME_ASSISTANT_WEATHER_ENTITY` shouldn't be an env var either. Remove all
> this crap that doesn't belong in the env.ts file and move them to MQTT
> settings instead. Including `INKCAST_PHOTO_MINUTES` and
> `INKCAST_PHOTO_RECENCY_HALF_LIFE_DAYS`. … I could define them at the global
> level OR the individual screen level if I wanted. Document this decision, so
> we don't make this mistake again in the future."

— maintainer, chat (2026-07-03)
