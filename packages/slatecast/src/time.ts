/**
 * Client-side clock formatting shared by every browser view that shows a clock
 * (Ambient, Clock, Weather, Calendar). Time is device-local — off the kiosk's
 * own timezone and the shared 1 Hz `nowMs` tick — exactly as the Ambient view
 * has always rendered it.
 *
 * NOTE: this does NOT yet honour the global Home Assistant Clock:* knobs
 * (12/24-hour, date style, timezone) that image-mode devices respect. Those
 * live on the "CastKit Server" device and are resolved server-side at render
 * time; wiring them into the browser snapshot/settings is a tracked follow-up.
 */
export const formatClockTime = (millis: number) =>
  new Date(millis).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })

export const formatClockDate = (millis: number) =>
  new Date(millis).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

/** Short wall-clock time for a calendar row (all-day events show "All day"). */
export const formatEventTime = ({
  startMillis,
  isAllDay,
}: {
  startMillis: number
  isAllDay: boolean
}) =>
  isAllDay
    ? "All day"
    : new Date(startMillis).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
