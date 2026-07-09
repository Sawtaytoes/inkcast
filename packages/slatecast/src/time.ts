import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"

/**
 * Client-side clock formatting shared by every browser view that shows a clock
 * (Ambient, Clock, Weather, Calendar). Formatting is pure `Intl`
 * (`toLocaleTimeString`/`toLocaleDateString`), honouring the server-stamped
 * global clock config: `timeZone` (IANA), 12/24-hour, and long/numeric date —
 * the same Home Assistant Clock:* knobs the e-ink devices respect. Absent
 * config falls back to the device's own timezone in 12-hour / long form.
 */

const DEFAULT_CLOCK: BrowserClockConfig = {
  isTwelveHour: true,
  isNumericDate: false,
}

/**
 * `Intl` throws a RangeError on an unknown `timeZone` string. Retry once
 * without it so a stray value can never blank the clock — it just renders in
 * the device-local zone instead.
 */
const formatSafely = ({
  millis,
  options,
  timeZone,
}: {
  millis: number
  options: Intl.DateTimeFormatOptions
  timeZone?: string
}) => {
  const date = new Date(millis)
  if (!timeZone) {
    return date.toLocaleString("en-US", options)
  }
  try {
    return date.toLocaleString("en-US", {
      ...options,
      timeZone,
    })
  } catch {
    return date.toLocaleString("en-US", options)
  }
}

export const formatClockTime = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) =>
  formatSafely({
    millis,
    timeZone: clock.timeZone,
    options: {
      hour: "numeric",
      minute: "2-digit",
      hour12: clock.isTwelveHour,
    },
  })

export const formatClockDate = (
  millis: number,
  clock: BrowserClockConfig = DEFAULT_CLOCK,
) =>
  formatSafely({
    millis,
    timeZone: clock.timeZone,
    options: clock.isNumericDate
      ? {
          month: "numeric",
          day: "numeric",
          year: "numeric",
        }
      : { weekday: "long", month: "long", day: "numeric" },
  })

/** Short wall-clock time for a calendar row (all-day events show "All day"). */
export const formatEventTime = ({
  startMillis,
  isAllDay,
  clock = DEFAULT_CLOCK,
}: {
  startMillis: number
  isAllDay: boolean
  clock?: BrowserClockConfig
}) =>
  isAllDay
    ? "All day"
    : formatSafely({
        millis: startMillis,
        timeZone: clock.timeZone,
        options: {
          hour: "numeric",
          minute: "2-digit",
          hour12: clock.isTwelveHour,
        },
      })
