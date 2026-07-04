# The Clock (Agenda) view pulls calendar events from HA; it does not receive a push

- **Status:** Superseded
- **Date:** 2026-07-02
- **Type:** Architecture / Data flow
- **Supersedes:** —
- **Superseded by:** [2026-07-04 Inkcast is a HA-agnostic renderer: HA pushes view data over MQTT; Inkcast never reads HA](2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md)

> **Superseded.** The direction reverses: Inkcast no longer pulls calendar
> events from HA — HA *pushes* the agenda payload to Inkcast over MQTT, like
> every other view's data. See the superseding record.

## Decision

The new **`Clock (Agenda)`** view — a clock panel that also shows the day's
upcoming calendar events — gets its data the same way `Clock (Weather)` does:
**Inkcast pulls it from Home Assistant.** A per-device calendar adapter
(`packages/server/src/adapters/calendarAgendaAdapter.ts`) polls HA's REST
calendar endpoint (`GET /api/calendars/<entity>?start=&end=`) with the same
long-lived token the artwork fetch already uses, maps the events to the day's
agenda, stores them per device in the view-data store, and re-pushes a device
when its day changes. Home Assistant automations decide **when** a display
switches to the view; Inkcast only supplies the data and renders it.

The view is registered in `VIEW_NAMES` and `CLOCK_BEARING_VIEW_NAMES`, so it
appears in the HA View `select` via MQTT discovery and gets the per-minute
re-push (which also drops events the moment they start). Per-device calendars
are deployment config: `calendarEntityIds` in the devices file, or the
`HOME_ASSISTANT_CALENDAR_ENTITIES` env default.

## Context

The user wanted an imminent appointment to show itself on the e-ink displays
alongside time/date/weather. A calendar entity's *state* only exposes the single
next event, so the full day's agenda needs `calendar.get_events` (or the REST
endpoint) — not state streaming. Two data paths were possible: Inkcast pulls the
events itself, or an HA automation formats the agenda and pushes it over MQTT.

## Why

- **Mirrors the existing weather flow exactly** (adapter → view-data store →
  re-push), reusing the proven spine instead of inventing an inbound MQTT
  data channel (the only MQTT-subscribe path today is fixed per-device command
  routing).
- **Authenticated HA REST from Inkcast is already blessed** (`haArtwork.ts`).
- **Keeps HA template-free** — formatting the agenda in TypeScript is pure and
  unit-tested (`mapCalendarEventsToAgenda`), versus Jinja-templating a
  multi-event string in an automation, which `home-assistant/AGENTS.md`
  discourages.
- **Consistent with [2026-07-02-view-switching-via-ha-automations.md](2026-07-02-view-switching-via-ha-automations.md):**
  HA owns *when* to switch; Inkcast owns rendering. Per-device calendar mapping
  is deployment wiring (like `nowPlayingEntityId` / `HOME_ASSISTANT_WEATHER_ENTITY`),
  not a user-tunable runtime knob, so it lives in config, not an HA entity.

## Evidence

> "When I have an appointment coming up, the announcement automation gives me a
> message 30 min before. It'd be nice if we could display something on the eInk
> screen as well … show the time, date, temp/weather, and also the upcoming
> event(s) that day for a specific person."

— user request (2026-07-02). Behaviour split confirmed in the same thread: the
pHAT surfaces the next event **1 hour** before and reverts to `Clock (Weather)`
when it starts; the kitchen Impression shows today's schedule only while the
All-Kitchen occupancy area is occupied inside the pre-event window, then returns
to Photo Frame.
