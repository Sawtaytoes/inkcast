import {
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  groupBy,
  map,
  merge,
  mergeMap,
  Subject,
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
  WeatherData,
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
  return typeof value === "string"
    ? stripDecorativeNotes(value)
    : ""
}

/**
 * YouTube titles (and YouTube Music) decorate text with ♫/♪ notes and emoji
 * (🐦 📚 …). The panel font (Atkinson Hyperlegible) has no emoji glyphs, so
 * they render as ▯ tofu boxes and waste width — strip both from every field.
 * Covers the emoji/pictographic, dingbat/symbol, regional-indicator, and
 * variation-selector/ZWJ ranges, then collapses the whitespace they leave.
 */
const stripDecorativeNotes = (value: string) =>
  value
    // Zero-width joiner + variation selectors glue emoji sequences together;
    // drop them (not to a space), each on its own so the character class can't
    // match a joined sequence.
    .replace(/\u{200D}/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    // Emoji/pictographs, dingbats & symbols, arrows, misc symbols, and bullets.
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2022}]/gu,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim()

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

  const album = readStringAttribute({
    attributes: entityState.attributes,
    key: "media_album_name",
  })
  const artworkPath = readStringAttribute({
    attributes: entityState.attributes,
    key: "entity_picture",
  })

  return {
    artist: artist || "—",
    title: title || "—",
    ...(album ? { album } : {}),
    isPlaying: entityState.state === "playing",
    ...(artworkPath ? { artworkPath } : {}),
  }
}

/** HA weather-entity condition codes → panel-friendly text. */
const WEATHER_CONDITION_TEXT: Record<string, string> = {
  "clear-night": "Clear night",
  cloudy: "Cloudy",
  exceptional: "Severe weather",
  fog: "Fog",
  hail: "Hail",
  lightning: "Lightning",
  "lightning-rainy": "Thunderstorms",
  partlycloudy: "Partly cloudy",
  pouring: "Pouring",
  rainy: "Rainy",
  snowy: "Snowy",
  "snowy-rainy": "Sleet",
  sunny: "Sunny",
  windy: "Windy",
  "windy-variant": "Windy",
}

/**
 * Maps one HA `weather` entity state to the clock view's weather data, or
 * null when the entity is unavailable / has no temperature yet.
 */
