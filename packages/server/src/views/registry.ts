import type { DeviceMetadata } from "@inkcast/core/devices/device"
import { ClockAgendaView } from "@inkcast/views/ClockAgendaView"
import { ClockView } from "@inkcast/views/ClockView"
import { ClockWeatherView } from "@inkcast/views/ClockWeatherView"
import { NowPlayingDashboard } from "@inkcast/views/NowPlayingDashboard"
import { NowPlayingEditorial } from "@inkcast/views/NowPlayingEditorial"
import { NowPlayingPoster } from "@inkcast/views/NowPlayingPoster"
import { PhotoFrameView } from "@inkcast/views/PhotoFrameView"
import { createElement, type ReactElement } from "react"
import { IDLE_NOW_PLAYING } from "../mqtt/viewDataPayloads.ts"
import type {
  AgendaData,
  NowPlayingData,
  PhotoFrameData,
  WeatherData,
} from "../state/viewDataStore.ts"

/**
 * The views a device can show, and how to turn a view name + device + view
 * data into a React element to render. View names are human-readable — they
 * appear verbatim in Home Assistant's View select — and double as the API/
 * MQTT payload values. Now-playing / weather / agenda data is pushed by Home
 * Assistant over MQTT (undefined = no data yet → idle placeholder);
 * clock-bearing views use the server clock in the process timezone (`TZ`).
 */

export const VIEW_NAMES = [
  "Now Playing (Dashboard)",
  "Now Playing (Editorial)",
  "Now Playing (Poster)",
  "Photo Frame",
  "Clock",
  "Clock (Weather)",
  "Clock (Agenda)",
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
  new Set([
    "Now Playing (Dashboard)",
    "Clock",
    "Clock (Weather)",
    "Clock (Agenda)",
  ])

export const getIsViewName = (
  value: string,
): value is ViewName =>
  (VIEW_NAMES as readonly string[]).includes(value)

export const getIsNowPlayingView = (viewName: ViewName) =>
  NOW_PLAYING_VIEW_NAMES.has(viewName)

/**
 * Views that should bleed to the panel edge (ignoring the safe-area crop
 * inset). Photos look right filling the whole panel even under a mat; text
 * must stay inside the visible window. Photo Frame is the only bleed view.
 */
export const getIsBleedView = (viewName: ViewName) =>
  viewName === "Photo Frame"

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

/** `11:50p` — every character earns its place on a 250px panel. */
const formatCompactTime = (now: Date) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(now)
    .replace(" AM", "a")
    .replace(" PM", "p")

/** `Tu-02` — two-letter weekday plus the day (month is obvious in person). */
const formatCompactDate = (now: Date) => {
  const day = String(now.getDate()).padStart(2, "0")
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  })
    .format(now)
    .slice(0, 2)
  return `${weekday}-${day}`
}

/** `2:30 PM` on the large panel, `2:30p` on the compact one; all-day → label. */
const formatEventTime = ({
  startMs,
  isAllDay,
  isCompact,
}: {
  startMs: number
  isAllDay: boolean
  isCompact: boolean
}) => {
  if (isAllDay) {
    return isCompact ? "All" : "All day"
  }
  const eventDate = new Date(startMs)
  return isCompact
    ? formatCompactTime(eventDate)
    : formatTime(eventDate)
}

/** How many events each panel can legibly show. */
const MAX_AGENDA_EVENTS_COMPACT = 3
const MAX_AGENDA_EVENTS_LARGE = 4

/** Small panels get the compact date/time formats. */
const COMPACT_PANEL_MAX_HEIGHT = 200

/** Build the React element for a device's active view at a given instant. */
export const renderViewElement = ({
  viewName,
  device,
  now,
  nowPlaying,
  photoFrame,
  weather,
  agenda,
}: {
  viewName: ViewName
  device: DeviceMetadata
  now: Date
  nowPlaying?: NowPlayingData
  photoFrame?: PhotoFrameData
  weather?: WeatherData
  agenda?: AgendaData
}): ReactElement => {
  const panel = {
    width: device.width,
    height: device.height,
    colourMode: device.colourMode,
  }
  const nowPlayingProps = nowPlaying ?? IDLE_NOW_PLAYING
  const isCompactClock =
    device.height <= COMPACT_PANEL_MAX_HEIGHT

  if (viewName === "Clock") {
    return createElement(ClockView, {
      ...panel,
      time: formatTime(now),
      date: formatDate(now),
    })
  }
  if (viewName === "Clock (Weather)") {
    return createElement(ClockWeatherView, {
      ...panel,
      time: isCompactClock
        ? formatCompactTime(now)
        : formatTime(now),
      date: isCompactClock
        ? formatCompactDate(now)
        : formatDate(now),
      temperatureText: weather?.temperatureText,
      conditionText: weather?.conditionText,
    })
  }
  if (viewName === "Clock (Agenda)") {
    // Drop timed events that have already started (matches "revert when it
    // starts"), but keep all-day events for their whole day — their start is
    // midnight, so a start-time filter would wrongly hide them all day. Then
    // slice to what the panel can legibly hold. Times are formatted per panel
    // size here so the view stays a pure function of its props.
    const upcomingEvents = (agenda?.events ?? []).filter(
      (event) =>
        event.isAllDay || event.startMs >= now.getTime(),
    )
    const maxEvents = isCompactClock
      ? MAX_AGENDA_EVENTS_COMPACT
      : MAX_AGENDA_EVENTS_LARGE
    const events = upcomingEvents
      .slice(0, maxEvents)
      .map((event) => ({
        timeText: formatEventTime({
          startMs: event.startMs,
          isAllDay: event.isAllDay,
          isCompact: isCompactClock,
        }),
        summary: event.summary,
      }))
    return createElement(ClockAgendaView, {
      ...panel,
      time: isCompactClock
        ? formatCompactTime(now)
        : formatTime(now),
      date: isCompactClock
        ? formatCompactDate(now)
        : formatDate(now),
      temperatureText: weather?.temperatureText,
      conditionText: weather?.conditionText,
      events,
    })
  }
  if (viewName === "Photo Frame") {
    return createElement(PhotoFrameView, {
      ...panel,
      photoDataUri: photoFrame?.photoDataUri,
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

  const isCompactPanel =
    device.height <= COMPACT_PANEL_MAX_HEIGHT
  return createElement(NowPlayingDashboard, {
    ...panel,
    ...nowPlayingProps,
    time: isCompactPanel
      ? formatCompactTime(now)
      : formatTime(now),
    date: isCompactPanel
      ? formatCompactDate(now)
      : formatDate(now),
  })
}
