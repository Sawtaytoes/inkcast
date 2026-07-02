/**
 * Minimal Immich API client for the photo-frame view. Ports the proven logic
 * from home-displays' `immich_impression_frame.py`:
 *
 * - Immich AND-matches `personIds` in search (every listed person must be in
 *   the asset), so "any of the kids" needs a client-side UNION: page each
 *   person's asset list and dedupe. The union is cached (6h TTL).
 * - `/api/assets/:id/thumbnail?size=preview` returns a server-rendered JPEG
 *   (handles HEIC, pre-sized) — never the original.
 * - Face bounding boxes come in each face's own imageWidth/imageHeight space;
 *   normalize to 0..1 fractions so the crop math is resolution-independent.
 */

export type ImmichConfig = {
  url: string
  apiKey: string
}

export type ImmichPerson = {
  id: string
  name: string
}

/** A face bounding box as 0..1 fractions of the image. */
export type FaceBox = {
  x1: number
  y1: number
  x2: number
  y2: number
}

const POOL_TTL_MILLISECONDS = 6 * 60 * 60 * 1_000
const POOL_MAX_PER_PERSON = 5_000
const PAGE_SIZE = 1_000

const poolCache = new Map<
  string,
  { builtAtMs: number; assetIds: readonly string[] }
>()

