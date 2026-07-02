/**
 * In-memory per-device USER configuration, edited from Home Assistant via the
 * MQTT config entities (e.g. the "Photo Frame People" text). Persistence is
 * the retained MQTT state topic itself: the server publishes each value
 * retained and restores it from the broker on boot, so there is no config
 * file to mount.
 */
export type DeviceConfigStore = {
  getPhotoPeople: (deviceId: string) => string
  setPhotoPeople: (params: {
    deviceId: string
    peopleText: string
  }) => void
}

export const createDeviceConfigStore =
  (): DeviceConfigStore => {
    const photoPeopleByDeviceId = new Map<string, string>()

    return {
      getPhotoPeople: (deviceId) =>
        photoPeopleByDeviceId.get(deviceId) ?? "",
      setPhotoPeople: ({ deviceId, peopleText }) => {
        photoPeopleByDeviceId.set(deviceId, peopleText)
      },
    }
  }
