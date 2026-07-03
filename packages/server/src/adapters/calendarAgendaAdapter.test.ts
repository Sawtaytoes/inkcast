import { describe, expect, test } from "vitest"
import { mapCalendarEventsToAgenda } from "./calendarAgendaAdapter.ts"

describe("mapCalendarEventsToAgenda", () => {
  test("maps a timed event to an agenda event", () => {
    const agenda = mapCalendarEventsToAgenda([
      {
        start: { dateTime: "2026-07-02T14:30:00-07:00" },
        end: { dateTime: "2026-07-02T15:30:00-07:00" },
        summary: "Dentist",
      },
    ])
    expect(agenda.events).toEqual([
      {
        startMs: Date.parse("2026-07-02T14:30:00-07:00"),
        summary: "Dentist",
        isAllDay: false,
      },
    ])
  })

  test("marks a bare-date event as all-day", () => {
    const [event] = mapCalendarEventsToAgenda([
      {
        start: { date: "2026-07-02" },
        end: { date: "2026-07-03" },
        summary: "Birthday",
      },
    ]).events
    expect(event.isAllDay).toBe(true)
    expect(event.startMs).toBe(
      Date.parse("2026-07-02T00:00:00"),
    )
  })

  test("sorts events ascending by start", () => {
    const agenda = mapCalendarEventsToAgenda([
      {
        start: { dateTime: "2026-07-02T18:00:00-07:00" },
        summary: "Dinner",
      },
      {
        start: { dateTime: "2026-07-02T09:00:00-07:00" },
        summary: "Standup",
      },
    ])
    expect(
      agenda.events.map((event) => event.summary),
    ).toEqual(["Standup", "Dinner"])
  })

  test("drops events with no resolvable start", () => {
    const agenda = mapCalendarEventsToAgenda([
      { summary: "Floating" },
      {
        start: { dateTime: "not-a-date" },
        summary: "Broken",
      },
    ])
    expect(agenda.events).toEqual([])
  })

  test("falls back to 'Busy' for an empty summary", () => {
    const [event] = mapCalendarEventsToAgenda([
      {
        start: { dateTime: "2026-07-02T14:30:00-07:00" },
        summary: "  ",
      },
    ]).events
    expect(event.summary).toBe("Busy")
  })

  test("returns an empty agenda for no events", () => {
    expect(mapCalendarEventsToAgenda([]).events).toEqual([])
  })
})