const requestJson = async ({
  config,
  path,
  method = "GET",
  body,
}: {
  config: ImmichConfig
  path: string
  method?: string
  body?: unknown
}) => {
  const response = await fetch(
    `${config.url.replace(/\/$/, "")}${path}`,
    {
      method,
      headers: {
        "x-api-key": config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Immich ${method} ${path} failed: ${response.status}`,
    )
  }
  return response.json()
}

/** All named people Immich knows (for resolving config names → ids). */
export const listPeople = async (
  config: ImmichConfig,
): Promise<ImmichPerson[]> => {
  const result = await requestJson({
    config,
    path: "/api/people?withHidden=false&size=1000",
  })
  const people: { id: string; name: string }[] =
    result.people ?? result ?? []
  return people
    .filter((person) => Boolean(person.name))
    .map((person) => ({
      id: person.id,
      name: person.name,
    }))
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Match one config entry against the people list: raw UUID, exact full name
 * (case-insensitive), or — the friendly path — a UNIQUE first name
 * ("Xander" → "Xander Ghadyani"). Ambiguous or missing = undefined.
 */
const matchPersonId = ({
  entry,
  people,
}: {
  entry: string
  people: readonly ImmichPerson[]
}) => {
  if (UUID_PATTERN.test(entry)) {
    return entry
  }

  const lowerEntry = entry.toLowerCase()
  const exactMatch = people.find(
    (person) => person.name.toLowerCase() === lowerEntry,
  )
  if (exactMatch) {
    return exactMatch.id
  }

  const firstNameMatches = people.filter(
    (person) =>
      person.name.split(" ")[0].toLowerCase() ===
      lowerEntry,
  )
  return firstNameMatches.length === 1
    ? firstNameMatches[0].id
    : undefined
}

/**
 * Resolve a comma-separated config string of person NAMES (full, or unique
 * first names, or raw UUIDs) to person ids. Unknown/ambiguous names are
 * reported, not silently dropped.
 */
export const resolvePersonIds = async ({
  config,
  peopleText,
}: {
  config: ImmichConfig
  peopleText: string
}): Promise<{
  personIds: string[]
  unknownNames: string[]
}> => {
  const entries = peopleText
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  if (entries.length === 0) {
    return { personIds: [], unknownNames: [] }
  }

  const people = await listPeople(config)
  const resolved = entries.map((entry) => ({
    entry,
    personId: matchPersonId({ entry, people }),
  }))

  return {
    personIds: resolved
      .map(({ personId }) => personId)
      .filter((id): id is string => Boolean(id)),
    unknownNames: resolved
      .filter(({ personId }) => !personId)
      .map(({ entry }) => entry),
  }
}

const fetchPersonAssetIds = async ({
  config,
  personId,
  page = 1,
  collected = [] as readonly string[],
}: {
  config: ImmichConfig
  personId: string
  page?: number
  collected?: readonly string[]
}): Promise<readonly string[]> => {
  const result = await requestJson({
    config,
    path: "/api/search/metadata",
    method: "POST",
    body: {
      personIds: [personId],
      type: "IMAGE",
      size: PAGE_SIZE,
      page,
    },
  })
  const assets = result.assets ?? {}
  const items: { id: string }[] = assets.items ?? []
  const nextCollected = collected.concat(
    items.map((item) => item.id),
  )
  const nextPage = assets.nextPage
    ? Number(assets.nextPage)
    : null

  if (
    !nextPage ||
    nextCollected.length >= POOL_MAX_PER_PERSON
  ) {
    return nextCollected
  }
  return fetchPersonAssetIds({
    config,
    personId,
    page: nextPage,
    collected: nextCollected,
  })
}

/** Cached UNION of image assets across the given people (any-of, deduped). */
export const buildAssetPool = async ({
  config,
  personIds,
}: {
  config: ImmichConfig
  personIds: readonly string[]
}): Promise<readonly string[]> => {
  const cacheKey = Array.from(personIds).sort().join(",")
  const cached = poolCache.get(cacheKey)
  if (
    cached &&
    Date.now() - cached.builtAtMs < POOL_TTL_MILLISECONDS
  ) {
    return cached.assetIds
  }

  const perPerson = await Promise.all(
    personIds.map((personId) =>
      fetchPersonAssetIds({ config, personId }),
    ),
  )
  const assetIds = Array.from(new Set(perPerson.flat()))
  poolCache.set(cacheKey, {
    builtAtMs: Date.now(),
    assetIds,
  })
  console.log(
    `[inkcast] immich pool: ${personIds.length} person(s) → ${assetIds.length} unique assets`,
  )
  return assetIds
}

/** One uniformly-random image asset from the union pool, or null if empty. */
export const pickRandomAssetId = async ({
  config,
  personIds,
}: {
  config: ImmichConfig
  personIds: readonly string[]
}): Promise<string | null> => {
  const pool = await buildAssetPool({ config, personIds })
  if (pool.length === 0) {
    return null
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

/** The server-rendered preview JPEG (handles HEIC, pre-sized). */
export const fetchPreviewJpeg = async ({
  config,
  assetId,
}: {
  config: ImmichConfig
  assetId: string
}): Promise<Buffer> => {
  const response = await fetch(
    `${config.url.replace(/\/$/, "")}/api/assets/${assetId}/thumbnail?size=preview`,
    { headers: { "x-api-key": config.apiKey } },
  )
  if (!response.ok) {
    throw new Error(
      `Immich preview fetch failed: ${response.status}`,
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

/** Normalized face boxes for the given people in this asset ([] on error). */
export const fetchFaceBoxes = async ({
  config,
  assetId,
  personIds,
}: {
  config: ImmichConfig
  assetId: string
  personIds: readonly string[]
}): Promise<FaceBox[]> => {
  const personIdSet = new Set(personIds)
  try {
    const asset = await requestJson({
      config,
      path: `/api/assets/${assetId}`,
    })
    const people: {
      id: string
      faces?: {
        imageWidth?: number
        imageHeight?: number
        boundingBoxX1: number
        boundingBoxY1: number
        boundingBoxX2: number
        boundingBoxY2: number
      }[]
    }[] = asset.people ?? []

    return people
      .filter((person) => personIdSet.has(person.id))
      .flatMap((person) => person.faces ?? [])
      .filter(
        (face) =>
          Boolean(face.imageWidth) &&
          Boolean(face.imageHeight),
      )
      .map((face) => ({
        x1: face.boundingBoxX1 / (face.imageWidth ?? 1),
        y1: face.boundingBoxY1 / (face.imageHeight ?? 1),
        x2: face.boundingBoxX2 / (face.imageWidth ?? 1),
        y2: face.boundingBoxY2 / (face.imageHeight ?? 1),
      }))
  } catch {
    return []
  }
}
