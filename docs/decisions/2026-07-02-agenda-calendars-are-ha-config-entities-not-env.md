# Agenda calendars are HA/MQTT config entities (global + per-device), never env vars

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Architecture
- **Supersedes:** —
- **Superseded by:** —

## Decision

Which calendars feed a display's `Clock (Agenda)` view is **user config exposed
as Home Assistant entities via MQTT discovery**, exactly like Photo Frame people,
dither, brightness, and the crop insets — **not** an environment variable and
**not** the devices file. It is settable at two levels:

- **Global default** — an `Agenda: Calendars` **text** entity on the
  **"Inkcast Server"** MQTT device (comma-separated HA calendar entity ids).
- **Per-screen override** — an `Agenda: Calendars` **text** entity on each
  display's device; when a display's own value is empty it falls back to the
  global default.

Persistence is the retained MQTT state topic (no config file, no redeploy to
change). The calendar adapter reads the resolved list from the config store at
poll time and refetches immediately when the value changes from HA.

Env vars remain only for install-level wiring (broker/HA/Immich URLs +
credentials, port, engine) and non-entity server tuning (e.g. the agenda poll
interval `INKCAST_CALENDAR_MINUTES`, like `INKCAST_PHOTO_MINUTES`).

## Context

The agenda view first shipped its calendar source as `HOME_ASSISTANT_CALENDAR_ENTITIES`
env + a `calendarEntityIds` field in the devices file. That repeats the mistake
the project already settled: entity ids referenced by behaviour must be
HA-editable, visible, and automatable — not buried in the environment where
changing them means editing the TrueNAS app config and redeploying.

## Why

- **Reinforces the established principle** in
  [2026-07-02-global-config-lives-in-ha-entities.md](2026-07-02-global-config-lives-in-ha-entities.md):
  user-tunable settings (global AND per-device) live in HA entities via MQTT,
  persisted by retained state; env vars are for install wiring only.
- **Visible + automatable + no redeploy:** the calendars appear on the device
  pages in HA, can be changed live, and can be driven by automations — the whole
  point of the MQTT/HA integration.
- **Two levels match how the maintainer thinks about it:** one household default,
  overridable per screen (e.g. a desk display showing only one person's calendar).

## Evidence

> "Stop making more env vars. I told you specifically that these things need to be
> part of the MQTT part of the integration. And even still, I could define them at
> the global level OR the individual screen level if I wanted. Document that
> decision, so we don't run into it again."

— maintainer, chat (2026-07-02)
