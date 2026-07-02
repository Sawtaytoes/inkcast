import {
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  groupBy,
  map,
  merge,
  mergeMap,
  scan,
  share,
} from "rxjs"
import { fetchArtworkDataUri } from "../homeAssistant/haArtwork.ts"
import {
  type HomeAssistantEntityState,
  observeHomeAssistantEntityStates,
} from "../homeAssistant/homeAssistantStates.ts"
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

/**
 * The view-data-store key for the follow-the-active-player aggregate: the
 * most recently *playing* Music Assistant player wins, and devices with no
 * pinned `nowPlayingEntityId` read this key.
 */
export const FOLLOWED_NOW_PLAYING_KEY = "__followed__"

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
 * unavailable) renders the idle placeholder. For video players (Plex) the
 * series title stands in for the artist line, and `entity_picture` carries
 * the album art / poster.
 */
export const mapHomeAssistantStateToNowPlaying = (
  entityState: Pick<
    HomeAssistantEntityState,
    "state" | "attributes"
  >,
): NowPlayingData => {
  const artist =
    readStringAttribute({
      attributes: entityState.attributes,
      key: "media_artist",
    }) ||
    readStringAttribute({
      attributes: entityState.attributes,
      key: "media_album_artist",
    }) ||
    readStringAttribute({
      attributes: entityState.attributes,
      key: "media_series_title",
    })
  const title = readStringAttribute({
    attributes: entityState.attributes,
    key: "media_title",
  })

  if (!artist && !title) {
    return IDLE_NOW_PLAYING
  }

  const artworkPath = readStringAttribute({
    attributes: entityState.attributes,
    key: "entity_picture",
  })

  return {
    artist: artist || "—",
    title: title || "—",
    isPlaying: entityState.state === "playing",
    ...(artworkPath ? { artworkPath } : {}),
  }
}

type NowPlayingUpdate = {
  entityId: string
  data: NowPlayingData
  isFollowCandidate: boolean
}

type FollowAccumulator = {
  dataByEntityId: ReadonlyMap<string, NowPlayingData>
  currentEntityId: string | null
}

const EMPTY_FOLLOW_ACCUMULATOR: FollowAccumulator = {
  dataByEntityId: new Map(),
  currentEntityId: null,
}

/**
 * Picks which player the follow mode shows after an update: a player that is
 * actively playing always takes over; if the current player stops and another
 * is still playing, that one takes over; otherwise the current player stays
 * (sticky, so the panel keeps showing "Last Played" instead of blanking).
 */
export const reduceFollowedPlayer = (
  accumulator: FollowAccumulator,
  update: NowPlayingUpdate,
): FollowAccumulator => {
  const dataByEntityId = new Map(
    accumulator.dataByEntityId,
  ).set(update.entityId, update.data)

  if (update.data.isPlaying) {
    return {
      dataByEntityId,
      currentEntityId: update.entityId,
    }
  }

  const hasCurrentStopped =
    update.entityId === accumulator.currentEntityId
  const otherPlayingEntityId = Array.from(
    dataByEntityId.entries(),
  )
    .filter(
      ([entityId, data]) =>
        data.isPlaying && entityId !== update.entityId,
    )
    .map(([entityId]) => entityId)
    .at(0)

  if (hasCurrentStopped && otherPlayingEntityId) {
    return {
      dataByEntityId,
      currentEntityId: otherPlayingEntityId,
    }
  }

  return {
    dataByEntityId,
    // With nothing playing yet, adopt the first player that has metadata so
    // the panel shows "Last Played" rather than the idle placeholder.
    currentEntityId:
      accumulator.currentEntityId ??
      (update.data !== IDLE_NOW_PLAYING
        ? update.entityId
        : null),
  }
}

/**
 * The Phase-2 now-playing data adapter: streams `media_player` states over
 * the HA WebSocket, and whenever a pinned entity's data — or the
 * follow-the-active-player aggregate — actually changes (deduped, then
 * debounced so rapid skip-through doesn't thrash the e-ink panels), writes it
 * to the view-data store and notifies the caller so affected devices
 * re-render.
 */
export const createNowPlayingAdapter = ({
  homeAssistantUrl,
  homeAssistantToken,
  pinnedEntityIds,
  followedPlatforms,
  viewDataStore,
  onNowPlayingChanged,
}: {
  homeAssistantUrl: string
  homeAssistantToken: string
  pinnedEntityIds: readonly string[]
  followedPlatforms: readonly string[]
  viewDataStore: ViewDataStore
  onNowPlayingChanged: (entityKey: string) => void
}) => {
  const updates = observeHomeAssistantEntityStates({
    url: homeAssistantUrl,
    token: homeAssistantToken,
    entityIds: pinnedEntityIds,
    followedPlatforms,
  }).pipe(
    map(
      (entityState): NowPlayingUpdate => ({
        entityId: entityState.entityId,
        data: mapHomeAssistantStateToNowPlaying(
          entityState,
        ),
        isFollowCandidate: entityState.isFollowCandidate,
      }),
    ),
    share(),
  )

  const pinnedEntityIdSet = new Set(pinnedEntityIds)
  const pinnedUpdates = updates.pipe(
    filter((update) =>
      pinnedEntityIdSet.has(update.entityId),
    ),
    groupBy((update) => update.entityId),
    mergeMap((entityUpdates) =>
      entityUpdates.pipe(
        map((update) => ({
          entityKey: update.entityId,
          data: update.data,
        })),
        distinctUntilChanged(
          (previous, current) =>
            JSON.stringify(previous.data) ===
            JSON.stringify(current.data),
        ),
        debounceTime(DEBOUNCE_MILLISECONDS),
      ),
    ),
  )

  const followedUpdates = updates.pipe(
    filter((update) => update.isFollowCandidate),
    scan(reduceFollowedPlayer, EMPTY_FOLLOW_ACCUMULATOR),
    map((accumulator) => ({
      entityKey: FOLLOWED_NOW_PLAYING_KEY,
      data: accumulator.currentEntityId
        ? (accumulator.dataByEntityId.get(
            accumulator.currentEntityId,
          ) ?? IDLE_NOW_PLAYING)
        : IDLE_NOW_PLAYING,
    })),
    distinctUntilChanged(
      (previous, current) =>
        JSON.stringify(previous.data) ===
        JSON.stringify(current.data),
    ),
    debounceTime(DEBOUNCE_MILLISECONDS),
  )

  const subscription = merge(pinnedUpdates, followedUpdates)
    .pipe(
      // Resolve the artwork AFTER dedupe/debounce so each track change costs
      // at most one HA fetch (cached by picture path).
      concatMap(async ({ entityKey, data }) => ({
        entityKey,
        data: {
          ...data,
          artworkDataUri: data.artworkPath
            ? await fetchArtworkDataUri({
                homeAssistantUrl,
                homeAssistantToken,
                picturePath: data.artworkPath,
              })
            : undefined,
        },
      })),
    )
    .subscribe(({ entityKey, data }) => {
      viewDataStore.setNowPlaying({
        entityId: entityKey,
        data,
      })
      onNowPlayingChanged(entityKey)
    })

  return {
    close: () => {
      subscription.unsubscribe()
    },
  }
}
