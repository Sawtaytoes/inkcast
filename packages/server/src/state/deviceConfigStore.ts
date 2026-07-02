import type { DitherAlgorithm } from "@inkcast/core/devices/device"

/**
 * A colour-rendering override for a colour panel: "bw" renders the view in
 * monochrome and dithers to black/white only (e-ink B&W mode on a colour
 * display). Absent = the panel's native colour mode.
 */
export type ColourModeOverride = "color" | "bw"

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
}

export const createDeviceConfigStore =
  (): DeviceConfigStore => {
    const photoPeopleByDeviceId = new Map<string, string>()
    const photoQueryByDeviceId = new Map<string, string>()
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
    }
  }
