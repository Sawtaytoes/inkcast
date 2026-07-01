import sharp from "sharp"
import { describe, expect, test } from "vitest"
import type { DitherAlgorithm } from "../devices/device.ts"
import {
  E6_DEFAULT_PALETTE,
  MONO_PALETTE,
  type Palette,
} from "../panels/palette.ts"
import { ditherToPanel } from "./dither.ts"

/** A solid-colour source PNG at the given size. */
const buildSolidPng = ({
  width,
  height,
  colour,
}: {
  width: number
  height: number
  colour: [number, number, number]
}): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: colour[0],
        g: colour[1],
        b: colour[2],
      },
    },
  })
    .png()
    .toBuffer()

/** Every distinct RGB triple present in a raw RGB(A) buffer. */
const collectColours = ({
  rgbaBuffer,
  channels,
}: {
  rgbaBuffer: Buffer
  channels: number
}): Set<string> =>
  new Set(
    Array.from({
      length: rgbaBuffer.length / channels,
    }).map((_unused, pixelIndex) => {
      const byteOffset = pixelIndex * channels
      return `${rgbaBuffer[byteOffset]},${rgbaBuffer[byteOffset + 1]},${rgbaBuffer[byteOffset + 2]}`
    }),
  )

const paletteKeys = (palette: Palette): Set<string> =>
  new Set(
    palette.map(
      (colour) => `${colour[0]},${colour[1]},${colour[2]}`,
    ),
  )

const ALGORITHMS: DitherAlgorithm[] = [
  "threshold",
  "ordered",
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "sierra",
]

describe("ditherToPanel", () => {
  test("outputs the requested panel dimensions", async () => {
    const source = await buildSolidPng({
      width: 40,
      height: 20,
      colour: [120, 180, 60],
    })

    const output = await ditherToPanel({
      imageBuffer: source,
      width: 20,
      height: 10,
      palette: MONO_PALETTE,
      algorithm: "floyd-steinberg",
    })

    const metadata = await sharp(output).metadata()
    expect(metadata.width).toBe(20)
    expect(metadata.height).toBe(10)
  })

  test("every algorithm emits only palette colours (mono + E6)", async () => {
    const source = await buildSolidPng({
      width: 60,
      height: 40,
      colour: [130, 90, 200],
    })

    await Promise.all(
      (
        [
          { palette: MONO_PALETTE },
          { palette: E6_DEFAULT_PALETTE },
        ] as const
      ).flatMap(({ palette }) =>
        ALGORITHMS.map(async (algorithm) => {
          const output = await ditherToPanel({
            imageBuffer: source,
            width: 30,
            height: 20,
            palette,
            algorithm,
          })

          const { data, info } = await sharp(output)
            .raw()
            .toBuffer({ resolveWithObject: true })

          const colours = collectColours({
            rgbaBuffer: data,
            channels: info.channels,
          })
          const allowed = paletteKeys(palette)

          colours.forEach((colour) => {
            expect(allowed.has(colour)).toBe(true)
          })
        }),
      ),
    )
  })
})
