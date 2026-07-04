import type { DitherAlgorithm } from "@inkcast/core/devices/device"

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
   * Per-device agenda calendars (comma-separated HA calendar entity ids) for the
   * `Clock (Agenda)` view. Empty = fall back to the global default below.
   */
  getAgendaCalendars: (deviceId: string) => string
  setAgendaCalendars: (params: {
    deviceId: string
    calendarsText: string
  }) => void
  /** Global default agenda calendars (Inkcast Server device), used when a device's own is empty. */
  getGlobalAgendaCalendars: () => string
  setGlobalAgendaCalendars: (calendarsText: string) => void
  /**
   * Per-device HA `weather` entity id feeding the `Clock (Weather)` view.
   * Empty = fall back to the global default below.
   */
  getWeatherEntity: (deviceId: string) => string
  setWeatherEntity: (params: {
    deviceId: string
    entityId: string
  }) => void
  /** Global default weather entity (Inkcast Server device); used when a device's own is empty. */
  getGlobalWeatherEntity: () => string
  setGlobalWeatherEntity: (entityId: string) => void
  /**
   * Per-device now-playing source: a comma-separated, priority-ordered list of
   * `media_player` entity ids feeding this device's now-playing view. The view
   * shows the first candidate that is playing (e.g. a Plex integration player
   * before the Shield's cast player, so Plex's poster wins yet YouTube on the
   * Shield still shows through the cast fallback). Empty = fall back to the
   * global default below, then to follow mode.
   */
  getNowPlayingSource: (deviceId: string) => string
  setNowPlayingSource: (params: {
    deviceId: string
    sourceText: string
  }) => void
  /** Global default now-playing source list (Inkcast Server device); used when a device's own is empty. */
  getGlobalNowPlayingSource: () => string
  setGlobalNowPlayingSource: (sourceText: string) => void
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
  /** Override of the device's registered dither algorithm, if any. */
  getDitherAlgorithm: (
    deviceId: string,
  ) => DitherAlgorithm | undefined
  setDitherAlgorithm: (params: {
    deviceId: string
    algorithm: DitherAlgorithm
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
    const agendaCalendarsByDeviceId = new Map<
      string,
      string
    >()
    const globalAgendaCalendarsHolder = new Map<
      "global",
      string
    >()
    const weatherEntityByDeviceId = new Map<
      string,
      string
    >()
    const globalWeatherEntityHolder = new Map<
      "global",
      string
    >()
    const nowPlayingSourceByDeviceId = new Map<
      string,
      string
    >()
    const globalNowPlayingSourceHolder = new Map<
      "global",
      string
    >()
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
    const ditherByDeviceId = new Map<
      string,
      DitherAlgorithm
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
      getAgendaCalendars: (deviceId) =>
        agendaCalendarsByDeviceId.get(deviceId) ?? "",
      setAgendaCalendars: ({ deviceId, calendarsText }) => {
        agendaCalendarsByDeviceId.set(
          deviceId,
          calendarsText,
        )
      },
      getGlobalAgendaCalendars: () =>
        globalAgendaCalendarsHolder.get("global") ?? "",
      setGlobalAgendaCalendars: (calendarsText) => {
        globalAgendaCalendarsHolder.set(
          "global",
          calendarsText,
        )
      },
      getWeatherEntity: (deviceId) =>
        weatherEntityByDeviceId.get(deviceId) ?? "",
      setWeatherEntity: ({ deviceId, entityId }) => {
        weatherEntityByDeviceId.set(deviceId, entityId)
      },
      getGlobalWeatherEntity: () =>
        globalWeatherEntityHolder.get("global") ?? "",
      setGlobalWeatherEntity: (entityId) => {
        globalWeatherEntityHolder.set("global", entityId)
      },
      getNowPlayingSource: (deviceId) =>
        nowPlayingSourceByDeviceId.get(deviceId) ?? "",
      setNowPlayingSource: ({ deviceId, sourceText }) => {
        nowPlayingSourceByDeviceId.set(deviceId, sourceText)
      },
      getGlobalNowPlayingSource: () =>
        globalNowPlayingSourceHolder.get("global") ?? "",
      setGlobalNowPlayingSource: (sourceText) => {
        globalNowPlayingSourceHolder.set(
          "global",
          sourceText,
        )
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
