# MQTT topics unify flat under `castkit/<id>/…`; fleet migration is gated on all devices being online

- **Status:** Accepted
- **Date:** 2026-07-07
- **Type:** Architecture / Operations
- **Supersedes:** —
- **Superseded by:** —

## Decision

All devices — image mode and browser mode — address as **`castkit/<id>/…`**,
flat. NOT `castkit/inkcast/<id>` or per-mode base topics: device class is a
capability matrix (who renders, touch, colour depth), not an identity, and a
device that blurs the line (M5Paper: image + touch) or changes mode must not
require a topic migration. Mode shows up naturally in which topics exist
(`image` vs `url`/`connected`) and in discovery metadata.

The existing e-ink fleet stays on the old `inkcast/<id>/…` retained topics
until **the maintainer confirms every inkcast device is connected** (two
screens are being rewired; PoE ports are limited). Then a one-shot migration
runs: republish discovery + retained state under `castkit/`, clear all
retained `inkcast/#` with empty payloads (ghost-entity prevention), update
the HA automations and device-client drop-ins. New browser devices start on
`castkit/` immediately.

## Context

Renaming retained-topic namespaces on a live fleet risks ghost HA entities
and blank panels; devices being physically offline during the move would
leave them unable to pick up the new retained image topics.

## Why

Uniform addressing keeps HA automations and future tooling simple; gating the
migration keeps the deployed e-ink fleet safe.

## Evidence

> "Since some screens kinda fade the line, it sounds like the right approach
> is to get everything on `castkit/` topics. I'm gonna connect the other two
> e-ink screens here so they can be adjusted as well. […] I'll tell you when
> all inkcast devices are connected."

— maintainer, this chat (2026-07-07)
