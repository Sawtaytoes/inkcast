import type {
  AgendaData,
  AgendaEvent,
  NowPlayingData,
  WeatherData,
} from "../state/viewDataStore.ts"

/**
 * Parsers for the view-data payloads Home Assistant PUSHES to Inkcast over MQTT
 * (`inkcast/<device>/{now_playing,weather,agenda}/set`). Inkcast never reads HA
 * — it renders whatever HA hands it here. See
 * docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
 *
 * Each parser is defensive: HA templates can emit partial/empty payloads, so a
 * malformed field degrades to a sensible default rather than throwing.
 */

/** What a now-playing view shows when nothing is playing / no payload yet. */
export const IDLE_NOW_PLAYING: NowPlayingData = {
  artist: "—",
  title: "Nothing playing",
  isPlaying: false,
}

/**
 * YouTube titles (and YouTube Music) decorate text with ♫/♪ notes and emoji
 * (🐦 📚 …). The panel font (Atkinson Hyperlegible) has no emoji glyphs, so
 * they render as ▯ tofu boxes and waste width — strip both from every field.
 * A render-time safety net: HA is free to clean titles too, but this guarantees
 * the panel never shows tofu regardless of what it is handed.
 */
export const stripDecorativeNotes = (value: string) =>
  value
    // Zero-width joiner + variation selectors glue emoji sequences together;
    // drop them (not to a space), each on its own so the character class can't
    // match a joined sequence.
    .replace(/\u{200D}/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    // Emoji/pictographs, dingbats & symbols, arrows, misc symbols, and bullets.
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2022}]/gu,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim()

const readString = (value: unknown): string =>
  typeof value === "string"
    ? stripDecorativeNotes(value)
    : ""

/**
 * `{ title, artist?, album?, isPlaying, artwork? }` → now-playing view data.
 * `artwork` is a URL Inkcast fetches (stored as `artworkPath`). A payload with
 * neither title nor artist renders the idle placeholder.
 */
export const parseNowPlayingPayload = (
  payload: unknown,
): NowPlayingData => {
  if (typeof payload !== "object" || payload === null) {
    return IDLE_NOW_PLAYING
  }
  const record = payload as Record<string, unknown>

  const artist = readString(record.artist)
  const title = readString(record.title)
  if (!artist && !title) {
    return IDLE_NOW_PLAYING
  }

  const album = readString(record.album)
  const artworkPath =
    typeof record.artwork === "string" &&
    record.artwork.length > 0
      ? record.artwork
      : undefined

  return {
    artist: artist || "—",
    title: title || "—",
    ...(album ? { album } : {}),
    isPlaying: record.isPlaying === true,
    ...(artworkPath ? { artworkPath } : {}),
  }
}

/** HA weather-entity condition codes → panel-friendly text. */
const WEATHER_CONDITION_TEXT: Record<string, string> = {
  "clear-night": "Clear night",
  cloudy: "Cloudy",
  exceptional: "Severe weather",
  fog: "Fog",
  hail: "Hail",
  lightning: "Lightning",
  "lightning-rainy": "Thunderstorms",
  partlycloudy: "Partly cloudy",
  pouring: "Pouring",
  rainy: "Rainy",
  snowy: "Snowy",
  "snowy-rainy": "Sleet",
  sunny: "Sunny",
  windy: "Windy",
  "windy-variant": "Windy",
}

/**
 * `{ temperature: number, condition?: string }` → weather view data, or null
 * when there is no usable temperature yet. Temperature rounding + the condition
 * text map are presentation (Inkcast's job); HA sends the raw values.
 */
export const parseWeatherPayload = (
  payload: unknown,
): WeatherData | null => {
  if (typeof payload !== "object" || payload === null) {
    return null
  }
  const record = payload as Record<string, unknown>
  const temperature = record.temperature
  if (typeof temperature !== "number") {
    return null
  }

  const condition =
    typeof record.condition === "string"
      ? record.condition
      : ""

  return {
    temperatureText: `${Math.round(temperature)}°`,
    conditionText:
      WEATHER_CONDITION_TEXT[condition] ??
      (condition === "unavailable" ||
      condition === "unknown"
        ? ""
        : condition),
  }
}

const toStartMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/**
 * `{ events: [{ start: epochMs | ISO, summary, isAllDay? }] }` → agenda data,
 * sorted ascending by start. Events without a usable start or summary are
 * dropped. The registry filters to "upcoming" and slices to the panel budget.
 */
export const parseAgendaPayload = (
  payload: unknown,
): AgendaData => {
  if (typeof payload !== "object" || payload === null) {
    return { events: [] }
  }
  const record = payload as Record<string, unknown>
  const rawEvents = Array.isArray(record.events)
    ? record.events
    : []

  const events: AgendaEvent[] = rawEvents
    .map((rawEvent): AgendaEvent | null => {
      if (
        typeof rawEvent !== "object" ||
        rawEvent === null
      ) {
        return null
      }
      const eventRecord = rawEvent as Record<
        string,
        unknown
      >
      const startMs = toStartMs(eventRecord.start)
      const summary =
        typeof eventRecord.summary === "string"
          ? eventRecord.summary.trim()
          : ""
      if (startMs === null || !summary) {
        return null
      }
      return {
        startMs,
        summary,
        isAllDay: eventRecord.isAllDay === true,
      }
    })
    .filter((event): event is AgendaEvent => event !== null)
    .sort(
      (firstEvent, secondEvent) =>
        firstEvent.startMs - secondEvent.startMs,
    )

  return { events }
}
