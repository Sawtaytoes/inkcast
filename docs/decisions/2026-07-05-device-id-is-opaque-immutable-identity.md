# Device `id` is an opaque, immutable identity — location/model live only in Home Assistant

- **Status:** Accepted
- **Date:** 2026-07-05
- **Type:** Naming / Identity
- **Supersedes:** —
- **Superseded by:** —

## Decision

A device's `id` (the config field that becomes the MQTT topic base `inkcast/<id>/…`,
the HA discovery `identifiers: inkcast_<id>`, and every entity `unique_id:
inkcast_<id>_…`) is an **opaque, meaningless, write-once slug** — e.g. `eink-07769e`.

- It **must not** encode location (`kitchen-counter`) or model/size (`impression-13.3`).
- **The Pi's OS hostname is set to the same `eink-<hex>` value** — one identity for the
  host (SSH/DNS) and the MQTT topic base. No separate hostname scheme to keep in sync.
- Human presentation — friendly name, area/room — is applied **in Home Assistant**
  (entity-registry name override + area) and, for the device on the network, via a
  **UniFi client alias**; never in the `id` and never in the MQTT topic hierarchy.
- Topic structure stays `inkcast/<opaque-id>/<facet>[/set]`; the per-facet sub-topics
  carry all the hierarchy we need. Do not add location/model levels to the topic tree.

Slug format: an `eink-` prefix (keeps topics namespaced/greppable and reads as "e-ink") +
a short random hex suffix. Random, not MAC-derived — swapping a Pi's SD card shouldn't mint
a new identity.

## Context

A screen's `id` is the second level of every one of its MQTT topics and is baked into
its HA device + entity identities. Naming it by location or model seemed friendly, but
it couples identity to placement: moving a screen to another room, or having a second
panel of the same model, forces an `id` change — and an `id` change is expensive
(see Why).

Home Assistant already separates these two layers cleanly: the discovery-provided name
is just the initial value, and a user's entity-registry name/area override persists
across rediscovery. In this deployment the entities already read `entity_id:
button.inky_impression_7_3_refresh` (identity) with `friendly_name: "Kitchen Counter
eInk Screen …"` (presentation) — the split exists; this decision makes it intentional.

## Why

- **An `id` change is a migration, not a rename.** It changes every `inkcast/<id>/…`
  topic, orphans the old retained image/state and the old retained
  `homeassistant/.../<old-id>_*/config` discovery messages (HA shows ghost devices until
  they're cleared), spawns brand-new HA entities (new `unique_id`s), and drops any HA
  friendly-name/area overrides and dashboard/automation references to the old entities.
- **Opaque ids make screens mobile for free.** With identity decoupled from location,
  relocating a panel touches nothing on the Inkcast/Pi side — you only re-point content
  (which players/calendars feed it) in HA and rename the friendly name/area. Identity,
  topics, and firmware config are untouched.
- **Consistent with the existing architecture:** HA is the brain and owns all
  policy/presentation ([2026-07-02-view-switching-via-ha-automations],
  [2026-07-02-global-config-lives-in-ha-entities]); the device is a dumb sink; the `id`
  is pure addressing.

## Evidence

> "What if instead I had the MQTT devices named with a randomly-generated name, and then
> I normalized that in the MQTT integration in Home Assistant like I do today? … if I
> choose to move the screen to another location, I [don't] have to modify anything in
> Inkcast."

— maintainer, eInk fleet-expansion planning chat, 2026-07-05. Chosen over location-based
slugs after pricing the cost of an `id` change.
