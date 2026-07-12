/**
 * Minimal Immich API client for the photo-frame view. Ports the proven logic
 * from home-displays' `immich_impression_frame.py`:
 *
 * - Immich AND-matches `personIds` in search (every listed person must be in
 *   the asset), so "any of the kids" needs a client-side UNION: page each
 *   person's asset list and dedupe. The union is cached (6h TTL). The same
 *   UNION pattern applies to smart search (`query`), which also AND-matches
 *   `personIds`.
 * - Picks are recency-weighted: newer photos get exponentially more weight
 *   (half-life default 365 days) with a 0.15 floor so old photos still appear.
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

/** One asset in the pick pool: its id plus its creation time (0 = unknown). */
export type AssetPoolEntry = {
  id: string
  createdAtMs: number
}

const POOL_TTL_MILLISECONDS = 6 * 60 * 60 * 1_000
const POOL_MAX_PER_PERSON = 5_000
const PAGE_SIZE = 1_000
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000
const RECENCY_WEIGHT_FLOOR = 0.15
const DEFAULT_RECENCY_HALF_LIFE_DAYS = 365

const poolCache = new Map<
  string,
  { builtAtMs: number; entries: readonly AssetPoolEntry[] }
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

const parseCreatedAtMs = (
  fileCreatedAt: string | undefined,
) => {
  const parsedMs = Date.parse(fileCreatedAt ?? "")
  return Number.isNaN(parsedMs) ? 0 : parsedMs
}

