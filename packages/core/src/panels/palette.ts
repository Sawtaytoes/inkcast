/**
 * Panel colour palettes for the display fleet.
 *
 * A palette is the fixed set of ink colours a given e-ink panel can physically
 * show. The dither pipeline quantizes a full-colour render down to one of these
 * so the on-screen preview matches what the hardware actually renders.
 *
 * The Spectra 6 (E6) values are lifted from Pimoroni's `inky` library
 * (`inky/inky_e673.py`) so a server-side render is colour-faithful to the panel
 * the on-device `inky.set_image(saturation=…)` path produces. See the
 * home-displays Spectra fetcher (`immich_impression_frame.py`) for prior art.
 */

/** A single ink colour as an 8-bit-per-channel RGB triple. */
export type RgbColour = readonly [number, number, number]

/** An ordered, fixed set of ink colours a panel can display. */
export type Palette = readonly RgbColour[]

/** 1-bit black/white — the Inky pHAT (250×122 mono). */
export const MONO_PALETTE: Palette = [
  [0, 0, 0],
  [255, 255, 255],
]

/**
 * Spectra 6 "vivid" reference palette (Pimoroni DESATURATED_PALETTE, indices
 * 0–5). Pure primaries — what the colours are *meant* to be, before the panel's
 * real-ink muting. Index 6 (a spare white) is intentionally dropped: E6 shows 6
 * inks.
 */
export const E6_VIVID_PALETTE: Palette = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 255, 0],
  [255, 0, 0],
  [0, 0, 255],
  [0, 255, 0],
]

/**
 * Spectra 6 "device-real" palette (Pimoroni SATURATED_PALETTE, indices 0–5).
 * The muted tones the physical E6 ink actually produces — closer to the honest
 * on-wall look — the honest, slightly muted result real E6 ink produces).
 */
export const E6_DEVICE_PALETTE: Palette = [
  [0, 0, 0],
  [161, 164, 165],
  [208, 190, 71],
  [156, 72, 75],
  [61, 59, 94],
  [58, 91, 70],
]

/**
 * Blend the vivid and device-real E6 palettes the same way Pimoroni's
 * `inky._palette_blend(saturation)` does: per channel,
 * `device × saturation + vivid × (1 − saturation)`.
 *
 * `saturation` 0 → fully vivid; 1 → fully device-real. The Spectra fetcher runs
 * at `IMMICH_SATURATION = 0.5`, so a 0.5 blend is the fleet default and makes
 * the preview match the panel.
 */
export const blendE6Palette = ({
  saturation,
}: {
  saturation: number
}): Palette =>
  E6_VIVID_PALETTE.map(
    (vividColour, colourIndex): RgbColour => {
      const deviceColour = E6_DEVICE_PALETTE[colourIndex]

      return [
        Math.round(
          deviceColour[0] * saturation +
            vividColour[0] * (1 - saturation),
        ),
        Math.round(
          deviceColour[1] * saturation +
            vividColour[1] * (1 - saturation),
        ),
        Math.round(
          deviceColour[2] * saturation +
            vividColour[2] * (1 - saturation),
        ),
      ]
    },
  )

/** The fleet-default E6 palette (0.5 blend), matching the Spectra fetcher. */
export const E6_DEFAULT_PALETTE: Palette = blendE6Palette({
  saturation: 0.5,
})
