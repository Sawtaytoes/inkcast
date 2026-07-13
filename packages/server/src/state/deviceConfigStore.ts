import type { DitherAlgorithm } from "@castkit/core/devices/device"

/**
 * A colour-rendering override for a colour panel: "bw" renders the view in
 * monochrome and dithers to black/white only (e-ink B&W mode on a colour
 * display). Absent = the panel's native colour mode.
 */
export type ColourModeOverride = "color" | "bw"

/**
 * Wire format for the full-colour (dithering-"off") photo frame. `jpeg`/`webp`
 * are lossy and ~30× smaller than a lossless RGB `png`; the panel re-dithers
 * anyway so lossy is fine. Global default + per-device override, both HA config
 * entities (never env vars). WebP is offered but crashes ARMv6 Pis on decode —
 * see docs/decisions/2026-07-03-photo-frame-jpeg-not-webp-on-armv6.md.
 */
export type PhotoFormat = "jpeg" | "webp" | "png"

/** A per-device photo-format override, or "auto" = inherit the global default. */
export type PhotoFormatSetting = PhotoFormat | "auto"

/**
 * Clock time format: 12-hour (`2:30 PM`) or 24-hour (`14:30`). Global default +
 * per-device override, both HA config entities. Time is rendered from Inkcast's
 * own clock — the format + timezone are the only clock settings; see
 * docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
 */
export type ClockTimeFormat = "12h" | "24h"

/** A per-device time-format override, or "auto" = inherit the global default. */
export type ClockTimeFormatSetting =
  | ClockTimeFormat
  | "auto"

/** Clock date style: `long` (`Sunday, July 5`) or `numeric` (`7/5/2026`). */
export type ClockDateStyle = "long" | "numeric"

/** A per-device date-style override, or "auto" = inherit the global default. */
export type ClockDateStyleSetting = ClockDateStyle | "auto"

/**
 * Clockwise degrees the server rotates a render before the panel draws it —
 * the physical mount orientation. Matches `DeviceMetadata.rotation`. Exposed as
 * a per-device HA config entity so a remounted/upside-down panel is corrected
 * live without editing the devices file.
 */
export type PanelRotation = 0 | 90 | 180 | 270

/**
 * The four edges of a device's safe-area crop inset, in native panel pixels.
 * A physical mat/frame overlaps the panel edges and hides content under it, so
 * text views render inside these insets (white margin); photo views ignore
 * them and bleed to the edge. Tunable live per device from Home Assistant.
 */
export type CropEdge = "top" | "right" | "bottom" | "left"

export const CROP_EDGES: readonly CropEdge[] = [
  "top",
  "right",
  "bottom",
  "left",
]

/**
 * In-memory per-device USER configuration, edited from Home Assistant via the
 * MQTT config entities (Photo Frame people/query, the Display selects and
 * sliders). Persistence is the retained MQTT state topic itself: the server
 * publishes each value retained and restores it from the broker on boot, so
 * there is no config file to mount.
 */