const fetchSearchPoolEntries = async ({
  config,
  searchPath,
  searchFilters,
  page = 1,
  collected = [] as readonly AssetPoolEntry[],
}: {
  config: ImmichConfig
  searchPath: string
  searchFilters: Record<string, unknown>
  page?: number
  collected?: readonly AssetPoolEntry[]
}): Promise<readonly AssetPoolEntry[]> => {
  const result = await requestJson({
    config,
    path: searchPath,
    method: "POST",
    body: {
      ...searchFilters,
      type: "IMAGE",
      size: PAGE_SIZE,
      page,
    },
  })
  const assets = result.assets ?? {}
  const items: { id: string; fileCreatedAt?: string }[] =
    assets.items ?? []
  const nextCollected = collected.concat(
    items.map((item) => ({
      id: item.id,
      createdAtMs: parseCreatedAtMs(item.fileCreatedAt),
    })),
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
  return fetchSearchPoolEntries({
    config,
    searchPath,
    searchFilters,
    page: nextPage,
    collected: nextCollected,
  })
}

/**
 * Which endpoint to hit and which per-request filters to UNION. Both search
 * endpoints AND-match `personIds`, so "any of these people" is one request
 * per person. A smart-search `query` with no people is a single request.
 */
const buildSearchPlan = ({
  personIds,
  query,
}: {
  personIds: readonly string[]
  query: string
}): {
  searchPath: string
  searchFiltersList: readonly Record<string, unknown>[]
} => {
  if (query.length === 0) {
    return {
      searchPath: "/api/search/metadata",
      searchFiltersList: personIds.map((personId) => ({
        personIds: [personId],
      })),
    }
  }
  if (personIds.length === 0) {
    return {
      searchPath: "/api/search/smart",
      searchFiltersList: [{ query }],
    }
  }
  return {
    searchPath: "/api/search/smart",
    searchFiltersList: personIds.map((personId) => ({
      query,
      personIds: [personId],
    })),
  }
}

/**
 * Cached UNION of image assets across the given people (any-of, deduped by
 * id), each carrying its creation timestamp. A non-empty `query` switches
 * the source to Immich smart search (same union pattern; with no people it
 * is a single people-less smart search).
 */
export const buildAssetPool = async ({
  config,
  personIds,
  query,
}: {
  config: ImmichConfig
  personIds: readonly string[]
  query?: string
}): Promise<readonly AssetPoolEntry[]> => {
  const trimmedQuery = query?.trim() ?? ""
  const cacheKey = JSON.stringify({
    query: trimmedQuery,
    personIds: Array.from(personIds).sort(),
  })
  const cached = poolCache.get(cacheKey)
  if (
    cached &&
    Date.now() - cached.builtAtMs < POOL_TTL_MILLISECONDS
  ) {
    return cached.entries
  }

  const { searchPath, searchFiltersList } = buildSearchPlan(
    { personIds, query: trimmedQuery },
  )
  const perSearch = await Promise.all(
    searchFiltersList.map((searchFilters) =>
      fetchSearchPoolEntries({
        config,
        searchPath,
        searchFilters,
      }),
    ),
  )
  const entriesById = new Map(
    perSearch
      .flat()
      .map((entry) => [entry.id, entry] as const),
  )
  const entries = Array.from(entriesById.values())
  poolCache.set(cacheKey, {
    builtAtMs: Date.now(),
    entries,
  })
  console.log(
    `[inkcast] immich pool: ${searchFiltersList.length} search(es) → ${entries.length} unique assets`,
  )
  return entries
}

/**
 * Exponential recency decay: 1 for a photo taken now, 0.5 after one
 * half-life, floored at 0.15 so old photos still appear. Unknown creation
 * times (createdAtMs 0) land on the floor.
 */
export const computeRecencyWeight = ({
  createdAtMs,
  nowMs,
  halfLifeDays,
}: {
  createdAtMs: number
  nowMs: number
  halfLifeDays: number
}) => {
  const ageDays =
    (nowMs - createdAtMs) / MILLISECONDS_PER_DAY
  return Math.max(
    RECENCY_WEIGHT_FLOOR,
    0.5 ** (ageDays / halfLifeDays),
  )
}

/**
 * Index into `weights` selected by a cumulative-sum walk over one uniform
 * `randomValue` draw in [0, 1). Returns -1 for an empty list; falls back to
 * a uniform pick when the weights sum to zero.
 */
export const pickWeightedIndex = ({
  weights,
  randomValue,
}: {
  weights: readonly number[]
  randomValue: number
}) => {
  if (weights.length === 0) {
    return -1
  }
  const totalWeight = weights.reduce(
    (sum, weight) => sum + weight,
    0,
  )
  if (totalWeight <= 0) {
    return Math.min(
      weights.length - 1,
      Math.floor(randomValue * weights.length),
    )
  }
  const targetWeight = randomValue * totalWeight
  const cumulativeSums = weights.reduce(
    (sums: readonly number[], weight) =>
      sums.concat((sums.at(-1) ?? 0) + weight),
    [],
  )
  const foundIndex = cumulativeSums.findIndex(
    (cumulativeSum) => targetWeight < cumulativeSum,
  )
  return foundIndex === -1 ? weights.length - 1 : foundIndex
}

/**
 * One recency-weighted random image asset from the union pool (newer photos
 * are more likely; see computeRecencyWeight), or null if the pool is empty.
 */
export const pickRandomAssetId = async ({
  config,
  personIds,
  query,
  recencyHalfLifeDays = DEFAULT_RECENCY_HALF_LIFE_DAYS,
}: {
  config: ImmichConfig
  personIds: readonly string[]
  query?: string
  recencyHalfLifeDays?: number
}): Promise<string | null> => {
  const pool = await buildAssetPool({
    config,
    personIds,
    query,
  })
  if (pool.length === 0) {
    return null
  }
  const nowMs = Date.now()
  const weights = pool.map((entry) =>
    computeRecencyWeight({
      createdAtMs: entry.createdAtMs,
      nowMs,
      halfLifeDays: recencyHalfLifeDays,
    }),
  )
  const pickedIndex = pickWeightedIndex({
    weights,
    randomValue: Math.random(),
  })
  return pool[pickedIndex]?.id ?? null
}

/**
 * Up to `count` DISTINCT recency-weighted random asset ids from the union pool
 * (weighted pick-without-replacement; newer photos more likely). Returns fewer
 * than `count` only when the pool is smaller. Used to gather candidates for the
 * dual-portrait layout, which then keeps the first two that are portrait.
 */
export const pickRandomAssetIds = async ({
  config,
  personIds,
  query,
  recencyHalfLifeDays = DEFAULT_RECENCY_HALF_LIFE_DAYS,
  count,
}: {
  config: ImmichConfig
  personIds: readonly string[]
  query?: string
  recencyHalfLifeDays?: number
  count: number
}): Promise<readonly string[]> => {
  const pool = await buildAssetPool({
    config,
    personIds,
    query,
  })
  if (pool.length === 0) {
    return []
  }
  const nowMs = Date.now()

  const drawWithoutReplacement = ({
    remaining,
    picked,
  }: {
    remaining: readonly AssetPoolEntry[]
    picked: readonly string[]
  }): readonly string[] => {
    if (picked.length >= count || remaining.length === 0) {
      return picked
    }
    const weights = remaining.map((entry) =>
      computeRecencyWeight({
        createdAtMs: entry.createdAtMs,
        nowMs,
        halfLifeDays: recencyHalfLifeDays,
      }),
    )
    const pickedIndex = pickWeightedIndex({
      weights,
      randomValue: Math.random(),
    })
    const pickedEntry = remaining[pickedIndex]
    return drawWithoutReplacement({
      remaining: remaining.filter(
        (_entry, entryIndex) => entryIndex !== pickedIndex,
      ),
      picked: pickedEntry
        ? picked.concat(pickedEntry.id)
        : picked,
    })
  }

  return drawWithoutReplacement({
    remaining: pool,
    picked: [],
  })
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
