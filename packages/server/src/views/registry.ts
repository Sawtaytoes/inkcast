import type { DeviceMetadata } from "@inkcast/core/devices/device"
import { ClockView } from "@inkcast/views/ClockView"
import { NowPlayingCard } from "@inkcast/views/NowPlayingCard"
import { createElement, type ReactElement } from "react"
import { IDLE_NOW_PLAYING } from "../adapters/nowPlayingAdapter.ts"
import type { NowPlayingData } from "../state/viewDataStore.ts"

/**
 * The views a device can show, and how to turn a view name + device + view
 * data into a React element to render. Now-playing data comes from the HA
 * media_player adapter (undefined = no data yet → idle placeholder); the
 * clock uses the server clock in the process timezone (`TZ`).
 */

export const VIEW_NAMES = ["now-playing", "clock"] as const
export type ViewName = (typeof VIEW_NAMES)[number]

export const getIsViewName = (
  value: string,
): value is ViewName =>
  (VIEW_NAMES as readonly string[]).includes(value)

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

  if (viewName === "clock") {
    return createElement(ClockView, {
      ...panel,
      time: formatTime(now),
      date: formatDate(now),
    })
  }

  return createElement(NowPlayingCard, {
    ...panel,
    ...(nowPlaying ?? IDLE_NOW_PLAYING),
  })
}
