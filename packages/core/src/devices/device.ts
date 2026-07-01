import type { Palette } from "../panels/palette.ts"
import {
  E6_DEFAULT_PALETTE,
  MONO_PALETTE,
} from "../panels/palette.ts"

/**
 * The colour capability of a panel. Drives which palette the dither pipeline
 * quantizes to and, downstream, which dithering algorithm reads best.
 */
export type ColourMode = "mono" | "e6"

/**
 * The dithering kernels the pipeline can apply. Error-diffusion kernels
 * (floyd-steinberg … sierra) come from `image-q`; `ordered` and `threshold`
 * are implemented in-house. The best choice differs by panel — mono vs E6 — so
 * it is a per-device knob, not one global setting.
 */
export type DitherAlgorithm =
  | "threshold"
  | "ordered"
  | "floyd-steinberg"
  | "atkinson"
  | "stucki"
  | "sierra"

/**
 * How a device's full-colour render is reduced to its panel's inks. Kept per
 * device so a mono pHAT and a 6-colour Impression can each use the algorithm +
 * supersample factor that looks best on that hardware (the Decision-2 bake-off
 * picks these).
 */
export type DitherProfile = {
  algorithm: DitherAlgorithm
  /**
   * Render at `supersampleFactor × native` then Lanczos-downscale to native
   * before dithering, baking in anti-aliasing. 1 = off.
   */
  supersampleFactor: number
}

/**
 * Everything the render server needs to turn a view into panel-ready bytes for
 * one physical display. Mirrors the "Device registry + metadata" section of the
 * build handoff.
 */
export type DeviceMetadata = {
  id: string
  label: string
  /** Lower-case colon-separated MAC; the device's stable identity on the wire. */
  mac: string
  width: number
  height: number
  colourMode: ColourMode
  palette: Palette
  /** Clockwise degrees applied before the panel draws (pHAT mounts USB-up = 180). */
  rotation: 0 | 90 | 180 | 270
  ditherProfile: DitherProfile
}

/**
 * The Inky pHAT on `inky-phat` (Zero W): 250×122 1-bit mono, mounted USB-up so
 * it renders rotated 180°. MAC + geometry from the home-displays HANDOFF.
 */
export const PHAT_DEVICE: DeviceMetadata = {
  id: "inky-phat",
  label: "Inky pHAT (kitchen)",
  mac: "b8:27:eb:00:3e:27",
  width: 250,
  height: 122,
  colourMode: "mono",
  palette: MONO_PALETTE,
  rotation: 180,
  ditherProfile: {
    algorithm: "atkinson",
    supersampleFactor: 4,
  },
}

/**
 * The Inky Impression 7.3" Spectra on `inky-spectra` (Zero W): 800×480 6-colour
 * E6. Palette is the 0.5 vivid/device blend the Spectra fetcher runs at.
 */
export const IMPRESSION_DEVICE: DeviceMetadata = {
  id: "inky-spectra",
  label: 'Inky Impression 7.3" (living room)',
  mac: "e6:73:00:00:00:01",
  width: 800,
  height: 480,
  colourMode: "e6",
  palette: E6_DEFAULT_PALETTE,
  rotation: 0,
  ditherProfile: {
    algorithm: "floyd-steinberg",
    supersampleFactor: 2,
  },
}

/** The two panels that exist today. The server is designed for N devices. */
export const SEED_DEVICES: readonly DeviceMetadata[] = [
  PHAT_DEVICE,
  IMPRESSION_DEVICE,
]
