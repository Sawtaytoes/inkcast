import { timer } from "rxjs"
import type {
  AgendaData,
  AgendaEvent,
  ViewDataStore,
} from "../state/viewDataStore.ts"

/**
 * The calendar-agenda adapter: on an interval it pulls each device's calendars
 * from Home Assistant's REST calendar endpoint, maps them to the day's events,
 * stores them per device, and — when a device's day actually changes — re-pushes
 * it so an imminent appointment surfaces. This mirrors the weather flow
 * (`nowPlayingAdapter`'s weather branch → `onWeatherChanged`): Inkcast pulls the
 * data and renders it; Home Assistant automations decide *when* the panel
 * switches to the agenda view. A calendar entity's *state* only exposes the
 * single next event, so the full-day list comes from the REST endpoint
 * (`GET /api/calendars/<entity>?start=&end=`), fetched with the same long-lived
 * token `haArtwork` already uses.
 *
 * WHICH calendars a device uses is HA config, not adapter config: the caller
 * passes `getCalendarEntityIds`, which resolves a device's `Agenda: Calendars`
 * text entity (per-device, falling back to the global default) at fetch time,
 * so a change from Home Assistant takes effect on the next poll or refresh — no
 * env var, no restart (see docs/decisions/2026-07-02-agenda-calendars-are-ha-config-entities-not-env.md).
 */

/** One event as Home Assistant's REST calendar endpoint returns it. */
type WireCalendarEvent = {
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  summary?: string
}

/**
 * Maps Home Assistant's raw calendar events to the agenda view's data: keeps
 * only events with a resolvable start, marks all-day events (a bare `date` with
 * no `dateTime`), trims summaries, and sorts ascending by start. Pure and
 * exported so it can be unit-tested like `mapHomeAssistantStateToWeather`.
 */
export const mapCalendarEventsToAgenda = (
  wireEvents: readonly WireCalendarEvent[],
): AgendaData => {
  const events = wireEvents
    .map((wireEvent): AgendaEvent | null => {
      const startDateTime = wireEvent.start?.dateTime
      const startDate = wireEvent.start?.date
      const startMs = startDateTime
        ? Date.parse(startDateTime)
        : startDate
          ? Date.parse(`${startDate}T00:00:00`)
          : Number.NaN
      if (Number.isNaN(startMs)) {
        return null
      }
      return {
        startMs,
        summary: (wireEvent.summary ?? "").trim() || "Busy",
        isAllDay:
          startDateTime === undefined &&
          startDate !== undefined,
      }
    })
    .filter((event): event is AgendaEvent => event !== null)
    .sort((left, right) => left.startMs - right.startMs)

  return { events }
}

/** Local midnight today and tomorrow, as ISO instants for the HA query window. */
const getTodayWindow = (now: Date) => {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const startOfNextDay = new Date(startOfDay)
  startOfNextDay.setDate(startOfNextDay.getDate() + 1)
  return {
    startIso: startOfDay.toISOString(),
    endIso: startOfNextDay.toISOString(),
  }
}

const fetchCalendarEvents = async ({
  homeAssistantUrl,
  homeAssistantToken,
  entityId,
  startIso,
  endIso,
}: {
  homeAssistantUrl: string
  homeAssistantToken: string
  entityId: string
  startIso: string
  endIso: string
}): Promise<readonly WireCalendarEvent[]> => {
  const url = `${homeAssistantUrl.replace(/\/$/, "")}/api/calendars/${encodeURIComponent(
    entityId,
  )}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${homeAssistantToken}`,
    },
  })
  if (!response.ok) {
    console.error(
      `[inkcast] calendar fetch failed (${response.status}) for ${entityId}`,
    )
    return []
  }
  return (await response.json()) as WireCalendarEvent[]
}

export const createCalendarAgendaAdapter = ({
  homeAssistantUrl,
  homeAssistantToken,
  deviceIds,
  getCalendarEntityIds,
  pollMinutes,
  viewDataStore,
  onAgendaChanged,
}: {
  homeAssistantUrl: string
  homeAssistantToken: string
  /** Every device the server manages (each may or may not have calendars set). */
  deviceIds: readonly string[]
  /** Resolve a device's configured calendars (per-device → global default). */
  getCalendarEntityIds: (
    deviceId: string,
  ) => readonly string[]
  pollMinutes: number
  viewDataStore: ViewDataStore
  /** Re-push the device if it's currently showing the agenda view. */
  onAgendaChanged: (deviceId: string) => void
}) => {
  const pollMilliseconds = pollMinutes * 60_000

  /** Fetch + merge + store one device's day; notify only when it changed. */
  const refreshDevice = async (deviceId: string) => {
    if (!deviceIds.includes(deviceId)) {
      return
    }

    try {
      const calendarEntityIds =
        getCalendarEntityIds(deviceId)
      const { startIso, endIso } = getTodayWindow(
        new Date(),
      )
      // No calendars configured for this device → an empty day (the view
      // degrades to the weather clock).
      const perCalendarEvents = await Promise.all(
        calendarEntityIds.map((entityId) =>
          fetchCalendarEvents({
            homeAssistantUrl,
            homeAssistantToken,
            entityId,
            startIso,
            endIso,
          }),
        ),
      )
      const agenda = mapCalendarEventsToAgenda(
        perCalendarEvents.flat(),
      )

      const previous = viewDataStore.getAgenda(deviceId)
      if (
        JSON.stringify(previous?.events) ===
        JSON.stringify(agenda.events)
      ) {
        return
      }
      viewDataStore.setAgenda({ deviceId, data: agenda })
      console.log(
        `[inkcast] agenda ${deviceId}: ${agenda.events.length} event(s) today`,
      )
      onAgendaChanged(deviceId)
    } catch (error) {
      console.error(
        `[inkcast] agenda ${deviceId}: fetch failed`,
        error,
      )
    }
  }

  const subscription = timer(0, pollMilliseconds).subscribe(
    () => {
      deviceIds.forEach((deviceId) => {
        void refreshDevice(deviceId)
      })
    },
  )

  return {
    refreshDevice,
    close: () => {
      subscription.unsubscribe()
    },
  }
}
