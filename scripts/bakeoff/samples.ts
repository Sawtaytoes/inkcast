import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@inkcast/core/devices/device"
import type { Palette } from "@inkcast/core/panels/palette"
import { NowPlayingCard } from "@inkcast/views/NowPlayingCard"
import { createElement, type ReactElement } from "react"
import sharp from "sharp"

/**
 * Sample inputs for the bake-off. The handoff's Decision-2 test set is "a
 * photo (kids), a text/now-playing card, and a gradient (to expose banding)".
 * Offline we always have the card + a synthetic gradient; the photo is fetched
 * best-effort (skipped if there's no network) so the script never hard-fails.
 */

export type BakeoffPanel = {
  key: string
  label: string
  width: number
  height: number
  colourMode: "mono" | "e6"
  palette: Palette
}

/** The two real panels, derived from the core device registry. */
export const PANELS: readonly BakeoffPanel[] = [
  {
    key: "phat-mono",
    label: "pHAT 250×122 mono",
    width: PHAT_DEVICE.width,
    height: PHAT_DEVICE.height,
    colourMode: PHAT_DEVICE.colourMode,
    palette: PHAT_DEVICE.palette,
  },
  {
    key: "impression-e6",
    label: "Impression 800×480 E6",
    width: IMPRESSION_DEVICE.width,
    height: IMPRESSION_DEVICE.height,
    colourMode: IMPRESSION_DEVICE.colourMode,
    palette: IMPRESSION_DEVICE.palette,
  },
]

/** The now-playing card element for a given panel, with sample track data. */
export const buildNowPlayingElement = ({
  width,
  height,
  colourMode,
}: {
  width: number
  height: number
  colourMode: "mono" | "e6"
}): ReactElement =>
  createElement(NowPlayingCard, {
    width,
    height,
    colourMode,
    artist: "Twilight Force",
    title: "Dawn of the Dragonstar",
    isPlaying: true,
  })

/**
 * A full-colour RGB gradient sized to the panel (times supersample). Diagonal
 * hue sweep + vertical brightness ramp — banding here is what the dither
 * algorithms are judged on.
 */
export const buildGradient = async ({
  width,
  height,
}: {
  width: number
  height: number
}): Promise<Buffer> => {
  const channels = 3
  const pixelBuffer = Buffer.alloc(
    width * height * channels,
  )

  Array.from({ length: width * height }).forEach(
    (_unused, pixelIndex) => {
      const columnIndex = pixelIndex % width
      const rowIndex = Math.floor(pixelIndex / width)
      const horizontalRatio = columnIndex / (width - 1)
      const verticalRatio = rowIndex / (height - 1)
      const byteOffset = pixelIndex * channels

      pixelBuffer[byteOffset] = Math.round(
        255 * horizontalRatio,
      )
      pixelBuffer[byteOffset + 1] = Math.round(
        255 * verticalRatio,
      )
      pixelBuffer[byteOffset + 2] = Math.round(
        255 * (1 - horizontalRatio),
      )
    },
  )

  return sharp(pixelBuffer, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer()
}

/**
 * Fetch a real photo (Lorem Picsum, an Unsplash-backed CC0 source) sized to the
 * panel for the E6 colour-fidelity test. Returns null on any network failure so
 * the bake-off degrades gracefully to card + gradient only.
 */
export const tryFetchPhoto = async ({
  width,
  height,
}: {
  width: number
  height: number
}): Promise<Buffer | null> => {
  try {
    const response = await fetch(
      `https://picsum.photos/seed/inkcast/${width}/${height}`,
    )

    if (!response.ok) {
      return null
    }

    const arrayBuffer = await response.arrayBuffer()

    return sharp(Buffer.from(arrayBuffer)).png().toBuffer()
  } catch {
    return null
  }
}
