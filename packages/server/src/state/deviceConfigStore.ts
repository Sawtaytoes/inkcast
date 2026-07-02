import type { DitherAlgorithm } from "@inkcast/core/devices/device"

/**
 * In-memory per-device USER configuration, edited from Home Assistant via the
 * MQTT config entities (the "Photo Frame People" text, the "Dither" select).
 * Persistence is the retained MQTT state topic itself: the server publishes
 * each value retained and restores it from the broker on boot, so there is
 * no config file to mount.
 */
export type DeviceConfigStore = {
  getPhotoPeople: (deviceId: string) => string
  setPhotoPeople: (params: {
    deviceId: string
    peopleText: string
  }) => void
  /** Override of the device's registered dither algorithm, if any. */
  getDitherAlgorithm: (
    deviceId: string,
  ) => DitherAlgorithm | undefined
  setDitherAlgorithm: (params: {
    deviceId: string
    algorithm: DitherAlgorithm
  }) => void
}

export const createDeviceConfigStore =
  (): DeviceConfigStore => {
    const photoPeopleByDeviceId = new Map<string, string>()
    const ditherByDeviceId = new Map<
      string,
      DitherAlgorithm
    >()

    return {
      getPhotoPeople: (deviceId) =>
        photoPeopleByDeviceId.get(deviceId) ?? "",
      setPhotoPeople: ({ deviceId, peopleText }) => {
        photoPeopleByDeviceId.set(deviceId, peopleText)
      },
      getDitherAlgorithm: (deviceId) =>
        ditherByDeviceId.get(deviceId),
      setDitherAlgorithm: ({ deviceId, algorithm }) => {
        ditherByDeviceId.set(deviceId, algorithm)
      },
    }
  }
