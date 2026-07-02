# Mat safe-area crop is a per-device MQTT/HA control, not device config

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Architecture
- **Supersedes:** —
- **Superseded by:** —

## Decision

A physical mat/frame overlaps the panel edges and hides content under it. The
compensating **safe-area crop inset** (top/right/bottom/left, in native px) is
exposed as **four Home Assistant `number` entities per device** ("Display: Crop
top/right/bottom/left"), tunable live over MQTT — the same retained-state knob
pattern as Brightness/Saturation/Dither. It is **not** a field in the device
config file.

**Text views render inside the inset** (blank margin under the mat); **photo
views bleed** to the panel edge (`getIsBleedView` — Photo Frame only). Insets
are clamped so the content box can't collapse. The retained MQTT state is the
persistence layer (no config file); values are seeded to 0.

## Context

The Impression's mat clipped the Now Playing text at all four edges. First
proposal was a `safeAreaInsets` field in the gitignored device config file.

## Why

Maintainer wants to tune cropping live and per-unit without redeploying: "These
are my devices, but someone else might have different ones. I might change the
frame, I might have two of these units where one isn't cropped." A config-file
value is static and shared-shaped; MQTT knobs are live, per-device, and
automatable, and keep the app portable for third-party self-hosters. Photos are
fine bleeding under a mat; text is not.

## Evidence

> "Add them as MQTT options. This way, if I need to mess with the cropping more,
> I can. These are my devices, but someone else might have different ones. I
> might change the frame, I might have two of these units where one isn't
> cropped. Then let's be smart here and make it configurable through MQTT."

— maintainer, 2026-07-02 (verified via preview: text insets with a clean
margin, nothing clipped)
