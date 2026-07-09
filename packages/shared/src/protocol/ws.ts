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

/**
 * Resolved global clock settings the browser views format against, so browser
 * screens honour the same Home Assistant Clock:* knobs as the e-ink devices
 * (timezone via `Intl`, 12/24-hour, long/numeric date). The server stamps this
 * onto every settings payload; `timeZone` absent = the device's local zone.
 */
export type BrowserClockConfig = {
  /** IANA timezone (e.g. "America/Chicago"); absent = device-local. */
  timeZone?: string
  isTwelveHour: boolean
  isNumericDate: boolean
}

/** Dynamic per-device settings the browser applies live (no reload). */
export type BrowserDeviceSettings = {
  /** Clockwise degrees the client applies as a CSS transform. */
  orientation: 0 | 90 | 180 | 270
  theme: "Auto" | "Dark" | "Light"
  /** Photo Frame rotation interval, minutes — the SPA rotates client-side. */
  photoIntervalMinutes: number
  /**
   * Server-stamped global clock config. Optional on the wire so an older
   * payload stays valid; the client falls back to a device-local default.
   */
  clock?: BrowserClockConfig
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
