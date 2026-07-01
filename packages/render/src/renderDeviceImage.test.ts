import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@inkcast/core/devices/device"
import { createElement } from "react"
import sharp from "sharp"
import { describe, expect, test } from "vitest"
import type { RenderEngine } from "./engine.ts"
import { renderDeviceImage } from "./renderDeviceImage.ts"

/**
 * A stub engine that returns a solid full-colour PNG at the supersampled size
 * the contract promises — so this test exercises the render→dither composition
 * without launching Chromium.
 */
const createStubEngine = (): RenderEngine => ({
  name: "chromium",
  render: ({ width, height, supersampleFactor }) =>
    sharp({
      create: {
        width: width * supersampleFactor,
        height: height * supersampleFactor,
        channels: 3,
        background: { r: 120, g: 60, b: 200 },
      },
    })
      .png()
      .toBuffer(),
})

const paletteKeys = (
  palette: readonly (readonly [number, number, number])[],
) =>
  new Set(
    palette.map(
      (colour) => `${colour[0]},${colour[1]},${colour[2]}`,
    ),
  )

describe("renderDeviceImage", () => {
  test.each([
    { device: PHAT_DEVICE },
    { device: IMPRESSION_DEVICE },
  ])("produces a native-sized, palette-conformant image for $device.id", async ({
    device,
  }) => {
    const output = await renderDeviceImage({
      engine: createStubEngine(),
      element: createElement("div"),
      device,
    })

    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true })

    // rotation 0 and 180 both preserve the native dimensions.
    expect(info.width).toBe(device.width)
    expect(info.height).toBe(device.height)

    const allowed = paletteKeys(device.palette)
    Array.from({
      length: info.width * info.height,
    }).forEach((_unused, pixelIndex) => {
      const byteOffset = pixelIndex * info.channels
      const key = `${data[byteOffset]},${data[byteOffset + 1]},${data[byteOffset + 2]}`
      expect(allowed.has(key)).toBe(true)
    })
  })
})
