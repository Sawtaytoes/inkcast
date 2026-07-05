import { describe, expect, test } from "vitest"
import {
  IDLE_NOW_PLAYING,
  parseAgendaPayload,
  parseNowPlayingPayload,
  parseWeatherPayload,
} from "./viewDataPayloads.ts"

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
