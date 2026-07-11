# Handoff: 13.3" e-ink Photo Frames are blank (empty `photo_people` filter)

**Date:** 2026-07-11
**Status:** ✅ RESOLVED 2026-07-11 — people filters restored + self-heal
automation added (recurrence guard). Fully closed.

## Resolution (2026-07-11)

The user supplied the intended people lists and both frames now render real
photos (varying byte sizes + `photo frame <id>: asset <id>` log lines, not the
73910 B placeholder). Set via retained MQTT `castkit/<id>/photo_people/set`:

| Panel | photo_people |
| --- | --- |
| `eink-07769e` (13.3" #1) | `Xander, Darius, Marcus, Ashlee, Kevin` |
| `eink-4da1be` (13.3" #2) | `Xander, Darius, Marcus, Faye, Moe` |

(#1→Kevin+Ashlee's family, #2→Faye+Moe's family. If the physical frames are
swapped, swap the two lists.) Values are retained so they persist across
restarts. **Recurrence guard DONE:** `automation.self_heal_13_3_photo_frame_people`
re-asserts each frame's list if its `Photo Frame: People` text entity blanks
(`to: unknown` for 15 s) or on HA start — the same pattern the kitchen frame uses.
So a future retained-topic wipe now self-heals both 13.3" frames too.

---

### (original, now resolved) OPEN — root cause confirmed, fix needed the people list
**Panels affected:** `eink-07769e` + `eink-4da1be` (the two Inky Impression
13.3" portrait frames). The mono pHAT (`eink-a615f8`) and the kitchen 7.3"
(`eink-6e6697`) are fine.
**Related:** [`fleet-topic-migration-inkcast-to-castkit.md`](fleet-topic-migration-inkcast-to-castkit.md),
[`2026-07-11-castkit-eink-oom-and-view-state-handoff.md`](2026-07-11-castkit-eink-oom-and-view-state-handoff.md)

## Symptom

The two 13.3" frames show **no photo** — a static placeholder. Their render is
**frozen** (both `castkit/eink-07769e/last_render` and `…4da1be/last_render`
stuck at `2026-07-11T18:51:23Z`) while the kitchen frame cycles photos normally.

## Root cause (confirmed)

Both 13.3" panels have an **empty `photo_people`** knob (and no `photo_query`).
CastKit's Photo Frame adapter, given no people and no query, pushes the
**instructional placeholder** rather than a photo:

- `packages/server/src/adapters/photoFrameAdapter.ts:134` — `if (!peopleText && !queryText) { … }` → returns null → placeholder path (`~:210`).

Evidence:
- `castkit/eink-6e6697/photo_people` = `Xander, Darius, Marcus` (22 B) → renders,
  logs `photo frame eink-6e6697: asset <id> [letterbox …]` then `push … (Photo Frame, NN bytes)` with **varying** sizes (cycling real photos).
- `castkit/eink-07769e/photo_people` and `…4da1be/photo_people` = **empty** →
  **no** `photo frame …: asset` log line ever, and both push an **identical
  73910-byte** image (the same placeholder, not a photo).
- All other signals are healthy: `receiver/availability` = online, image topic
  populated (73910 B), `view` = Photo Frame, `colour_mode` = Color, memory fine
  (the earlier OOM is fixed — app is at 16 GB now).

## Why it regressed (my fault, from the migration)

The `inkcast → castkit` fleet migration cleared **all** retained `inkcast/#`
state, including each device's `photo_people` (the 13.3" panels had a **127-byte**
people list pre-migration — captured only as a byte count in the pre-clear scan,
not its contents). castkit re-seeded the knobs from the device registry, which
has **no** `photo_people` default → empty.

The kitchen frame *self-healed* because
`automation.control_kitchen_counter_eink_screen` has a **"People: Blanked"**
trigger that re-asserts `Xander, Darius, Marcus` whenever the people text goes
blank (+ on HA start). **The two 13.3" frames have no equivalent automation**, so
their filter stayed empty.

## The fix

Set the people filter on both 13.3" frames. Two equivalent levers (retained MQTT
is the source of truth; HA text entity is the friendly front-end):

- **MQTT** (retained, persists across restarts):
  - publish the people list to `castkit/eink-07769e/photo_people/set`
  - publish the people list to `castkit/eink-4da1be/photo_people/set`
  - broker `mqtts://mqtt.octen.dev:8883`, user `inkcast` (creds in the CastKit
    app env / root `.env` is not needed — pull from the app). Payload is a
    comma-separated list of Immich person names, e.g. `Xander, Darius, Marcus`.
- **HA**: the `Photo Frame: People` text entity for each device
  (`text.eink_07769e_…_photo_frame_people`, `…4da1be_…`).

**What list?** Unknown — the prior 127-byte value was destroyed by the migration
and isn't documented. It was longer than the kitchen's 3-kid list (127 B vs
22 B), so the big family frames likely showed a wider set (kids + parents, or the
whole family). **Confirm the intended people with the user**, or list Immich
people (`GET https://immich.octen.dev/api/people`, header `x-api-key: <IMMICH_API_TOKEN>`)
and pick. Names must match Immich people exactly (unknown names are logged and
ignored: `photoFrameAdapter.ts:146`).

After setting, force a redraw: publish `1` to `castkit/<id>/refresh/set` and
confirm the log shows `photo frame <id>: asset <id>` + a **varying** byte size
(a real photo, not the fixed 73910-byte placeholder).

## Prevent recurrence (recommended)

The retained MQTT value persists across restarts, but a future retained-topic
wipe would blank them again. Options:
1. Add a **self-heal automation** for the 13.3" frames mirroring the kitchen's
   "People: Blanked" pattern (re-assert the list on blank + on HA start). Most
   robust.
2. At minimum, **record the chosen people list** in `home-displays` fleet docs so
   it's recoverable.

## Also open (separate, cosmetic)

The office pHAT now-playing artwork still logs
`artwork fetch errored for /api/media_player_proxy/…office…<flash-host>… [Invalid URL]`.
The HA-script fix (default `ha_base_url`) is live, but the **retained**
`castkit/eink-a615f8/now_playing/set` still holds the old relative URL from
before the fix. It clears on the next office now-playing push (media change) or by
clearing that retained topic. Does not affect the 13.3" issue.

## Quick reference — current knob state (2026-07-11)

| Panel | view | photo_people | dither | rotation | render |
| --- | --- | --- | --- | --- | --- |
| `eink-a615f8` pHAT | Clock (Weather) | — | off | 180 | ✅ live |
| `eink-6e6697` kitchen 7.3" | Photo Frame | `Xander, Darius, Marcus` | off | 0 | ✅ cycling |
| `eink-07769e` 13.3" | Photo Frame | **(empty)** | off | 270 | ❌ placeholder |
| `eink-4da1be` 13.3" | Photo Frame | **(empty)** | off | 270 | ❌ placeholder |

(`dither: off` and `rotation: 270` on the 13.3" were set intentionally per the
user — panel does its own dithering; 270 is the portrait orientation. Verify 270
looks right once photos actually render.)
