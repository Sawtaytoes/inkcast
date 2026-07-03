import type { DitherAlgorithm } from "@inkcast/core/devices/device"

/**
 * A colour-rendering override for a colour panel: "bw" renders the view in
 * monochrome and dithers to black/white only (e-ink B&W mode on a colour
 * display). Absent = the panel's native colour mode.
 */
export type ColourModeOverride = "color" | "bw"

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
  /** Free-text Immich smart-search query for the Photo Frame ("" = off). */
  getPhotoQuery: (deviceId: string) => string
  setPhotoQuery: (params: {
    deviceId: string
    queryText: string
  }) => void
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
