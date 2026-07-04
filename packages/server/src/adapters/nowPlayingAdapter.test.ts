import { describe, expect, test } from "vitest"
import type { NowPlayingData } from "../state/viewDataStore.ts"
import {
  IDLE_NOW_PLAYING,
  mapHomeAssistantStateToNowPlaying,
  pickPriorityNowPlaying,
  reduceFollowedPlayer,
} from "./nowPlayingAdapter.ts"

describe("mapHomeAssistantStateToNowPlaying", () => {
  test("maps a playing media_player to now-playing data", () => {
    expect(
      mapHomeAssistantStateToNowPlaying({
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
      mapHomeAssistantStateToNowPlaying({
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
      mapHomeAssistantStateToNowPlaying({
        state: "playing",
        attributes: {
          media_album_artist: "Twilight Force",
          media_title: "Dawn of the Dragonstar",
        },
      }),
    ).toMatchObject({ artist: "Twilight Force" })
  })

  test("strips emoji (tofu on the panel font) and decorative notes from the title", () => {
    expect(
      mapHomeAssistantStateToNowPlaying({
        state: "playing",
        attributes: {
          media_artist: "Hidden Pigeon Channel",
          media_title:
            "🐦 ALL The Pigeon Books! 📚 | ♫ Hot Dog! ♫",
        },
      }),
    ).toMatchObject({
      title: "ALL The Pigeon Books! | Hot Dog!",
    })
  })

  test("returns the idle placeholder when the player has no metadata", () => {
    expect(
      mapHomeAssistantStateToNowPlaying({
        state: "idle",
        attributes: {},
      }),
    ).toEqual(IDLE_NOW_PLAYING)
  })

  test("ignores non-string metadata attributes", () => {
    expect(
      mapHomeAssistantStateToNowPlaying({
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

describe("reduceFollowedPlayer", () => {
  const emptyAccumulator = {
    dataByEntityId: new Map(),
    currentEntityId: null,
  }

  const playingUpdate = ({
    entityId,
    title,
  }: {
    entityId: string
    title: string
  }) => ({
    entityId,
    data: { artist: "Artist", title, isPlaying: true },
    isFollowCandidate: true,
  })

  const stoppedUpdate = ({
    entityId,
    title,
  }: {
    entityId: string
    title: string
  }) => ({
    entityId,
    data: { artist: "Artist", title, isPlaying: false },
    isFollowCandidate: true,
  })

  test("a playing player takes over", () => {
    const accumulator = reduceFollowedPlayer(
      emptyAccumulator,
      playingUpdate({
        entityId: "media_player.kitchen",
        title: "Song A",
      }),
    )
    expect(accumulator.currentEntityId).toBe(
      "media_player.kitchen",
    )
  })

  test("the most recent playing player wins", () => {
    const accumulator = [
      playingUpdate({
        entityId: "media_player.kitchen",
        title: "Song A",
      }),
      playingUpdate({
        entityId: "media_player.bedroom",
        title: "Song B",
      }),
    ].reduce(reduceFollowedPlayer, emptyAccumulator)

    expect(accumulator.currentEntityId).toBe(
      "media_player.bedroom",
    )
  })

  test("when the current player stops, another playing player takes over", () => {
    const accumulator = [
      playingUpdate({
        entityId: "media_player.kitchen",
        title: "Song A",
      }),
      playingUpdate({
        entityId: "media_player.bedroom",
        title: "Song B",
      }),
      stoppedUpdate({
        entityId: "media_player.bedroom",
        title: "Song B",
      }),
    ].reduce(reduceFollowedPlayer, emptyAccumulator)

    expect(accumulator.currentEntityId).toBe(
      "media_player.kitchen",
    )
  })

  test("stays sticky on the last player when everything stops", () => {
    const accumulator = [
      playingUpdate({
        entityId: "media_player.kitchen",
        title: "Song A",
      }),
      stoppedUpdate({
        entityId: "media_player.kitchen",
        title: "Song A",
      }),
    ].reduce(reduceFollowedPlayer, emptyAccumulator)

    expect(accumulator.currentEntityId).toBe(
      "media_player.kitchen",
    )
    expect(
      accumulator.dataByEntityId.get(
        "media_player.kitchen",
      ),
    ).toMatchObject({ isPlaying: false })
  })

  test("adopts a stopped player with metadata when nothing was current", () => {
    const accumulator = reduceFollowedPlayer(
      emptyAccumulator,
      stoppedUpdate({
        entityId: "media_player.kitchen",
        title: "Song A",
      }),
    )
    expect(accumulator.currentEntityId).toBe(
      "media_player.kitchen",
    )
  })

  test("does not adopt an idle player with no metadata", () => {
    const accumulator = reduceFollowedPlayer(
      emptyAccumulator,
      {
        entityId: "media_player.kitchen",
        data: IDLE_NOW_PLAYING,
        isFollowCandidate: true,
      },
    )
    expect(accumulator.currentEntityId).toBe(null)
  })
})

describe("pickPriorityNowPlaying", () => {
  // The Kitchen Counter case: Plex first (rich title + poster), the Shield's
  // cast player second (catches YouTube, no poster).
  const PLEX = "media_player.plex_family_room_shield"
  const CAST = "media_player.family_room_shield_cast"
  const ordered = [PLEX, CAST] as const

  const playing = (title: string): NowPlayingData => ({
    artist: "—",
    title,
    isPlaying: true,
  })
  const stopped = (title: string): NowPlayingData => ({
    artist: "—",
    title,
    isPlaying: false,
  })

  test("the highest-priority playing candidate wins even if a lower one is also playing", () => {
    const selection = pickPriorityNowPlaying({
      orderedEntityIds: ordered,
      dataByEntityId: new Map([
        [PLEX, playing("Justice League")],
        [CAST, playing("Pigeon Books")],
      ]),
      previousEntityId: null,
    })
    expect(selection.entityId).toBe(PLEX)
    expect(selection.data.title).toBe("Justice League")
  })

  test("falls through to a lower-priority candidate when the top one is idle (YouTube on the Shield)", () => {
    const selection = pickPriorityNowPlaying({
      orderedEntityIds: ordered,
      dataByEntityId: new Map([
        [PLEX, IDLE_NOW_PLAYING],
        [CAST, playing("Pigeon Books")],
      ]),
      previousEntityId: null,
    })
    expect(selection.entityId).toBe(CAST)
    expect(selection.data.title).toBe("Pigeon Books")
  })

  test("stays sticky on the previous winner (Last Played) when nothing is playing", () => {
    const selection = pickPriorityNowPlaying({
      orderedEntityIds: ordered,
      dataByEntityId: new Map([
        [PLEX, IDLE_NOW_PLAYING],
        [CAST, stopped("Pigeon Books")],
      ]),
      previousEntityId: CAST,
    })
    expect(selection.entityId).toBe(CAST)
    expect(selection.data).toMatchObject({
      isPlaying: false,
      title: "Pigeon Books",
    })
  })

  test("idle on every candidate yields the idle placeholder", () => {
    const selection = pickPriorityNowPlaying({
      orderedEntityIds: ordered,
      dataByEntityId: new Map([
        [PLEX, IDLE_NOW_PLAYING],
        [CAST, IDLE_NOW_PLAYING],
      ]),
      previousEntityId: null,
    })
    expect(selection.entityId).toBe(null)
    expect(selection.data).toEqual(IDLE_NOW_PLAYING)
  })

  test("a candidate with no state yet is skipped", () => {
    const selection = pickPriorityNowPlaying({
      orderedEntityIds: ordered,
      dataByEntityId: new Map([
        [CAST, playing("Pigeon Books")],
      ]),
      previousEntityId: null,
    })
    expect(selection.entityId).toBe(CAST)
  })
})
