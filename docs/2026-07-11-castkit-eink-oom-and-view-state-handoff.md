# Handoff: castkit e-ink Photo Frame OOM (13.3" panels) + post-migration view state

**Date:** 2026-07-11
**Status:** ✅ RESOLVED 2026-07-11 (primary fix applied; see Resolution). One
optional code-hardening follow-up remains open (browser auto-relaunch).
**Follows:** [`fleet-topic-migration-inkcast-to-castkit.md`](fleet-topic-migration-inkcast-to-castkit.md)
(the `inkcast`→`castkit` fleet migration that introduced this regression).

## Resolution (2026-07-11)

Bumped the `castkit` TrueNAS app back to the retired inkcast app's limits —
**16 GB / 16 CPUs** — via `app.update` (`resources.limits.cpus=16`,
`resources.limits.memory=16384`). The container recreated with
`MemLimit=17179869184` (16 GB), `NanoCpus=16000000000`. Force-refreshed the two
13.3" panels + the kitchen; all four now render cleanly:

```
push eink-6e6697 (Photo Frame, 40633 bytes)
push eink-07769e (Photo Frame, 44203 bytes)
push eink-4da1be (Photo Frame, 44203 bytes)
push eink-a615f8 (Clock (Weather), 1193 bytes)
```

Peak memory during concurrent 13.3" renders ≈ 2.5 GiB / 16 GiB, **no new
`chrome-headless` cgroup OOM**, `OOMKilled=false`. The `image.eink_07769e_*` /
`eink-4da1be_*` timestamps advanced (were frozen at 17:33). Also re-set the
**kitchen (`eink-6e6697`) view to Photo Frame** — it had been stranded on "Now
Playing (Poster)" because its revert-to-idle trigger was missed during the
migration's discovery churn (both Shield players were idle).

**Still open (optional, low priority):** the secondary code hardening below —
make the Chromium engine relaunch a dead/OOM-killed browser instead of stranding
the fleet until a container restart. With 16 GB headroom this is now defence in
depth, not urgent.

---

## Original investigation (kept for the record)

## Symptom (as reported)

- The **Immich Photo Frame isn't rendering on the two large 13.3" panels**
  (`eink-07769e`, `eink-4da1be`) after the fleet migrated onto the `castkit`
  TrueNAS app.
- Only the **little mono pHAT** (`eink-a615f8`) looks correct. The kitchen 7.3"
  (`eink-6e6697`) and the two 13.3" panels looked wrong.
- Separately, some panels were on the **wrong view** — per the maintainer, that
  view change was made by a **different AI session**, not this migration. This
  doc treats the view state as a side note; the substantive bug is the OOM.

## Root cause — container OOM kills Chromium on large renders

The migration carried over the `castkit` app's **existing** resource limits
instead of the retired `inkcast` app's. The gap is large:

| | old `inkcast` app (worked) | `castkit` app (now) |
| --- | --- | --- |
| memory limit | **16384M (16 GB)** | **4096M (4 GB)** |
| cpus | 16 | 4 |

`castkit` renders with headless Chromium (`INKCAST_RENDER_ENGINE=chromium`). A
13.3" panel is **1200×1600 at ×2 supersample = 2400×3200 px**; two of them plus
the kitchen render blow past 4 GB, and the container cgroup OOM-kills the
Chromium process. Kernel log (host `dmesg`), castkit container cgroup
`24ca9585…`:

```
Memory cgroup out of memory: Killed process 3796829 (chrome-headless)
  total-vm:56466152kB, anon-rss:943932kB …
  oom_memcg=/docker/24ca9585…  task=chrome-headless
```

The engine keeps **one shared browser** launched once
(`packages/render/src/chromiumEngine.ts:81`, args already include
`--no-sandbox --disable-dev-shm-usage`, so `/dev/shm` is *not* the issue). When
the OOM killer takes that browser down, every subsequent render throws:

