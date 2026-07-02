/**
 * The data a now-playing view renders. Produced by the HA media_player adapter
 * (see docs/decisions/2026-07-01-now-playing-reads-ha-media-player.md) and read
 * at render time; `undefined` in the store means "no data yet" and the view
 * falls back to its idle placeholder.
 */
export type NowPlayingData = {
  artist: string
  title: string
  isPlaying: boolean
  /** HA `entity_picture` path (album art / Plex poster), if the player has one. */
  artworkPath?: string
  /** The artwork fetched + inlined for the render engines. */
  artworkDataUri?: string
}

/**
 * In-memory latest-value store for view data, keyed by the upstream entity id.
 * Adapters write into it as events arrive; the render path reads from it, so a
 * view switch or manual refresh always renders the freshest known data without
 * waiting for the next upstream event.
 */
export type ViewDataStore = {
  getNowPlaying: (
    entityId: string,
  ) => NowPlayingData | undefined
  setNowPlaying: (params: {
    entityId: string
    data: NowPlayingData
  }) => void
}

export const createViewDataStore = (): ViewDataStore => {
  const nowPlayingByEntityId = new Map<
    string,
    NowPlayingData
  >()

  return {
    getNowPlaying: (entityId) =>
      nowPlayingByEntityId.get(entityId),
    setNowPlaying: ({ entityId, data }) => {
      nowPlayingByEntityId.set(entityId, data)
    },
  }
}
