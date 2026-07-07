import type { DeviceCommand } from "@castkit/shared/protocol/commands"
import type {
  BrowserDeviceProfile,
  BrowserDeviceSettings,
  ClientToServerMessage,
  ServerToClientMessage,
} from "@castkit/shared/protocol/ws"
import type {
  NowPlayingData,
  QueueData,
  WeatherData,
} from "@castkit/shared/viewData/types"
import { computed, signal } from "@preact/signals"

/**
 * All client state as signals, fed by the inlined page snapshot and then the
 * WebSocket. The live seek position is computed locally at 1 Hz from the last
 * pushed position + its timestamp — no per-second network traffic.
 */

type Snapshot = Extract<
  ServerToClientMessage,
  { type: "snapshot" }
>

const readInlineSnapshot = (): Snapshot | null => {
  const element = document.getElementById("castkit-state")
  if (!element?.textContent) {
    return null
  }
  try {
    return JSON.parse(element.textContent) as Snapshot
  } catch {
    return null
  }
}

const inlineSnapshot = readInlineSnapshot()

export const device = signal<BrowserDeviceProfile | null>(
  inlineSnapshot?.device ?? null,
)
export const settings = signal<BrowserDeviceSettings>(
  inlineSnapshot?.settings ?? {
    orientation: 0,
    theme: "Auto",
  },
)
export const activeView = signal<string>(
  inlineSnapshot?.view ?? "now-playing",
)
export const nowPlaying = signal<NowPlayingData | null>(
  inlineSnapshot?.data.nowPlaying ?? null,
)
export const queue = signal<QueueData | null>(
  inlineSnapshot?.data.queue ?? null,
)
export const weather = signal<WeatherData | null>(
  inlineSnapshot?.data.weather ?? null,
)
export const isConnected = signal(false)

/** Ticks each second so the seek bar and ambient clock advance between pushes. */
export const nowMs = signal(Date.now())
setInterval(() => {
  nowMs.value = Date.now()
}, 1_000)

/** While the user drags the seek bar, this overrides the live position. */
export const scrubPositionSeconds = signal<number | null>(
  null,
)

/** The live position: pushed position + elapsed wall-clock while playing. */
export const livePositionSeconds = computed(() => {
  const data = nowPlaying.value
  if (data?.positionSeconds === undefined) {
    return null
  }
  const elapsed =
    data.isPlaying && data.positionUpdatedAtMs !== undefined
      ? (nowMs.value - data.positionUpdatedAtMs) / 1_000
      : 0
  const position = data.positionSeconds + elapsed
  return data.durationSeconds !== undefined
    ? Math.min(position, data.durationSeconds)
    : position
})

const applyMessage = (message: ServerToClientMessage) => {
  if (message.type === "snapshot") {
    device.value = message.device
    settings.value = message.settings
    activeView.value = message.view
    nowPlaying.value = message.data.nowPlaying ?? null
    queue.value = message.data.queue ?? null
    weather.value = message.data.weather ?? null
    return
  }
  if (message.type === "view") {
    activeView.value = message.view
    return
  }
  if (message.type === "now_playing") {
    nowPlaying.value = message.data
    return
  }
  if (message.type === "queue") {
    queue.value = message.data
    return
  }
  if (message.type === "settings") {
    settings.value = message.settings
    return
  }
  if (message.type === "weather") {
    weather.value = message.data
    return
  }
  if (message.type === "reload") {
    window.location.reload()
  }
  // agenda arrives with its ambient view (later milestone).
}

let socket: WebSocket | null = null

export const sendCommand = (command: DeviceCommand) => {
  if (socket?.readyState !== WebSocket.OPEN) {
    return
  }
  const message: ClientToServerMessage = {
    type: "command",
    command,
  }
  socket.send(JSON.stringify(message))
}

/** Connect (and keep reconnecting) to this device's WebSocket. */
export const connect = () => {
  const deviceId = device.value?.id
  if (!deviceId) {
    return
  }
  const protocol =
    window.location.protocol === "https:" ? "wss" : "ws"
  const url = `${protocol}://${window.location.host}/d/${deviceId}/ws`

  const open = (retryDelayMs: number) => {
    socket = new WebSocket(url)
    socket.onopen = () => {
      isConnected.value = true
    }
    socket.onmessage = (event) => {
      try {
        applyMessage(
          JSON.parse(
            String(event.data),
          ) as ServerToClientMessage,
        )
      } catch {
        // Ignore malformed frames.
      }
    }
    socket.onclose = () => {
      isConnected.value = false
      // A kiosk must self-heal forever; cap the backoff at 15 s.
      const nextDelayMs = Math.min(retryDelayMs * 2, 15_000)
      setTimeout(() => open(nextDelayMs), retryDelayMs)
    }
  }

  open(1_000)
}
