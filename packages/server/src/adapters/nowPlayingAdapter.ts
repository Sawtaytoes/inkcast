import {
  debounceTime,
  distinctUntilChanged,
  groupBy,
  map,
  mergeMap,
} from "rxjs"
import {
  type HaEntityState,
  observeHaEntityStates,
} from "../ha/haStates.ts"
import type {
  NowPlayingData,
  ViewDataStore,
} from "../state/viewDataStore.ts"

/** What the now-playing view shows when nothing has played on the entity. */
export const IDLE_NOW_PLAYING: NowPlayingData = {
  artist: "—",
  title: "Nothing playing",
  isPlaying: false,
}

const DEBOUNCE_MILLISECONDS = 1_000

const readStringAttribute = ({
  attributes,
  key,
}: {
  attributes: Record<string, unknown>
  key: string
}) => {
  const value = attributes[key]
  return typeof value === "string" ? value : ""
}

/**
 * Maps one HA `media_player` state to the now-playing view's data. A player
 * that has track metadata but isn't `playing` renders as "Last Played"
 * (`isPlaying: false`); a player with no metadata at all (idle/off/
 * unavailable) renders the idle placeholder.
 */
export const mapHaStateToNowPlaying = (
  entityState: HaEntityState,
): NowPlayingData => {
  const artist =
    readStringAttribute({
      attributes: entityState.attributes,
      key: "media_artist",
    }) ||
    readStringAttribute({
      attributes: entityState.attributes,
      key: "media_album_artist",
    })
  const title = readStringAttribute({
    attributes: entityState.attributes,
    key: "media_title",
  })

  if (!artist && !title) {
    return IDLE_NOW_PLAYING
  }

  return {
    artist: artist || "—",
    title: title || "—",
    isPlaying: entityState.state === "playing",
  }
}

/**
 * The Phase-2 now-playing data adapter: subscribes to the watched
 * `media_player` entities over the HA WebSocket, and whenever an entity's
 * now-playing data actually changes (deduped, then debounced so rapid
 * skip-through doesn't thrash the e-ink panels), writes it to the view-data
 * store and notifies the caller so affected devices re-render.
 */
export const createNowPlayingAdapter = ({
  haUrl,
  haToken,
  entityIds,
  viewDataStore,
  onNowPlayingChanged,
}: {
  haUrl: string
  haToken: string
  entityIds: readonly string[]
  viewDataStore: ViewDataStore
  onNowPlayingChanged: (entityId: string) => void
}) => {
  const subscription = observeHaEntityStates({
    url: haUrl,
    token: haToken,
    entityIds,
  })
    .pipe(
      map((entityState) => ({
        entityId: entityState.entityId,
        data: mapHaStateToNowPlaying(entityState),
      })),
      groupBy((update) => update.entityId),
      mergeMap((entityUpdates) =>
        entityUpdates.pipe(
          distinctUntilChanged(
            (previous, current) =>
              JSON.stringify(previous.data) ===
              JSON.stringify(current.data),
          ),
          debounceTime(DEBOUNCE_MILLISECONDS),
        ),
      ),
    )
    .subscribe(({ entityId, data }) => {
      viewDataStore.setNowPlaying({ entityId, data })
      onNowPlayingChanged(entityId)
    })

  return {
    close: () => {
      subscription.unsubscribe()
    },
  }
}
