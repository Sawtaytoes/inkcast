/**
 * Fetches now-playing artwork (album art / Plex poster) from a plain URL and
 * returns it as a data URI the render engines can embed directly. The URL comes
 * from Home Assistant in the pushed now-playing payload — Inkcast just fetches
 * it, it does not know or care that HA produced it. Results are cached by URL:
 * HA hands back a fresh URL (a rotated proxy token, a new poster) whenever the
 * artwork changes, so the URL itself is a perfect cache key.
 *
 * All image sizing/dithering to the panel happens downstream in the render
 * pipeline — this only turns a URL into bytes.
 */

const MAX_CACHE_ENTRIES = 16

const cache = new Map<string, string>()

export const fetchArtworkDataUri = async ({
  url,
}: {
  url: string
}): Promise<string | undefined> => {
  const cached = cache.get(url)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error(
        `[inkcast] artwork fetch failed (${response.status}) for ${url}`,
      )
      return undefined
    }

    const contentType =
      response.headers.get("content-type") ?? "image/jpeg"
    const imageBytes = Buffer.from(
      await response.arrayBuffer(),
    )
    const dataUri = `data:${contentType};base64,${imageBytes.toString("base64")}`

    // Bounded cache: evict the oldest entry once full.
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value
      if (oldestKey !== undefined) {
        cache.delete(oldestKey)
      }
    }
    cache.set(url, dataUri)

    return dataUri
  } catch (error) {
    console.error(
      `[inkcast] artwork fetch errored for ${url}`,
      error,
    )
    return undefined
  }
}
