/**
 * In-memory per-browser-device Photo Frame source config (Immich people +
 * smart-search query), edited from Home Assistant via the MQTT text entities.
 * The `/d/<id>/photo` endpoint reads it to pick a photo. Persistence is the
 * retained MQTT state topic — the server restores it on boot — so there is no
 * config file to mount, exactly like the image-mode `deviceConfigStore`.
 *
 * The rotation INTERVAL is NOT here: it lives in BrowserDeviceSettings because
 * the SPA rotates client-side, so it rides the existing settings push.
 */
export type BrowserPhotoConfigStore = ReturnType<
  typeof createBrowserPhotoConfigStore
>

export const createBrowserPhotoConfigStore = () => {
  const peopleByDeviceId = new Map<string, string>()
  const queryByDeviceId = new Map<string, string>()

  return {
    getPhotoPeople: (deviceId: string) =>
      peopleByDeviceId.get(deviceId) ?? "",
    setPhotoPeople: ({
      deviceId,
      peopleText,
    }: {
      deviceId: string
      peopleText: string
    }) => {
      peopleByDeviceId.set(deviceId, peopleText)
    },
    getPhotoQuery: (deviceId: string) =>
      queryByDeviceId.get(deviceId) ?? "",
    setPhotoQuery: ({
      deviceId,
      queryText,
    }: {
      deviceId: string
      queryText: string
    }) => {
      queryByDeviceId.set(deviceId, queryText)
    },
  }
}