export const mapHomeAssistantStateToWeather = (
  entityState: Pick<
    HomeAssistantEntityState,
    "state" | "attributes"
  >,
): WeatherData | null => {
  const temperature = entityState.attributes.temperature
  if (typeof temperature !== "number") {
    return null
  }

  return {
    temperatureText: `${Math.round(temperature)}°`,
    conditionText:
      WEATHER_CONDITION_TEXT[entityState.state] ??
      (entityState.state === "unavailable" ||
      entityState.state === "unknown"
        ? ""
        : entityState.state),
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

type PrioritySelection = {
  entityId: string | null
  data: NowPlayingData
}

const EMPTY_PRIORITY_SELECTION: PrioritySelection = {
  entityId: null,
  data: IDLE_NOW_PLAYING,
}

/**
 * Picks a device's now-playing data from its priority-ordered candidate list:
 *
 *   1. The highest-priority candidate that is actively `playing` wins — so a
 *      Plex integration player (listed first) takes over from the Shield's cast
 *      player the moment Plex starts, keeping Plex's title + poster.
 *   2. If nothing is playing, stay on the previous winner while it still has
 *      metadata (sticky "Last Played", so the panel doesn't blink to idle
 *      between tracks).
 *   3. Otherwise show the first candidate that has any metadata, else idle.
 *
 * Pure and order-sensitive — `orderedEntityIds` is the user's priority list.
 */
export const pickPriorityNowPlaying = ({
  orderedEntityIds,
  dataByEntityId,
  previousEntityId,
}: {
  orderedEntityIds: readonly string[]
  dataByEntityId: ReadonlyMap<string, NowPlayingData>
  previousEntityId: string | null
}): PrioritySelection => {
  const playingEntityId = orderedEntityIds.find(
    (entityId) => dataByEntityId.get(entityId)?.isPlaying,
  )
  if (playingEntityId) {
    return {
      entityId: playingEntityId,
      data:
        dataByEntityId.get(playingEntityId) ??
        IDLE_NOW_PLAYING,
    }
  }

  if (
    previousEntityId &&
    orderedEntityIds.includes(previousEntityId)
  ) {
    const previousData = dataByEntityId.get(
      previousEntityId,
    )
    if (previousData && previousData !== IDLE_NOW_PLAYING) {
      return {
        entityId: previousEntityId,
        data: previousData,
      }
    }
  }

  const metadataEntityId = orderedEntityIds.find(
    (entityId) => {
      const data = dataByEntityId.get(entityId)
      return data && data !== IDLE_NOW_PLAYING
    },
  )
  if (metadataEntityId) {
    return {
      entityId: metadataEntityId,
      data:
        dataByEntityId.get(metadataEntityId) ??
        IDLE_NOW_PLAYING,
    }
  }

  return EMPTY_PRIORITY_SELECTION
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
  followedPlatforms,
  getNowPlayingSourcesByDevice = () => new Map(),
  getWeatherEntityIds = () => [],
  viewDataStore,
  onNowPlayingChanged,
  onWeatherChanged = () => {},
}: {
  homeAssistantUrl: string
  homeAssistantToken: string
  followedPlatforms: readonly string[]
  /**
   * Per-device now-playing source: deviceId → its priority-ordered candidate
   * `media_player` entity ids. Resolved live so an HA config edit takes effect
   * without a reconnect. Every listed entity is watched; a device's view shows
   * the first candidate that is playing (see `pickPriorityNowPlaying`), keyed
   * in the view-data store by its deviceId. Devices absent here follow mode.
   */
  getNowPlayingSourcesByDevice?: () => ReadonlyMap<
    string,
    readonly string[]
  >
  /**
   * The HA `weather` entity ids to stream for the clock views, resolved live
   * (the union of every device's configured weather entity). Empty = off.
   */
  getWeatherEntityIds?: () => readonly string[]
  viewDataStore: ViewDataStore
  onNowPlayingChanged: (entityKey: string) => void
  onWeatherChanged?: (weatherEntityId: string) => void
}) => {
  // Re-pull the HA snapshot after a watched set grows (a just-configured
  // weather entity or now-playing source) so it reports its current value
  // without waiting for its next change.
  const snapshotRefreshSubject = new Subject<void>()

  // The flattened, deduped union of every device's source candidates.
  const getSourceCandidateEntityIds =
    (): readonly string[] => {
      const entityIds = new Set<string>()
      for (const orderedEntityIds of getNowPlayingSourcesByDevice().values()) {
        for (const entityId of orderedEntityIds) {
          entityIds.add(entityId)
        }
      }
      return Array.from(entityIds)
    }

  const getExtraWatchedEntityIds =
    (): readonly string[] => [
      ...getWeatherEntityIds(),
      ...getSourceCandidateEntityIds(),
    ]

  const entityStates = observeHomeAssistantEntityStates({
    url: homeAssistantUrl,
    token: homeAssistantToken,
    entityIds: [],
    followedPlatforms,
    getExtraWatchedEntityIds,
    refreshSignal: snapshotRefreshSubject,
  }).pipe(share())

  const updates = entityStates
    .pipe(
      filter(
        (entityState) =>
          !getWeatherEntityIds().includes(
            entityState.entityId,
          ),
      ),
      map(
        (entityState): NowPlayingUpdate => ({
          entityId: entityState.entityId,
          data: mapHomeAssistantStateToNowPlaying(
            entityState,
          ),
          isFollowCandidate: entityState.isFollowCandidate,
        }),
      ),
    )
    .pipe(share())

  const weatherSubscription = entityStates
    .pipe(
      filter((entityState) =>
        getWeatherEntityIds().includes(
          entityState.entityId,
        ),
      ),
      // Dedupe per weather entity id — displays may point at different ones.
      groupBy((entityState) => entityState.entityId),
      mergeMap((entityGroup) =>
        entityGroup.pipe(
          map((entityState) => ({
            weatherEntityId: entityState.entityId,
            weather:
              mapHomeAssistantStateToWeather(entityState),
          })),
          filter(
            (
              entry,
            ): entry is {
              weatherEntityId: string
              weather: WeatherData
            } => entry.weather !== null,
          ),
          distinctUntilChanged(
            (previous, current) =>
              JSON.stringify(previous.weather) ===
              JSON.stringify(current.weather),
          ),
        ),
      ),
    )
    .subscribe(({ weatherEntityId, weather }) => {
      viewDataStore.setWeather({
        weatherEntityId,
        data: weather,
      })
      onWeatherChanged(weatherEntityId)
    })

  // Every source candidate's latest now-playing data, accumulated so each
  // device can pick its priority winner from a full snapshot.
  const sourceCandidateData = updates.pipe(
    filter((update) =>
      getSourceCandidateEntityIds().includes(
        update.entityId,
      ),
    ),
    scan(
      (dataByEntityId, update) =>
        new Map(dataByEntityId).set(
          update.entityId,
          update.data,
        ),
      new Map<string, NowPlayingData>(),
    ),
    share(),
  )

  // Per configured device: its priority winner, keyed in the store by deviceId.
  const deviceSourceUpdates = sourceCandidateData.pipe(
    mergeMap((dataByEntityId) =>
      Array.from(
        getNowPlayingSourcesByDevice().entries(),
      ).map(([deviceId, orderedEntityIds]) => ({
        deviceId,
        orderedEntityIds,
        dataByEntityId,
      })),
    ),
    groupBy((item) => item.deviceId),
    mergeMap((deviceItems) =>
      deviceItems.pipe(
        scan(
          (selection, item) =>
            pickPriorityNowPlaying({
              orderedEntityIds: item.orderedEntityIds,
              dataByEntityId: item.dataByEntityId,
              previousEntityId: selection.entityId,
            }),
          EMPTY_PRIORITY_SELECTION,
        ),
        map((selection) => ({
          entityKey: deviceItems.key,
          data: selection.data,
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

  const subscription = merge(
    deviceSourceUpdates,
    followedUpdates,
  )
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
    /**
     * Re-pull the HA snapshot so weather entities added since the last snapshot
     * report their current value now (call after a weather-entity config change).
     */
    refreshWeather: () => {
      snapshotRefreshSubject.next()
    },
    /**
     * Re-pull the HA snapshot so a newly-added now-playing source candidate
     * reports its current value now (call after a source config change).
     */
    refreshSources: () => {
      snapshotRefreshSubject.next()
    },
    close: () => {
      subscription.unsubscribe()
      weatherSubscription.unsubscribe()
      snapshotRefreshSubject.complete()
    },
  }
}
