import type {
  AgendaData,
  NowPlayingData,
  QueueData,
  WeatherData,
} from "@castkit/shared/viewData/types"

/**
 * The view-data types moved to `@castkit/shared` (both client modes consume
 * the same HA-pushed contract); re-exported here so the server's historical
 * import paths keep working. `undefined` in the store means "no data yet" and
 * the view falls back to its idle placeholder. See
 * docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
 */
export type {
  AgendaData,
  AgendaEvent,
  NowPlayingData,
  QueueData,
  WeatherData,
} from "@castkit/shared/viewData/types"

/** The current photo-frame image for a device (already panel-sized). */
export type PhotoFrameData = {
  photoDataUri: string
  assetId: string
  fetchedAtMs: number
}

/**
 * In-memory latest-value store for view data — all keyed by device id, since
 * Home Assistant pushes each display its own now-playing / weather / agenda /
 * photo payload. The MQTT data-in handlers write into it as payloads arrive;
 * the render path reads from it, so a view switch or manual refresh always
 * renders the freshest known data without waiting for the next push.
 */
export type ViewDataStore = {
  getNowPlaying: (
    deviceId: string,
  ) => NowPlayingData | undefined
  setNowPlaying: (params: {
    deviceId: string
    data: NowPlayingData
  }) => void
  getPhotoFrame: (
    deviceId: string,
  ) => PhotoFrameData | undefined
  setPhotoFrame: (params: {
    deviceId: string
    data: PhotoFrameData | undefined
  }) => void
  getWeather: (deviceId: string) => WeatherData | undefined
  setWeather: (params: {
    deviceId: string
    data: WeatherData
  }) => void
  getAgenda: (deviceId: string) => AgendaData | undefined
  setAgenda: (params: {
    deviceId: string
    data: AgendaData
  }) => void
  getQueue: (deviceId: string) => QueueData | undefined
  setQueue: (params: {
    deviceId: string
    data: QueueData
  }) => void
}

export const createViewDataStore = (): ViewDataStore => {
  const nowPlayingByDeviceId = new Map<
    string,
    NowPlayingData
  >()
  const photoFrameByDeviceId = new Map<
    string,
    PhotoFrameData
  >()
  const weatherByDeviceId = new Map<string, WeatherData>()
  const agendaByDeviceId = new Map<string, AgendaData>()
  const queueByDeviceId = new Map<string, QueueData>()

  return {
    getNowPlaying: (deviceId) =>
      nowPlayingByDeviceId.get(deviceId),
    setNowPlaying: ({ deviceId, data }) => {
      nowPlayingByDeviceId.set(deviceId, data)
    },
    getPhotoFrame: (deviceId) =>
      photoFrameByDeviceId.get(deviceId),
    setPhotoFrame: ({ deviceId, data }) => {
      if (data === undefined) {
        photoFrameByDeviceId.delete(deviceId)
      } else {
        photoFrameByDeviceId.set(deviceId, data)
      }
    },
    getWeather: (deviceId) =>
      weatherByDeviceId.get(deviceId),
    setWeather: ({ deviceId, data }) => {
      weatherByDeviceId.set(deviceId, data)
    },
    getAgenda: (deviceId) => agendaByDeviceId.get(deviceId),
    setAgenda: ({ deviceId, data }) => {
      agendaByDeviceId.set(deviceId, data)
    },
    getQueue: (deviceId) => queueByDeviceId.get(deviceId),
    setQueue: ({ deviceId, data }) => {
      queueByDeviceId.set(deviceId, data)
    },
  }
}
