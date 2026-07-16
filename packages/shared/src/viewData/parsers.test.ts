import { describe, expect, test } from "vitest"
import {
  IDLE_NOW_PLAYING,
  parseAgendaPayload,
  parseNowPlayingPayload,
  parseQueuePayload,
  parseWeatherPayload,
} from "./parsers.ts"

describe("parseNowPlayingPayload", () => {
  test("maps a full payload to now-playing data", () => {
    expect(
      parseNowPlayingPayload({
        title: "Zack Snyder's Justice League (2021)",
        artist: "Plex",
        isPlaying: true,
        artwork: "https://ha.local/poster.jpg",
      }),
    ).toEqual({
      title: "Zack Snyder's Justice League (2021)",
      artist: "Plex",
      isPlaying: true,
      artworkPath: "https://ha.local/poster.jpg",
    })
  })

  test("strips emoji/tofu and decorative notes from text fields", () => {
    expect(
      parseNowPlayingPayload({
        title: "🐦 ALL The Pigeon Books! 📚 | ♫ Hot Dog! ♫",
        artist: "Hidden Pigeon Channel",
        isPlaying: true,
      }),
    ).toMatchObject({
      title: "ALL The Pigeon Books! | Hot Dog!",
    })
  })

  test("idle payload (no title/artist) → idle placeholder", () => {
    expect(
      parseNowPlayingPayload({ isPlaying: false }),
    ).toEqual(IDLE_NOW_PLAYING)
  })

  test("a non-object payload → idle placeholder", () => {
    expect(parseNowPlayingPayload("nope")).toEqual(
      IDLE_NOW_PLAYING,
    )
  })

  test("isPlaying defaults to false and blank artwork is dropped", () => {
    expect(
      parseNowPlayingPayload({
        title: "A Song",
        artwork: "",
      }),
    ).toEqual({
      title: "A Song",
      artist: "—",
      isPlaying: false,
    })
  })

  test("parses the interactive-controller extension fields", () => {
    expect(
      parseNowPlayingPayload({
        title: "A Song",
        artist: "A Band",
        isPlaying: true,
        position: 123.4,
        positionUpdatedAt: "2026-07-07T17:59:58.100Z",
        duration: 245,
        volume: 0.35,
        isMuted: false,
      }),
    ).toEqual({
      title: "A Song",
      artist: "A Band",
      isPlaying: true,
      positionSeconds: 123.4,
      positionUpdatedAtMs: Date.parse(
        "2026-07-07T17:59:58.100Z",
      ),
      durationSeconds: 245,
      volume: 0.35,
      isMuted: false,
    })
  })

  test("malformed extension fields degrade to absent, not throw", () => {
    expect(
      parseNowPlayingPayload({
        title: "A Song",
        position: "not-a-number",
        positionUpdatedAt: "garbage",
        duration: Number.NaN,
        volume: null,
        isMuted: "yes",
      }),
    ).toEqual({
      title: "A Song",
      artist: "—",
      isPlaying: false,
    })
  })
})

describe("parseQueuePayload", () => {
  test("maps items, dropping ones without a title", () => {
    expect(
      parseQueuePayload({
        items: [
          {
            title: "Track One",
            artist: "A Band",
            artwork: "https://ha.local/art1.jpg",
            duration: 200,
            isCurrent: true,
          },
          { artist: "No Title" },
          { title: "Track Two" },
        ],
      }),
    ).toEqual({
      items: [
        {
          title: "Track One",
          artist: "A Band",
          artworkPath: "https://ha.local/art1.jpg",
          durationSeconds: 200,
          isCurrent: true,
        },
        {
          title: "Track Two",
          artist: "—",
          isCurrent: false,
        },
      ],
    })
  })

  test("caps the queue at 50 items", () => {
    const items = Array.from(
      { length: 80 },
      (_, index) => ({
        title: `Track ${index}`,
      }),
    )
    expect(parseQueuePayload({ items }).items).toHaveLength(
      50,
    )
  })

  test("bad payloads → empty queue", () => {
    expect(parseQueuePayload("nope")).toEqual({ items: [] })
    expect(parseQueuePayload({ items: "nope" })).toEqual({
      items: [],
    })
  })
})

describe("parseWeatherPayload", () => {
  test("rounds temperature and maps the HA condition code", () => {
    expect(
      parseWeatherPayload({
        temperature: 78.6,
        condition: "partlycloudy",
      }),
    ).toEqual({
      temperatureText: "79°",
      conditionText: "Partly cloudy",
    })
  })

  test("blanks an unavailable condition but keeps the temperature", () => {
    expect(
      parseWeatherPayload({
        temperature: 40,
        condition: "unavailable",
      }),
    ).toEqual({ temperatureText: "40°", conditionText: "" })
  })

  test("no numeric temperature → null (view shows nothing yet)", () => {
    expect(
      parseWeatherPayload({ condition: "sunny" }),
    ).toBeNull()
    expect(parseWeatherPayload(null)).toBeNull()
  })
})

describe("parseAgendaPayload", () => {
  test("keeps valid events, sorted ascending by start", () => {
    expect(
      parseAgendaPayload({
        events: [
          { start: 3000, summary: "Later" },
          {
            start: 1000,
            summary: "Sooner",
            isAllDay: true,
          },
        ],
      }),
    ).toEqual({
      events: [
        {
          startMs: 1000,
          summary: "Sooner",
          isAllDay: true,
        },
        {
          startMs: 3000,
          summary: "Later",
          isAllDay: false,
        },
      ],
    })
  })

  test("accepts ISO start strings", () => {
    const result = parseAgendaPayload({
      events: [
        {
          start: "2026-07-04T14:30:00Z",
          summary: "Meeting",
        },
      ],
    })
    expect(result.events[0]?.summary).toBe("Meeting")
    expect(result.events[0]?.startMs).toBe(
      Date.parse("2026-07-04T14:30:00Z"),
    )
  })

  test("collapses exact-duplicate events from overlapping calendars", () => {
    expect(
      parseAgendaPayload({
        events: [
          { start: 2000, summary: "Dentist" },
          { start: 1000, summary: "Standup" },
          // Same appointment surfaced by a second calendar.
          { start: 2000, summary: "Dentist" },
        ],
      }),
    ).toEqual({
      events: [
        {
          startMs: 1000,
          summary: "Standup",
          isAllDay: false,
        },
        {
          startMs: 2000,
          summary: "Dentist",
          isAllDay: false,
        },
      ],
    })
  })

  test("keeps same-summary events that differ in start or all-day flag", () => {
    const result = parseAgendaPayload({
      events: [
        { start: 1000, summary: "Walk dog" },
        { start: 5000, summary: "Walk dog" },
        {
          start: 1000,
          summary: "Walk dog",
          isAllDay: true,
        },
      ],
    })
    expect(result.events).toHaveLength(3)
  })

  test("drops events missing a start or summary, and bad payloads", () => {
    expect(
      parseAgendaPayload({
        events: [
          { summary: "No start" },
          { start: 1000, summary: "" },
          { start: 2000, summary: "Good" },
        ],
      }),
    ).toEqual({
      events: [
        { startMs: 2000, summary: "Good", isAllDay: false },
      ],
    })
    expect(parseAgendaPayload("nope")).toEqual({
      events: [],
    })
  })
})
