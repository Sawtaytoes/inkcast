/**
 * The data a now-playing view renders. Pushed per device by Home Assistant over
 * MQTT (`inkcast/<device>/now_playing/set`) and parsed by
 * `mqtt/viewDataPayloads.ts`; read at render time. `undefined` in the store
 * means "no data yet" and the view falls back to its idle placeholder. See
 * docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
 */
export type NowPlayingData = {
  artist: string
  title: string
  album?: string
  isPlaying: boolean
  /** Artwork URL (album art / Plex poster) HA pushed, if any — Inkcast fetches it. */
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

/** Current-weather data for the weather-bearing clock view, pushed by HA. */
export type WeatherData = {
  /** e.g. "79°" */
  temperatureText: string
  /** e.g. "Partly cloudy" */
  conditionText: string
}

/** One calendar event on the agenda view, as pushed by Home Assistant. */
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
  }
}