```
[inkcast] push failed for eink-6e6697 browser.newContext: Target page, context or browser has been closed
    at Object.render (packages/render/src/chromiumEngine.ts:92)
    at renderDeviceImage (packages/render/src/renderDeviceImage.ts:129)
    at Object.showPhotoFrame (packages/server/src/adapters/photoFrameAdapter.ts:217)
```

i.e. the crash cascades from the big Photo Frame render to the **whole fleet**
until the container restarts. The mono pHAT survives only because its render
(250×122) is tiny. `RestartCount=1`, container restarted 17:32 UTC — it has
already OOM-cycled once.

### State captured while documenting (2026-07-11 ~17:5x UTC)

| Panel | View | `image.*` last render | Render health |
| --- | --- | --- | --- |
| `eink-a615f8` pHAT (mono 250×122) | Clock (Weather) | live (~17:5x) | ✅ ok |
| `eink-6e6697` Kitchen (e6 800×480) | Now Playing (Poster) | 17:52 | ⚠️ intermittent |
| `eink-07769e` 13.3" (e6 1200×1600) | Photo Frame | **17:33 (stale)** | ❌ OOM-fails |
| `eink-4da1be` 13.3" (e6 1200×1600) | Photo Frame | **17:33 (stale)** | ❌ OOM-fails |

The two 13.3" images froze at 17:33 (one render right after the 17:32 restart,
then OOM on every retry) — that is the "Immich not working" the user sees.

## Recommended fix (not yet applied)

**Primary — restore the resource limits to match the retired inkcast app.**
Bump the `castkit` TrueNAS app to 16 GB / 16 CPUs (or at least enough headroom
for two concurrent 2400×3200 Chromium renders — 8 GB is likely sufficient, 16 GB
is the proven value):

```sh
ssh root@storeman.octen 'python3 - <<PY
import json, subprocess
cfg = json.loads(subprocess.check_output(["midclt","call","app.config","castkit"]))
res = cfg.setdefault("resources", {})   # confirm the exact key via app.config first
# TrueNAS custom-app resource limits live under the "resources" question;
# set CPUs=16 and memory=16384 (MB) to match the old inkcast app, then:
# midclt call -j app.update castkit {"values": {"resources": {...}}}
PY'
```

> The exact `values` key for CPU/RAM on this app template must be read from
> `midclt call app.config castkit` first (it was not exercised during the
> migration — only `envs` were). If the container template exposes
> `cpus`/`memory` limits, set them there; otherwise edit the rendered
> `deploy.resources.limits` and redeploy.

**Secondary hardening (code, follow-up PR in this repo):** make the Chromium
engine resilient to a dead browser — detect `browser.on('disconnected')` (or
catch the "Target … has been closed" error) and **relaunch** before the next
render, and/or **serialize** large renders / cap Chromium's memory so one panel
can't nuke the shared browser for the whole fleet. Today a single OOM strands
every device until the container restarts (`chromiumEngine.ts:81` launches once,
never relaunches).

**View state:** the wrong-view reports were a different AI's change, not this
bug. Correct idle mapping (no media playing) is pHAT→Clock (Weather), everything
else→Photo Frame; when kitchen media plays, `eink-6e6697`→Now Playing (Poster).
The per-display HA automations
(`automation.control_kitchen_counter_eink_screen`,
`automation.control_office_kevin_s_desk_eink_screen`) own view selection and
will re-assert on the next trigger.

## Verify after the fix

1. `docker stats ix-castkit-castkit-1` stays well under the new limit during a
   forced render of both 13.3" panels.
2. No new `Memory cgroup out of memory … chrome-headless` in host `dmesg`.
3. `docker logs ix-castkit-castkit-1` shows fresh
   `push eink-07769e (Photo Frame, …)` / `eink-4da1be` with no
   `browser.newContext … closed`.
4. `image.eink_07769e_*` / `image.eink_4da1be_*` `last_updated` advance; the
   physical panels redraw a photo.
