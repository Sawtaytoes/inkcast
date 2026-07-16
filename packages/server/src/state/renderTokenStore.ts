import { randomBytes } from "node:crypto"

/**
 * In-memory store for single-use render tokens and their PNG buffers.
 * Tokens are unguessable (crypto random), consumed on fetch, and evicted
 * by TTL if never fetched.
 *
 * Contract: evict only after the response fully flushes (completed 200).
 * Tolerate re-fetch of the same token while a transfer is in flight (retry safety).
 */
export type RenderTokenStore = {
  /** Mint a new token with a PNG payload. */
  createToken: (png: Buffer) => string
  /** Fetch a token's PNG; marks it in-flight. Returns null if not found. */
  fetchToken: (token: string) => Buffer | null
  /** Evict a token after its response has fully flushed. */
  evictToken: (token: string) => void
  /** Start the TTL sweeper (background eviction of unfetched tokens). */
  startSweeper: () => void
  /** Stop the TTL sweeper. */
  stopSweeper: () => void
}

type TokenEntry = {
  png: Buffer
  createdAt: number
  inFlight: boolean
}

export const createRenderTokenStore = ({
  ttlMinutes = 10,
}: {
  ttlMinutes?: number
} = {}): RenderTokenStore => {
  const ttlMs = ttlMinutes * 60 * 1000
  const store = new Map<string, TokenEntry>()
  let sweeperInterval: ReturnType<
    typeof setInterval
  > | null = null

  return {
    createToken: (png: Buffer) => {
      const token = randomBytes(16).toString("hex")
      store.set(token, {
        png,
        createdAt: Date.now(),
        inFlight: false,
      })
      return token
    },

    fetchToken: (token: string) => {
      const entry = store.get(token)
      if (!entry) return null

      // Mark in-flight; don't evict yet (response must fully flush first).
      entry.inFlight = true
      return entry.png
    },

    evictToken: (token: string) => {
      store.delete(token)
    },

    startSweeper: () => {
      if (sweeperInterval) return // Already running.

      sweeperInterval = setInterval(() => {
        const now = Date.now()
        for (const [token, entry] of store.entries()) {
          // Evict only unfetched tokens that have exceeded the TTL.
          // In-flight tokens are never evicted here; only via evictToken after flush.
          if (
            !entry.inFlight &&
            now - entry.createdAt > ttlMs
          ) {
            store.delete(token)
          }
        }
      }, 60 * 1000) // Sweep every minute.
    },

    stopSweeper: () => {
      if (sweeperInterval) {
        clearInterval(sweeperInterval)
        sweeperInterval = null
      }
    },
  }
}
