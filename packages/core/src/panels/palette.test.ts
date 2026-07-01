import { describe, expect, test } from "vitest"
import {
  blendE6Palette,
  E6_DEFAULT_PALETTE,
  E6_DEVICE_PALETTE,
  E6_VIVID_PALETTE,
} from "./palette.ts"

describe("blendE6Palette", () => {
  test("saturation 0 returns the vivid palette", () => {
    expect(blendE6Palette({ saturation: 0 })).toEqual(
      E6_VIVID_PALETTE,
    )
  })

  test("saturation 1 returns the device palette", () => {
    expect(blendE6Palette({ saturation: 1 })).toEqual(
      E6_DEVICE_PALETTE,
    )
  })

  test("saturation 0.5 averages the two palettes per channel", () => {
    const blended = blendE6Palette({ saturation: 0.5 })

    // black is identical in both palettes, so it is unchanged.
    expect(blended[0]).toEqual([0, 0, 0])
    // white: device [161,164,165] blended with vivid [255,255,255].
    expect(blended[1]).toEqual([208, 210, 210])
  })

  test("the fleet default is the 0.5 blend", () => {
    expect(E6_DEFAULT_PALETTE).toEqual(
      blendE6Palette({ saturation: 0.5 }),
    )
  })
})
