import { Observable, retry, timer } from "rxjs"
// The `ws` client, NOT Node's built-in WebSocket: undici's client drops the
// connection with an opaque error on Home Assistant's multi-megabyte frames
// (`get_states` / `config/entity_registry/list` on a large install).
import { WebSocket as WebSocketClient } from "ws"

/**
 * One Home Assistant entity's state, as delivered by the HA WebSocket API —
 * either from the initial `get_states` snapshot or a `state_changed` event.
 * `isFollowCandidate` marks entities that were discovered via the
 * follow-all-music-players registry lookup (as opposed to being explicitly
 * pinned by a device).
 */
export type HomeAssistantEntityState = {
  entityId: string
  state: string
  attributes: Record<string, unknown>
  isFollowCandidate: boolean
}

type WireState = {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
}

type WireRegistryEntry = {
  entity_id: string
  platform: string
}

const REGISTRY_MESSAGE_ID = 1
const GET_STATES_MESSAGE_ID = 2
const SUBSCRIBE_EVENTS_MESSAGE_ID = 3
const RECONNECT_DELAY_MILLISECONDS = 5_000

/** `http(s)://host:8123` → `ws(s)://host:8123/api/websocket`. */
const buildWebSocketUrl = (homeAssistantUrl: string) =>
  `${homeAssistantUrl.replace(/^http/, "ws").replace(/\/$/, "")}/api/websocket`

/**
 * Streams entity states from Home Assistant over its WebSocket API:
 * authenticates with a long-lived access token, optionally discovers every
 * `media_player` belonging to the followed integrations from the entity
 * registry (follow mode), emits an initial snapshot (`get_states`), then
 * every subsequent `state_changed` of a watched entity. The connection
 * retries forever with a fixed delay, so a HA restart just pauses the stream
 * instead of killing the adapter.
 */
export const observeHomeAssistantEntityStates = ({
  url,
  token,
  entityIds,
  followedPlatforms,
}: {
  url: string
  token: string
  /** Entities explicitly pinned by devices — always watched. */
  entityIds: readonly string[]
  /**
   * Integrations whose `media_player`s the follow mode tracks (registry
   * lookup), e.g. music_assistant + plex. Empty = follow mode off.
   * Exclusions are NOT applied here — the adapter filters dynamically so
   * the HA-editable exclusion list takes effect without a reconnect.
   */
  followedPlatforms: readonly string[]
}): Observable<HomeAssistantEntityState> => {
  const pinnedEntityIds = new Set(entityIds)
  const followedPlatformSet = new Set(followedPlatforms)

  return new Observable<HomeAssistantEntityState>(
    (subscriber) => {
      const webSocket = new WebSocketClient(
        buildWebSocketUrl(url),
      )
      const followedEntityIds = new Set<string>()

      const sendMessage = (message: object) => {
        webSocket.send(JSON.stringify(message))
      }

      const emitIfWatched = (wireState: WireState) => {
        const isFollowCandidate = followedEntityIds.has(
          wireState.entity_id,
        )
        if (
          !isFollowCandidate &&
          !pinnedEntityIds.has(wireState.entity_id)
        ) {
          return
        }

        subscriber.next({
          entityId: wireState.entity_id,
          state: wireState.state,
          attributes: wireState.attributes ?? {},
          isFollowCandidate,
        })
      }

      const requestStatesAndEvents = () => {
        sendMessage({
          id: GET_STATES_MESSAGE_ID,
          type: "get_states",
        })
        sendMessage({
          id: SUBSCRIBE_EVENTS_MESSAGE_ID,
          type: "subscribe_events",
          event_type: "state_changed",
        })
      }

      webSocket.on("message", (data) => {
        const message = JSON.parse(String(data))

        if (message.type === "auth_required") {
          sendMessage({
            type: "auth",
            access_token: token,
          })
        } else if (message.type === "auth_invalid") {
          subscriber.error(
            new Error(
              `[inkcast] Home Assistant rejected the token: ${message.message}`,
            ),
          )
        } else if (message.type === "auth_ok") {
          // Follow mode needs the registry (for the entity → integration
          // mapping) before the snapshot can be filtered.
          if (followedPlatformSet.size > 0) {
            sendMessage({
              id: REGISTRY_MESSAGE_ID,
              type: "config/entity_registry/list",
            })
          } else {
            requestStatesAndEvents()
          }
        } else if (
          message.type === "result" &&
          message.id === REGISTRY_MESSAGE_ID &&
          message.success
        ) {
          const registryEntries: WireRegistryEntry[] =
            message.result ?? []
          registryEntries
            .filter(
              (entry) =>
                followedPlatformSet.has(entry.platform) &&
                entry.entity_id.startsWith("media_player."),
            )
            .forEach((entry) => {
              followedEntityIds.add(entry.entity_id)
            })
          console.log(
            `[inkcast] following ${followedEntityIds.size} player(s) from: ${followedPlatforms.join(", ")}`,
          )
          requestStatesAndEvents()
        } else if (
          message.type === "result" &&
          message.id === GET_STATES_MESSAGE_ID &&
          message.success
        ) {
          const states: WireState[] = message.result ?? []
          states.forEach(emitIfWatched)
        } else if (
          message.type === "event" &&
          message.id === SUBSCRIBE_EVENTS_MESSAGE_ID
        ) {
          const newState: WireState | null =
            message.event?.data?.new_state ?? null

          if (newState) {
            emitIfWatched(newState)
          }
        }
      })

      webSocket.on("close", (code, reason) => {
        subscriber.error(
          new Error(
            `[inkcast] Home Assistant WebSocket closed (${code} ${String(reason)})`,
          ),
        )
      })
      webSocket.on("error", (error) => {
        subscriber.error(
          new Error(
            `[inkcast] Home Assistant WebSocket errored: ${error.message}`,
          ),
        )
      })

      return () => {
        // The close handler may still fire, but errors on an already-closed
        // subscriber are ignored, so this teardown is safe on unsubscribe.
        webSocket.close()
      }
    },
  ).pipe(
    retry({
      delay: (error) => {
        console.error(
          `[inkcast] Home Assistant stream failed (retrying in ${RECONNECT_DELAY_MILLISECONDS / 1_000}s):`,
          error instanceof Error ? error.message : error,
        )
        return timer(RECONNECT_DELAY_MILLISECONDS)
      },
      resetOnSuccess: true,
    }),
  )
}
