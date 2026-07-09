import type {
  AgendaData,
  NowPlayingData,
  QueueData,
  WeatherData,
} from "../viewData/types.ts"
import type { DeviceCommand } from "./commands.ts"

/**
 * The server↔browser WebSocket protocol for browser-mode (Slatecast) devices.
 * One socket per device page at `/d/<id>/ws`: the server sends a full
 * `snapshot` on connect, then deltas; the client sends `command` for taps.
 * A `view` message swaps the active view without a page reload.
 */

/**
 * Default Photo Frame rotation interval (minutes) when Home Assistant hasn't
 * set one. Shared by the server settings defaults and the client fallback so
 * both agree before the first retained value arrives.
 */
export const DEFAULT_PHOTO_INTERVAL_MINUTES = 10

/** Dynamic per-device settings the browser applies live (no reload). */
export type BrowserDeviceSettings = {
  /** Clockwise degrees the client applies as a CSS transform. */
  orientation: 0 | 90 | 180 | 270
  theme: "Auto" | "Dark" | "Light"
  /** Photo Frame rotation interval, minutes — the SPA rotates client-side. */
  photoIntervalMinutes: number
}

/** Static capabilities inlined into the page shell and the snapshot. */
export type BrowserDeviceProfile = {
  id: string
  label: string
  width: number
  height: number
  shape: "square" | "round" | "rect"
  hasTouch: boolean
  colour: "mono" | "grayscale" | "e6" | "full"
}

export type ViewDataState = {
  nowPlaying?: NowPlayingData
  queue?: QueueData
  weather?: WeatherData
  agenda?: AgendaData
}

export type ServerToClientMessage =
  | {
      type: "snapshot"
      device: BrowserDeviceProfile
      settings: BrowserDeviceSettings
      /** The active view's client id (see the view registry). */
      view: string
      data: ViewDataState
    }
  | { type: "view"; view: string }
  | { type: "now_playing"; data: NowPlayingData }
  | { type: "queue"; data: QueueData }
  | { type: "weather"; data: WeatherData }
  | { type: "agenda"; data: AgendaData }
  | { type: "settings"; settings: BrowserDeviceSettings }
  | { type: "reload" }

export type ClientToServerMessage = {
  type: "command"
  command: DeviceCommand
}
