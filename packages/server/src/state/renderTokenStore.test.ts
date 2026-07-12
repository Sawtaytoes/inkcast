import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createRenderTokenStore } from "./renderTokenStore.ts"

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

describe("createRenderTokenStore", () => {
  test("mints unguessable, unique tokens", () => {
    const store = createRenderTokenStore()
    const a = store.createToken(PNG)
    const b = store.createToken(PNG)
    expect(a).not.toEqual(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })

  test("fetch returns the PNG for a valid token", () => {
    const store = createRenderTokenStore()
    const token = store.createToken(PNG)
    expect(store.fetchToken(token)).toEqual(PNG)
  })

  test("unknown token fetches null", () => {
    const store = createRenderTokenStore()
    expect(store.fetchToken("nope")).toBeNull()
  })

  test("a token can be re-fetched while in-flight (retry safety)", () => {
    const store = createRenderTokenStore()
    const token = store.createToken(PNG)
    expect(store.fetchToken(token)).toEqual(PNG)
    // Not evicted on receipt — a mid-flight retry still succeeds.
    expect(store.fetchToken(token)).toEqual(PNG)
  })

  test("evictToken makes the token single-use", () => {
    const store = createRenderTokenStore()
    const token = store.createToken(PNG)
    store.evictToken(token)
    expect(store.fetchToken(token)).toBeNull()
  })

  describe("TTL sweeper", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test("evicts a never-fetched token after the TTL", () => {
      const store = createRenderTokenStore({ ttlMinutes: 10 })
      const token = store.createToken(PNG)
      store.startSweeper()
      vi.advanceTimersByTime(11 * 60 * 1000)
      expect(store.fetchToken(token)).toBeNull()
      store.stopSweeper()
    })

    test("never evicts an in-flight token via the sweeper", () => {
      const store = createRenderTokenStore({ ttlMinutes: 10 })
      const token = store.createToken(PNG)
      store.fetchToken(token) // marks in-flight
      store.startSweeper()
      vi.advanceTimersByTime(30 * 60 * 1000)
      expect(store.fetchToken(token)).toEqual(PNG)
      store.stopSweeper()
    })
  })
})
