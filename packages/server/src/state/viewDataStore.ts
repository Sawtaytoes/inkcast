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

/** One calendar event on the agenda view, as pulled from Home Assistant. */
export type AgendaEvent = {
  /**
   * Event start, epoch ms. Stored numeric (not pre-formatted) so the registry
   * formats the time per panel size and re-filters "upcoming" on each minute
   * tick without a refetch.
   */
  startMs: number
  summary: string
  /** All-day events carry a date but no wall-clock time. */
  isAllDay: boolean
}

/**
 * Today's calendar agenda for the agenda-bearing clock view — the full day's
 * events sorted ascending by start. The registry filters to upcoming and slices
 * to the panel's event budget at render time.
 */
export type AgendaData = {
  events: readonly AgendaEvent[]
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
  getAgenda: (deviceId: string) => AgendaData | undefined
  setAgenda: (params: {
    deviceId: string
    data: AgendaData
  }) => void
}

export const createViewDataStore = (): ViewDataStore => {
  const nowPlayingByEntityId = new Map<
    string,
    NowPlayingData
  >()
  const photoFrameByDeviceId = new Map<
    string,
    PhotoFrameData
  >()
  const weatherHolder = new Map<"current", WeatherData>()
  const agendaByDeviceId = new Map<string, AgendaData>()

  return {
    getNowPlaying: (entityId) =>
      nowPlayingByEntityId.get(entityId),
    setNowPlaying: ({ entityId, data }) => {
      nowPlayingByEntityId.set(entityId, data)
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
    getAgenda: (deviceId) => agendaByDeviceId.get(deviceId),
    setAgenda: ({ deviceId, data }) => {
      agendaByDeviceId.set(deviceId, data)
    },
  }
}
