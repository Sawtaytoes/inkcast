# Follow-mode player exclusion is decided by the HA automation, not by Inkcast

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Architecture / Product behavior
- **Supersedes:** [2026-07-02-global-config-lives-in-ha-entities.md](2026-07-02-global-config-lives-in-ha-entities.md)
- **Superseded by:** —

## Decision

Which `media_player` entities count as follow candidates — and which are
ignored (the always-on guest-bedroom bedtime speaker and the like) — is now a
Home Assistant **automation** concern. Inkcast no longer has a follow-exclusion
setting of any kind. Removed:

- the **"Follow: Excluded players"** MQTT text entity and its discovery message,
- the `inkcast/config/follow_exclude/{set,state}` topics,
- the `globalConfigStore` (its only field was the exclusion list),
- the server-side follow-candidate filter + IDLE-retraction machinery in the
  now-playing adapter.

Follow mode now follows the most-recently-active player across the configured
`HOME_ASSISTANT_FOLLOW_PLATFORMS`, full stop. The **"Music playing"** binary
sensor still reports whether the followed player is actually playing; it just no
longer subtracts a server-side exclusion list first — the automation decides
what should drive the panels.

Per-device HA config knobs (Photo Frame people/query, display adjustments, mat
crop) are **unaffected** — they remain Home Assistant entities. What changes is
that the "Inkcast Server" global device no longer carries any *editable* config;
it exposes only the read-only "Music playing" sensor.

## Context

This continues the same-day move of all view/follow *policy* into HA automations
(see [view switching via HA automations](2026-07-02-view-switching-via-ha-automations.md)).
The exclusion list was the last piece of behaviour policy still living inside the
server. With view switching already automation-driven, an automation that keys
off the bedtime speaker is the natural, visible place to exclude it — and it
removes a config surface that only ever held one value.

The superseded decision established that server-wide *settings* live in HA
entities; its sole concrete instance (Follow: Excluded players) is being removed,
so that decision no longer has anything to stand on. Per-device knobs, which it
also mentioned, survive here.

## Why

All follow/idle policy belongs in Home Assistant where it is automatable and
visible; the server should render what it is told and expose the raw signals,
not encode household rules like "ignore the bedtime speaker."

## Evidence

> "Also, I noticed in Inkcast, this config option could be in the automation
> instead. It'd make more sense there. I'll ask another agent to handle that,
> you remove it as an env var / setting here."

— maintainer, 2026-07-02 (re: the "Follow: Excluded players" config entity)
