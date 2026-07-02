import { describe, expect, test } from "vitest"
import {
  IDLE_NOW_PLAYING,
  mapHaStateToNowPlaying,
} from "./nowPlayingAdapter.ts"

describe("mapHaStateToNowPlaying", () => {
  test("maps a playing media_player to now-playing data", () => {
    expect(
      mapHaStateToNowPlaying({
        entityId: "media_player.example",
        state: "playing",
        attributes: {
          media_artist: "Twilight Force",
          media_title: "Dawn of the Dragonstar",
        },
      }),
    ).toEqual({
      artist: "Twilight Force",
      title: "Dawn of the Dragonstar",
      isPlaying: true,
    })
  })

  test("marks a paused player with metadata as last-played", () => {
    expect(
      mapHaStateToNowPlaying({
        entityId: "media_player.example",
        state: "paused",
        attributes: {
          media_artist: "Twilight Force",
          media_title: "Dawn of the Dragonstar",
        },
      }),
    ).toMatchObject({ isPlaying: false })
  })

  test("falls back to media_album_artist when media_artist is missing", () => {
    expect(
      mapHaStateToNowPlaying({
        entityId: "media_player.example",
        state: "playing",
        attributes: {
          media_album_artist: "Twilight Force",
          media_title: "Dawn of the Dragonstar",
        },
      }),
    ).toMatchObject({ artist: "Twilight Force" })
  })

  test("returns the idle placeholder when the player has no metadata", () => {
    expect(
      mapHaStateToNowPlaying({
        entityId: "media_player.example",
        state: "idle",
        attributes: {},
      }),
    ).toEqual(IDLE_NOW_PLAYING)
  })

  test("ignores non-string metadata attributes", () => {
    expect(
      mapHaStateToNowPlaying({
        entityId: "media_player.example",
        state: "playing",
        attributes: {
          media_artist: 42,
          media_title: "Only Title",
        },
      }),
    ).toEqual({
      artist: "—",
      title: "Only Title",
      isPlaying: true,
    })
  })
})
