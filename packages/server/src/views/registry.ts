import type { DeviceMetadata } from "@inkcast/core/devices/device"
import { ClockView } from "@inkcast/views/ClockView"
import { NowPlayingDashboard } from "@inkcast/views/NowPlayingDashboard"
import { NowPlayingEditorial } from "@inkcast/views/NowPlayingEditorial"
import { NowPlayingPoster } from "@inkcast/views/NowPlayingPoster"
import { createElement, type ReactElement } from "react"
import { IDLE_NOW_PLAYING } from "../adapters/nowPlayingAdapter.ts"
import type { NowPlayingData } from "../state/viewDataStore.ts"

/**
 * The views a device can show, and how to turn a view name + device + view
 * data into a React element to render. View names are human-readable — they
 * appear verbatim in Home Assistant's View select — and double as the API/
 * MQTT payload values. Now-playing data comes from the HA media_player
 * adapter (undefined = no data yet → idle placeholder); clock-bearing views
 * use the server clock in the process timezone (`TZ`).
 */

export const VIEW_NAMES = [
  "Now Playing (Dashboard)",
  "Now Playing (Editorial)",
  "Now Playing (Poster)",
  "Clock",
] as const
export type ViewName = (typeof VIEW_NAMES)[number]

const NOW_PLAYING_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set([
    "Now Playing (Dashboard)",
    "Now Playing (Editorial)",
    "Now Playing (Poster)",
  ])

/** Views that display the time and need the minute re-push. */
const CLOCK_BEARING_VIEW_NAMES: ReadonlySet<ViewName> =
  new Set(["Now Playing (Dashboard)", "Clock"])

export const getIsViewName = (
  value: string,
): value is ViewName =>
  (VIEW_NAMES as readonly string[]).includes(value)

export const getIsNowPlayingView = (viewName: ViewName) =>
  NOW_PLAYING_VIEW_NAMES.has(viewName)

export const getIsClockBearingView = (viewName: ViewName) =>
  CLOCK_BEARING_VIEW_NAMES.has(viewName)

const formatTime = (now: Date) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now)

const formatDate = (now: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now)

/** Build the React element for a device's active view at a given instant. */
export const renderViewElement = ({
  viewName,
  device,
  now,
  nowPlaying,
}: {
  viewName: ViewName
  device: DeviceMetadata
  now: Date
  nowPlaying?: NowPlayingData
}): ReactElement => {
  const panel = {
    width: device.width,
    height: device.height,
    colourMode: device.colourMode,
  }
  const nowPlayingProps = nowPlaying ?? IDLE_NOW_PLAYING

  if (viewName === "Clock") {
    return createElement(ClockView, {
      ...panel,
      time: formatTime(now),
      date: formatDate(now),
    })
  }
  if (viewName === "Now Playing (Editorial)") {
    return createElement(NowPlayingEditorial, {
      ...panel,
      ...nowPlayingProps,
    })
  }
  if (viewName === "Now Playing (Poster)") {
    return createElement(NowPlayingPoster, {
      ...panel,
      ...nowPlayingProps,
    })
  }

  return createElement(NowPlayingDashboard, {
    ...panel,
    ...nowPlayingProps,
    time: formatTime(now),
    date: formatDate(now),
  })
}
