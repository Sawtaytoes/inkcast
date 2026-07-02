# Future work (maintainer-requested, explicitly deferred)

Ideas the maintainer asked to document but NOT build yet. Check
[decisions/](decisions/README.md) before starting any of these.

## Photo Frame: photo year/date overlay (2026-07-02)

Show when the current photo was taken, "especially in the larger screen" —
the year (or full date) somewhere unobtrusive on the Photo Frame view. The
asset's `fileCreatedAt` already rides through the Immich pool entries
(`AssetPoolEntry.createdAtMs`), so it mostly needs a view treatment that
survives dithering on top of an arbitrary photo (corner chip/strip?).
Maintainer: "I don't wanna mess with that tonight. Document it as future
work."

## Weather presentation ideas (2026-07-02)

The first cut ("Clock (Weather)") shows temperature + condition text.
Maintainer brainstormed, in his words, a few ways it could grow:

1. **A weather icon** next to/instead of the condition text.
2. **Condition-driven background** — the view's backdrop represents rainy /
   sunny / etc.
3. **Temperature by itself or beside an icon** (partly done — text version).
4. **A forecast view** — a separate view HA automations could rotate in
   "every so often and goes away" (the View select is already automatable, so
   this is just a new view + an automation).

## UniFi Protect presence → Photo Frame people (2026-07-02)

"Figuring out who's home via UniFi Protect and making sure those folks are in
the list of photos." The building block shipped tonight: `Photo Frame:
People` / `Photo Frame: Query` are plain HA text entities, so an HA
automation can rewrite them from any presence signal (Protect face
detections, device_trackers, etc.) and the frame refreshes immediately.
Remaining work is HA-side: derive a who's-home list and template it into
`text.inky_impression_7_3_photo_frame_people`.

Related maintainer scenario, same mechanism: seasonal/scheduled queries —
"during St Patrick's Day, only find pictures of people in a 'green shirt',
and then have Home Assistant reset it back to my kids after. I could even
have it change from my kids to just any picture once the kids are in bed."

## Now Playing: collapse to one design? (2026-07-02)

Maintainer leaning toward keeping only the Dashboard design and renaming it
"Now Playing", but wants to test Editorial/Poster on the big panel first.
Keep all three until he decides (see
[decisions/2026-07-02-title-above-artist.md](decisions/2026-07-02-title-above-artist.md)).

## Earlier deferrals (from HANDOFF)

- Web config UI (Jotai or Redux-Toolkit noted for the stores).
- MQTT TLS on 8883.
- Progress text ("2:14 / 4:05") on the Dashboard — NO animated progress bars
  (e-ink refresh constraints).
