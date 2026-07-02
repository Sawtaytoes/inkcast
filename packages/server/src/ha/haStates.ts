import { Observable, retry } from "rxjs"

/**
 * One Home Assistant entity's state, as delivered by the HA WebSocket API —
 * either from the initial `get_states` snapshot or a `state_changed` event.
 */
export type HaEntityState = {
  entityId: string
  state: string
  attributes: Record<string, unknown>
}

type HaWireState = {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
}

const GET_STATES_MESSAGE_ID = 1
const SUBSCRIBE_EVENTS_MESSAGE_ID = 2
const RECONNECT_DELAY_MILLISECONDS = 5_000

const toEntityState = (
  wireState: HaWireState,
): HaEntityState => ({
  entityId: wireState.entity_id,
  state: wireState.state,
  attributes: wireState.attributes ?? {},
})

/** `http(s)://host:8123` → `ws(s)://host:8123/api/websocket`. */
const buildWebSocketUrl = (haUrl: string) =>
  `${haUrl.replace(/^http/, "ws").replace(/\/$/, "")}/api/websocket`

/**
 * Streams the states of the given entities from Home Assistant over its
 * WebSocket API: authenticates with a long-lived access token, emits an
 * initial snapshot (`get_states`), then every subsequent `state_changed`.
 * The connection retries forever with a fixed delay, so a HA restart just
 * pauses the stream instead of killing the adapter.
 */
export const observeHaEntityStates = ({
  url,
  token,
  entityIds,
}: {
  url: string
  token: string
  entityIds: readonly string[]
}): Observable<HaEntityState> => {
  const watchedEntityIds = new Set(entityIds)

  return new Observable<HaEntityState>((subscriber) => {
    const webSocket = new WebSocket(buildWebSocketUrl(url))

    const sendMessage = (message: object) => {
      webSocket.send(JSON.stringify(message))
    }

    webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))

      if (message.type === "auth_required") {
        sendMessage({
          type: "auth",
          access_token: token,
        })
      } else if (message.type === "auth_invalid") {
        subscriber.error(
          new Error(
            `[inkcast] HA rejected the token: ${message.message}`,
          ),
        )
      } else if (message.type === "auth_ok") {
        sendMessage({
          id: GET_STATES_MESSAGE_ID,
          type: "get_states",
        })
        sendMessage({
          id: SUBSCRIBE_EVENTS_MESSAGE_ID,
          type: "subscribe_events",
          event_type: "state_changed",
        })
      } else if (
        message.type === "result" &&
        message.id === GET_STATES_MESSAGE_ID &&
        message.success
      ) {
        const states: HaWireState[] = message.result ?? []
        states
          .filter((wireState) =>
            watchedEntityIds.has(wireState.entity_id),
          )
          .forEach((wireState) => {
            subscriber.next(toEntityState(wireState))
          })
      } else if (
        message.type === "event" &&
        message.id === SUBSCRIBE_EVENTS_MESSAGE_ID
      ) {
        const newState: HaWireState | null =
          message.event?.data?.new_state ?? null

        if (
          newState &&
          watchedEntityIds.has(newState.entity_id)
        ) {
          subscriber.next(toEntityState(newState))
        }
      }
    })

    webSocket.addEventListener("close", () => {
      subscriber.error(
        new Error("[inkcast] HA WebSocket closed"),
      )
    })
    webSocket.addEventListener("error", () => {
      subscriber.error(
        new Error("[inkcast] HA WebSocket errored"),
      )
    })

    return () => {
      // The close handler may still fire, but errors on an already-closed
      // subscriber are ignored, so this teardown is safe on unsubscribe.
      webSocket.close()
    }
  }).pipe(
    retry({
      delay: RECONNECT_DELAY_MILLISECONDS,
      resetOnSuccess: true,
    }),
  )
}
