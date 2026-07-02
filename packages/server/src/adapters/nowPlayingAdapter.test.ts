import { describe, expect, test } from "vitest"
import {
  IDLE_NOW_PLAYING,
  mapHomeAssistantStateToNowPlaying,
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
