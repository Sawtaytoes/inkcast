/**
 * Fetches a media_player's artwork (album art / Plex poster) from Home
 * Assistant's `entity_picture` proxy path and returns it as a data URI the
 * render engines can embed directly. Results are cached by picture path —
 * HA rotates the access token inside the path whenever the artwork changes,
 * so the path itself is a perfect cache key.
 */

const MAX_CACHE_ENTRIES = 16

const cache = new Map<string, string>()

export const fetchArtworkDataUri = async ({
  homeAssistantUrl,
  homeAssistantToken,
  picturePath,
}: {
  homeAssistantUrl: string
  homeAssistantToken: string
  picturePath: string
}): Promise<string | undefined> => {
  const cached = cache.get(picturePath)
  if (cached) {
    return cached
  }

  // `entity_picture` is usually an HA-relative proxy path, but some
  // integrations (Music Assistant) hand back an absolute URL.
  const artworkUrl = picturePath.startsWith("http")
    ? picturePath
    : `${homeAssistantUrl.replace(/\/$/, "")}${picturePath}`

  try {
    const response = await fetch(artworkUrl, {
      headers: {
        Authorization: `Bearer ${homeAssistantToken}`,
      },
    })
    if (!response.ok) {
      console.error(
        `[inkcast] artwork fetch failed (${response.status}) for ${picturePath}`,
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
    cache.set(picturePath, dataUri)

    return dataUri
  } catch (error) {
    console.error(
      `[inkcast] artwork fetch errored for ${picturePath}`,
      error,
    )
    return undefined
  }
}
