/**
 * The data a now-playing view renders. Produced by the HA media_player adapter
 * (see docs/decisions/2026-07-01-now-playing-reads-ha-media-player.md) and read
 * at render time; `undefined` in the store means "no data yet" and the view
 * falls back to its idle placeholder.
 */
export type NowPlayingData = {
  artist: string
  title: string
  album?: string
  isPlaying: boolean
  /** HA `entity_picture` path (album art / Plex poster), if the player has one. */
  artworkPath?: string
  /** The artwork fetched + inlined for the render engines. */
  artworkDataUri?: string
}

/**
 * A now-playing store entry: the data plus, when nothing is playing, WHEN it
 * stopped — the idle-fallback timer reads this. `stoppedAtMs: 0` means "was
 * already idle when the server first saw it" (fall back immediately);
 * undefined means playback is live.
 */
export type NowPlayingEntry = {
  data: NowPlayingData
  stoppedAtMs?: number
}

/** The current photo-frame image for a device (already panel-sized). */
export type PhotoFrameData = {
  photoDataUri: string
  assetId: string
  fetchedAtMs: number
}

/** Current-weather data for the weather-bearing clock view. */
export type WeatherData = {
  /** e.g. "79°" */
  temperatureText: string
  /** e.g. "Partly cloudy" */
  conditionText: string
}

/**
 * In-memory latest-value store for view data — now-playing keyed by the
 * upstream entity id, photo-frame keyed by device id, weather global.
 * Adapters write into it as events arrive; the render path reads from it, so
 * a view switch or manual refresh always renders the freshest known data
 * without waiting for the next upstream event.
 */
export type ViewDataStore = {
  getNowPlaying: (
    entityId: string,
  ) => NowPlayingData | undefined
  getNowPlayingEntry: (
    entityId: string,
  ) => NowPlayingEntry | undefined
  setNowPlaying: (params: {
    entityId: string
    data: NowPlayingData
  }) => void
  getPhotoFrame: (
    deviceId: string,
  ) => PhotoFrameData | undefined
  setPhotoFrame: (params: {
    deviceId: string
    data: PhotoFrameData | undefined
  }) => void
  getWeather: () => WeatherData | undefined
  setWeather: (data: WeatherData) => void
}

export const createViewDataStore = (): ViewDataStore => {
  const nowPlayingByEntityId = new Map<
    string,
    NowPlayingEntry
  >()
  const photoFrameByDeviceId = new Map<
    string,
    PhotoFrameData
  >()
  const weatherHolder = new Map<"current", WeatherData>()

  return {
    getNowPlaying: (entityId) =>
      nowPlayingByEntityId.get(entityId)?.data,
    getNowPlayingEntry: (entityId) =>
      nowPlayingByEntityId.get(entityId),
    setNowPlaying: ({ entityId, data }) => {
      const previous = nowPlayingByEntityId.get(entityId)
      // Live playback clears the idle timer; a stop starts it; an entity
      // that was NEVER seen playing (server booted mid-idle) counts as
      // stopped since forever so idle fallback applies immediately.
      const stoppedAtMs = data.isPlaying
        ? undefined
        : previous
          ? previous.data.isPlaying
            ? Date.now()
            : (previous.stoppedAtMs ?? 0)
          : 0
      nowPlayingByEntityId.set(entityId, {
        data,
        stoppedAtMs,
      })
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
    getWeather: () => weatherHolder.get("current"),
    setWeather: (data) => {
      weatherHolder.set("current", data)
    },
  }
}