export type DeviceConfigStore = {
  getPhotoPeople: (deviceId: string) => string
  setPhotoPeople: (params: {
    deviceId: string
    peopleText: string
  }) => void
  /**
   * Per-device Photo Frame rotation interval, minutes. `undefined` (or 0, the
   * "inherit" sentinel HA sends) = fall back to the global default below.
   */
  getPhotoIntervalMinutes: (
    deviceId: string,
  ) => number | undefined
  setPhotoIntervalMinutes: (params: {
    deviceId: string
    minutes: number
  }) => void
  /** Global default Photo Frame rotation interval, minutes. */
  getGlobalPhotoIntervalMinutes: () => number | undefined
  setGlobalPhotoIntervalMinutes: (minutes: number) => void
  /**
   * Per-device Photo Frame recency half-life, days. `undefined` (or 0, the
   * "inherit" sentinel) = fall back to the global default below.
   */
  getPhotoRecencyHalfLifeDays: (
    deviceId: string,
  ) => number | undefined
  setPhotoRecencyHalfLifeDays: (params: {
    deviceId: string
    days: number
  }) => void
  /** Global default Photo Frame recency half-life, days. */
  getGlobalPhotoRecencyHalfLifeDays: () =>
    | number
    | undefined
  setGlobalPhotoRecencyHalfLifeDays: (days: number) => void
  /** Free-text Immich smart-search query for the Photo Frame ("" = off). */
  getPhotoQuery: (deviceId: string) => string
  setPhotoQuery: (params: {
    deviceId: string
    queryText: string
  }) => void
  /**
   * Per-device Photo Frame wire format. `undefined` or `"auto"` = inherit the
   * global default below.
   */
  getPhotoFormat: (
    deviceId: string,
  ) => PhotoFormatSetting | undefined
  setPhotoFormat: (params: {
    deviceId: string
    format: PhotoFormatSetting
  }) => void
  /** Global default Photo Frame wire format. */
  getGlobalPhotoFormat: () => PhotoFormat | undefined
  setGlobalPhotoFormat: (format: PhotoFormat) => void
  /**
   * Per-device Photo Frame lossy quality (1–100). `undefined` (or 0, the
   * "inherit" sentinel) = fall back to the global default below.
   */
  getPhotoQuality: (deviceId: string) => number | undefined
  setPhotoQuality: (params: {
    deviceId: string
    quality: number
  }) => void
  /** Global default Photo Frame lossy quality (1–100). */
  getGlobalPhotoQuality: () => number | undefined
  setGlobalPhotoQuality: (quality: number) => void
  /**
   * Per-device clock timezone (an IANA name, e.g. `America/Chicago`). Empty =
   * inherit the global default below; empty there too = the process `TZ`.
   */
  getClockTimezone: (deviceId: string) => string
  setClockTimezone: (params: {
    deviceId: string
    timezone: string
  }) => void
  /** Global default clock timezone (Inkcast Server device); empty = process `TZ`. */
  getGlobalClockTimezone: () => string
  setGlobalClockTimezone: (timezone: string) => void
  /**
   * Per-device clock time format. `undefined` or `"auto"` = inherit the global
   * default below.
   */
  getClockTimeFormat: (
    deviceId: string,
  ) => ClockTimeFormatSetting | undefined
  setClockTimeFormat: (params: {
    deviceId: string
    setting: ClockTimeFormatSetting
  }) => void
  /** Global default clock time format. */
  getGlobalClockTimeFormat: () =>
    | ClockTimeFormat
    | undefined
  setGlobalClockTimeFormat: (
    format: ClockTimeFormat,
  ) => void
  /**
   * Per-device clock date style. `undefined` or `"auto"` = inherit the global
   * default below.
   */
  getClockDateStyle: (
    deviceId: string,
  ) => ClockDateStyleSetting | undefined
  setClockDateStyle: (params: {
    deviceId: string
    setting: ClockDateStyleSetting
  }) => void
  /** Global default clock date style. */
  getGlobalClockDateStyle: () => ClockDateStyle | undefined
  setGlobalClockDateStyle: (style: ClockDateStyle) => void
  /** Override of the device's registered dither algorithm, if any. */
  getDitherAlgorithm: (
    deviceId: string,
  ) => DitherAlgorithm | undefined
  setDitherAlgorithm: (params: {
    deviceId: string
    algorithm: DitherAlgorithm
  }) => void
  /** Override of the device's registered mount rotation, if any. */
  getRotationOverride: (
    deviceId: string,
  ) => PanelRotation | undefined
  setRotationOverride: (params: {
    deviceId: string
    rotation: PanelRotation
  }) => void
  getColourModeOverride: (
    deviceId: string,
  ) => ColourModeOverride | undefined
  setColourModeOverride: (params: {
    deviceId: string
    colourMode: ColourModeOverride
  }) => void
  /** Pre-dither brightness boost, percent (100 = neutral). */
  getBrightnessPercent: (
    deviceId: string,
  ) => number | undefined
  setBrightnessPercent: (params: {
    deviceId: string
    percent: number
  }) => void
  /** Pre-dither saturation boost, percent (100 = neutral). */
  getSaturationPercent: (
    deviceId: string,
  ) => number | undefined
  setSaturationPercent: (params: {
    deviceId: string
    percent: number
  }) => void
  /** Safe-area crop inset for one edge, in native px (undefined = not set). */
  getCropInset: (params: {
    deviceId: string
    edge: CropEdge
  }) => number | undefined
  setCropInset: (params: {
    deviceId: string
    edge: CropEdge
    pixels: number
  }) => void
}

