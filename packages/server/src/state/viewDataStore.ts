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

/**
 * In-memory latest-value store for view data — now-playing keyed by the
 * upstream entity id, photo-frame keyed by device id. Adapters write into it
 * as events arrive; the render path reads from it, so a view switch or manual
 * refresh always renders the freshest known data without waiting for the next
 * upstream event.
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
  }
}
