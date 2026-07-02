import type { DeviceMetadata } from "@inkcast/core/devices/device"
import type { DitherAdjustments } from "@inkcast/core/pipeline/dither"
import { ditherToPanel } from "@inkcast/core/pipeline/dither"
import type { ReactElement } from "react"
import sharp from "sharp"
import type { RenderEngine } from "./engine.ts"

/**
 * A physical mat/frame overlaps the panel edges and hides whatever is under
 * it. `SafeAreaInset` pushes a text view inward by this many *native* pixels
 * per edge so nothing important lands under the mat; the freed margin renders
 * white. Photo views pass no inset and bleed to the panel edge instead.
 */
export type SafeAreaInset = {
  top: number
  right: number
  bottom: number
  left: number
}

const NO_INSET: SafeAreaInset = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

/** Clamp the insets so the content box never collapses below 1×1 native px. */
const clampInset = ({
  inset,
  width,
  height,
}: {
  inset: SafeAreaInset
  width: number
  height: number
}): SafeAreaInset => {
  const left = Math.max(0, Math.min(inset.left, width - 1))
  const right = Math.max(
    0,
    Math.min(inset.right, width - 1 - left),
  )
  const top = Math.max(0, Math.min(inset.top, height - 1))
  const bottom = Math.max(
    0,
    Math.min(inset.bottom, height - 1 - top),
  )
  return { top, right, bottom, left }
}

/**
 * Resolve a device + requested inset into the safe (clamped) inset and the
 * content box the view must be laid out in. The view element MUST be built at
 * `contentWidth × contentHeight` (not the full panel) so its text reflows and
 * sizes to what stays visible under the mat — the caller uses this to build
 * the element, and `renderDeviceImage` uses the same result to render + place
 * it. Same inputs → same box, so the two never drift.
 */
export const resolveSafeArea = ({
  width,
  height,
  safeAreaInset,
}: {
  width: number
  height: number
  safeAreaInset?: SafeAreaInset
}) => {
  const inset = clampInset({
    inset: safeAreaInset ?? NO_INSET,
    width,
    height,
  })
  const hasInset =
    inset.top > 0 ||
    inset.right > 0 ||
    inset.bottom > 0 ||
    inset.left > 0

  return {
    inset,
    hasInset,
    contentWidth: width - inset.left - inset.right,
    contentHeight: height - inset.top - inset.bottom,
  }
}

/**
 * The core server primitive: turn a view + a device into the exact panel-ready
 * PNG that device draws. Composes the two Phase-0 halves — render the view
 * supersampled with the given engine, then dither it to the device's palette
 * using that device's registered profile (algorithm, supersample, rotation).
 * Optional `adjustments` (brightness/saturation, 1 = neutral) pass through to
 * the dither pipeline so the server can expose them as Home Assistant knobs.
 *
 * When `safeAreaInset` is set the view is laid out in the smaller safe box
 * (so its text reflows/sizes to what stays visible) and composited onto a
 * full-size white canvas at the inset offset before dithering.
 *
 * The engine is passed in (not created here) so the caller reuses one browser
 * across many renders instead of paying the launch cost per image.
 */
export const renderDeviceImage = async ({
  engine,
  element,
  device,
  adjustments,
  safeAreaInset,
}: {
  engine: RenderEngine
  element: ReactElement
  device: DeviceMetadata
  adjustments?: DitherAdjustments
  safeAreaInset?: SafeAreaInset
}): Promise<Buffer> => {
  const supersampleFactor =
    device.ditherProfile.supersampleFactor
  const { inset, hasInset, contentWidth, contentHeight } =
    resolveSafeArea({
      width: device.width,
      height: device.height,
      safeAreaInset,
    })

  const supersampledPng = await engine.render({
    element,
    width: hasInset ? contentWidth : device.width,
    height: hasInset ? contentHeight : device.height,
    supersampleFactor,
  })

  // Place the inset render on a full-size white canvas (both supersampled) so
  // the mat-covered margin is blank, then dither the whole panel uniformly.
  const framedPng = hasInset
    ? await sharp({
        create: {
          width: device.width * supersampleFactor,
          height: device.height * supersampleFactor,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite([
          {
            input: supersampledPng,
            left: inset.left * supersampleFactor,
            top: inset.top * supersampleFactor,
          },
        ])
        .png()
        .toBuffer()
    : supersampledPng

  return ditherToPanel({
    imageBuffer: framedPng,
    width: device.width,
    height: device.height,
    palette: device.palette,
    algorithm: device.ditherProfile.algorithm,
    rotation: device.rotation,
    adjustments,
  })
}