export const createDeviceConfigStore =
  (): DeviceConfigStore => {
    const photoPeopleByDeviceId = new Map<string, string>()
    const photoQueryByDeviceId = new Map<string, string>()
    const photoIntervalByDeviceId = new Map<
      string,
      number
    >()
    const globalPhotoIntervalHolder = new Map<
      "global",
      number
    >()
    const photoRecencyByDeviceId = new Map<string, number>()
    const globalPhotoRecencyHolder = new Map<
      "global",
      number
    >()
    const photoFormatByDeviceId = new Map<
      string,
      PhotoFormatSetting
    >()
    const globalPhotoFormatHolder = new Map<
      "global",
      PhotoFormat
    >()
    const photoQualityByDeviceId = new Map<string, number>()
    const globalPhotoQualityHolder = new Map<
      "global",
      number
    >()
    const clockTimezoneByDeviceId = new Map<
      string,
      string
    >()
    const globalClockTimezoneHolder = new Map<
      "global",
      string
    >()
    const clockTimeFormatByDeviceId = new Map<
      string,
      ClockTimeFormatSetting
    >()
    const globalClockTimeFormatHolder = new Map<
      "global",
      ClockTimeFormat
    >()
    const clockDateStyleByDeviceId = new Map<
      string,
      ClockDateStyleSetting
    >()
    const globalClockDateStyleHolder = new Map<
      "global",
      ClockDateStyle
    >()
    const ditherByDeviceId = new Map<
      string,
      DitherAlgorithm
    >()
    const rotationByDeviceId = new Map<
      string,
      PanelRotation
    >()
    const colourModeByDeviceId = new Map<
      string,
      ColourModeOverride
    >()
    const brightnessByDeviceId = new Map<string, number>()
    const saturationByDeviceId = new Map<string, number>()
    // Keyed by `${deviceId}:${edge}`.
    const cropInsetByDeviceEdge = new Map<string, number>()

    return {
      getPhotoPeople: (deviceId) =>
        photoPeopleByDeviceId.get(deviceId) ?? "",
      setPhotoPeople: ({ deviceId, peopleText }) => {
        photoPeopleByDeviceId.set(deviceId, peopleText)
      },
      getPhotoQuery: (deviceId) =>
        photoQueryByDeviceId.get(deviceId) ?? "",
      setPhotoQuery: ({ deviceId, queryText }) => {
        photoQueryByDeviceId.set(deviceId, queryText)
      },
      getPhotoFormat: (deviceId) =>
        photoFormatByDeviceId.get(deviceId),
      setPhotoFormat: ({ deviceId, format }) => {
        photoFormatByDeviceId.set(deviceId, format)
      },
      getGlobalPhotoFormat: () =>
        globalPhotoFormatHolder.get("global"),
      setGlobalPhotoFormat: (format) => {
        globalPhotoFormatHolder.set("global", format)
      },
      getPhotoQuality: (deviceId) =>
        photoQualityByDeviceId.get(deviceId),
      setPhotoQuality: ({ deviceId, quality }) => {
        photoQualityByDeviceId.set(deviceId, quality)
      },
      getGlobalPhotoQuality: () =>
        globalPhotoQualityHolder.get("global"),
      setGlobalPhotoQuality: (quality) => {
        globalPhotoQualityHolder.set("global", quality)
      },
      getClockTimezone: (deviceId) =>
        clockTimezoneByDeviceId.get(deviceId) ?? "",
      setClockTimezone: ({ deviceId, timezone }) => {
        clockTimezoneByDeviceId.set(deviceId, timezone)
      },
      getGlobalClockTimezone: () =>
        globalClockTimezoneHolder.get("global") ?? "",
      setGlobalClockTimezone: (timezone) => {
        globalClockTimezoneHolder.set("global", timezone)
      },
      getClockTimeFormat: (deviceId) =>
        clockTimeFormatByDeviceId.get(deviceId),
      setClockTimeFormat: ({ deviceId, setting }) => {
        clockTimeFormatByDeviceId.set(deviceId, setting)
      },
      getGlobalClockTimeFormat: () =>
        globalClockTimeFormatHolder.get("global"),
      setGlobalClockTimeFormat: (format) => {
        globalClockTimeFormatHolder.set("global", format)
      },
      getClockDateStyle: (deviceId) =>
        clockDateStyleByDeviceId.get(deviceId),
      setClockDateStyle: ({ deviceId, setting }) => {
        clockDateStyleByDeviceId.set(deviceId, setting)
      },
      getGlobalClockDateStyle: () =>
        globalClockDateStyleHolder.get("global"),
      setGlobalClockDateStyle: (style) => {
        globalClockDateStyleHolder.set("global", style)
      },
      getPhotoIntervalMinutes: (deviceId) =>
        photoIntervalByDeviceId.get(deviceId),
      setPhotoIntervalMinutes: ({ deviceId, minutes }) => {
        photoIntervalByDeviceId.set(deviceId, minutes)
      },
      getGlobalPhotoIntervalMinutes: () =>
        globalPhotoIntervalHolder.get("global"),
      setGlobalPhotoIntervalMinutes: (minutes) => {
        globalPhotoIntervalHolder.set("global", minutes)
      },
      getPhotoRecencyHalfLifeDays: (deviceId) =>
        photoRecencyByDeviceId.get(deviceId),
      setPhotoRecencyHalfLifeDays: ({ deviceId, days }) => {
        photoRecencyByDeviceId.set(deviceId, days)
      },
      getGlobalPhotoRecencyHalfLifeDays: () =>
        globalPhotoRecencyHolder.get("global"),
      setGlobalPhotoRecencyHalfLifeDays: (days) => {
        globalPhotoRecencyHolder.set("global", days)
      },
      getDitherAlgorithm: (deviceId) =>
        ditherByDeviceId.get(deviceId),
      setDitherAlgorithm: ({ deviceId, algorithm }) => {
        ditherByDeviceId.set(deviceId, algorithm)
      },
      getRotationOverride: (deviceId) =>
        rotationByDeviceId.get(deviceId),
      setRotationOverride: ({ deviceId, rotation }) => {
        rotationByDeviceId.set(deviceId, rotation)
      },
      getColourModeOverride: (deviceId) =>
        colourModeByDeviceId.get(deviceId),
      setColourModeOverride: ({ deviceId, colourMode }) => {
        colourModeByDeviceId.set(deviceId, colourMode)
      },
      getBrightnessPercent: (deviceId) =>
        brightnessByDeviceId.get(deviceId),
      setBrightnessPercent: ({ deviceId, percent }) => {
        brightnessByDeviceId.set(deviceId, percent)
      },
      getSaturationPercent: (deviceId) =>
        saturationByDeviceId.get(deviceId),
      setSaturationPercent: ({ deviceId, percent }) => {
        saturationByDeviceId.set(deviceId, percent)
      },
      getCropInset: ({ deviceId, edge }) =>
        cropInsetByDeviceEdge.get(`${deviceId}:${edge}`),
      setCropInset: ({ deviceId, edge, pixels }) => {
        cropInsetByDeviceEdge.set(
          `${deviceId}:${edge}`,
          pixels,
        )
      },
    }
  }
