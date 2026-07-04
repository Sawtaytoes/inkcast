import { PHAT_DEVICE } from "@inkcast/core/devices/device"
import type { ReactElement } from "react"
import { describe, expect, test } from "vitest"
import type { AgendaData } from "../state/viewDataStore.ts"
import { renderViewElement } from "./registry.ts"

/** Read the `events` prop the agenda view was handed. */
const getEventSummaries = (element: ReactElement) =>
  (
    element.props as {
      events: readonly { summary: string }[]
    }
  ).events.map((event) => event.summary)

describe("renderViewElement — Clock (Agenda)", () => {
  const now = new Date("2026-07-03T22:00:00-05:00")
  const agenda: AgendaData = {
    events: [
      {
        startMs: Date.parse("2026-07-03T00:00:00-05:00"),
        summary: "All-day thing",
        isAllDay: true,
      },
      {
        startMs: Date.parse("2026-07-03T17:00:00-05:00"),
        summary: "Past meeting",
        isAllDay: false,
      },
      {
        startMs: Date.parse("2026-07-03T23:30:00-05:00"),
        summary: "Later tonight",
        isAllDay: false,
      },
    ],
  }

  test("keeps all-day + future events, drops started timed events", () => {
    const element = renderViewElement({
      viewName: "Clock (Agenda)",
      device: PHAT_DEVICE,
      now,
      agenda,
    })
    expect(getEventSummaries(element)).toEqual([
      "All-day thing",
      "Later tonight",
    ])
  })
})
