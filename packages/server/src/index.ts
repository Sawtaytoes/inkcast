import { resolve } from "node:path"
import {
  DITHER_ALGORITHMS,
  type DitherAlgorithm,
} from "@castkit/core/devices/device"
import type { FullColourEncoding } from "@castkit/core/pipeline/dither"
import type { ConfigKnob } from "@castkit/shared/framework/configKnob"
import { serve } from "@hono/node-server"
import { createPhotoFrameAdapter } from "./adapters/photoFrameAdapter.ts"
import { createApp } from "./app.ts"
import { createBrowserMode } from "./browser/browserMode.ts"
import {
  type ConfiguredDevice,
  loadConfig,
} from "./config/env.ts"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
  buildGlobalDiscoveryMessages,
  buildGlobalTopics,
} from "./homeAssistant/discovery.ts"
import { createMqttPublisher } from "./mqtt/publisher.ts"
import {
  parseAgendaPayload,
  parseNowPlayingPayload,
  parseWeatherPayload,
} from "./mqtt/viewDataPayloads.ts"
import { createPushController } from "./pushController.ts"
import { fetchArtworkDataUri } from "./render/artworkFetch.ts"
import { createRenderService } from "./render/renderService.ts"
import { startClockTicker } from "./schedulers/clockTicker.ts"
import {
  type ClockDateStyle,
  type ClockDateStyleSetting,
  type ClockTimeFormat,
  type ClockTimeFormatSetting,
  CROP_EDGES,
  type CropEdge,
  createDeviceConfigStore,
  type PanelRotation,
  type PhotoFormat,
  type PhotoFormatSetting,
} from "./state/deviceConfigStore.ts"
import { createDeviceStore } from "./state/deviceStore.ts"
import { createViewDataStore } from "./state/viewDataStore.ts"
import {
  getIsClockBearingView,
  getIsNowPlayingView,
  getIsViewName,
  VIEW_NAMES,
  type ViewName,
} from "./views/registry.ts"

/**
 * Inkcast server entrypoint. Boots the render engine + MQTT bridge, advertises
 * every device to Home Assistant via MQTT discovery, subscribes to the HA
 * command topics, pushes an initial frame per device, and serves the HTTP API.
 */
/**
 * Load a local `.env` if present (gitignored) — from the working directory
 * or the repo root (so `yarn workspace @castkit/server dev`, whose cwd is
 * `packages/server`, finds it too). In containers, env is usually passed
 * directly, so a missing file is fine.
 */
const loadEnvironmentFile = () => {
  const candidatePaths = [
    resolve(process.cwd(), ".env"),
    // packages/server/{src,dist}/index.* → the repo root.
    resolve(import.meta.dirname, "../../../.env"),
  ]

  candidatePaths.some((candidatePath) => {
    try {
      process.loadEnvFile(candidatePath)
      return true
    } catch {
      return false
    }
  })
}

const getIsDitherAlgorithm = (
  value: string,
): value is DitherAlgorithm =>
  (DITHER_ALGORITHMS as readonly string[]).includes(value)

// Fallback defaults for the Photo Frame tuning knobs, used until the HA config
// entities (global default + per-device override) restore/seed their retained
// state. Formerly the INKCAST_PHOTO_MINUTES / _RECENCY_HALF_LIFE_DAYS env vars.
const DEFAULT_PHOTO_INTERVAL_MINUTES = 10
const DEFAULT_PHOTO_RECENCY_HALF_LIFE_DAYS = 365
// The full-colour photo format shipped until an HA config entity overrides it.
// JPEG (not WebP) because the only current photo panel is an ARMv6 Pi that
// SIGILLs on WebP decode — see the JPEG-not-WebP decision record.
const DEFAULT_PHOTO_FORMAT: PhotoFormat = "jpeg"
const DEFAULT_PHOTO_QUALITY = 80

/**
 * Canonicalize an HA photo-format option payload ("Auto"/"JPEG"/"WebP"/"PNG",
 * any case) to a per-device setting, or null if unrecognized. "Auto" = inherit
 * the global default.
 */
const parsePhotoFormatSetting = (
  payload: string,
): PhotoFormatSetting | null => {
  const normalized = payload.trim().toLowerCase()
  if (normalized === "auto") {
    return "auto"
  }
  return (
    (["jpeg", "webp", "png"] as const).find(
      (format) => format === normalized,
    ) ?? null
  )
}

/**
 * The exact HA option string for a stored photo-format setting — must match the
 * select's `options` casing ("WebP", not "WEBP") so HA accepts the round-tripped
 * retained state.
 */
const PHOTO_FORMAT_OPTION_BY_SETTING: Record<
  PhotoFormatSetting,
  string
> = {
  auto: "Auto",
  jpeg: "JPEG",
  webp: "WebP",
  png: "PNG",
}

// Clock defaults, used until an HA config entity (global default + per-device
// override) overrides them: 12-hour time, long dates, and the process `TZ`
// (an empty timezone string). Time is Inkcast's own clock; only the format +
// zone are MQTT config.
const DEFAULT_CLOCK_TIME_FORMAT: ClockTimeFormat = "12h"
const DEFAULT_CLOCK_DATE_STYLE: ClockDateStyle = "long"

/** The exact HA option string for a time-format setting (matches the select). */
const CLOCK_TIME_FORMAT_OPTION_BY_SETTING: Record<
  ClockTimeFormatSetting,
  string
> = {
  auto: "Auto",
  "12h": "12-hour",
  "24h": "24-hour",
}

/** Canonicalize an HA time-format option payload to a setting, or null. */
const parseClockTimeFormatSetting = (
  payload: string,
): ClockTimeFormatSetting | null => {
  const normalized = payload.trim().toLowerCase()
  if (normalized === "auto") {
    return "auto"
  }
  if (
    normalized === "12-hour" ||
    normalized === "12h" ||
    normalized === "12"
  ) {
    return "12h"
  }
  if (
    normalized === "24-hour" ||
    normalized === "24h" ||
    normalized === "24"
  ) {
    return "24h"
  }
  return null
}

/** The exact HA option string for a date-style setting (matches the select). */
const CLOCK_DATE_STYLE_OPTION_BY_SETTING: Record<
  ClockDateStyleSetting,
  string
> = {
  auto: "Auto",
  long: "Long",
  numeric: "Numeric",
}

/** Canonicalize an HA date-style option payload to a setting, or null. */
const parseClockDateStyleSetting = (
  payload: string,
): ClockDateStyleSetting | null => {
  const normalized = payload.trim().toLowerCase()
  if (normalized === "auto") {
    return "auto"
  }
  if (normalized === "long") {
    return "long"
  }
  if (normalized === "numeric") {
    return "numeric"
  }
  return null
}

const ROTATION_VALUES: readonly PanelRotation[] = [
  0, 90, 180, 270,
]

/** Parse an HA rotation-select payload ("0"/"90"/"180"/"270") to a PanelRotation, or null. */
const parseRotation = (
  payload: string,
): PanelRotation | null => {
  const value = Number.parseInt(payload, 10)
  return (
    ROTATION_VALUES.find(
      (rotation) => rotation === value,
    ) ?? null
  )
}

/** Parse + clamp an HA number-entity payload ("50".."200", % steps). */
const parsePercentPayload = (payload: string) => {
  const value = Number.parseFloat(payload)
  if (Number.isNaN(value)) {
    return null
  }
  return Math.min(200, Math.max(50, Math.round(value)))
}

/** Parse + clamp a crop-inset HA number-entity payload ("0".."200" px). */
const parsePixelPayload = (payload: string) => {
  const value = Number.parseFloat(payload)
  if (Number.isNaN(value)) {
    return null
  }
  return Math.min(200, Math.max(0, Math.round(value)))
}

/** Parse + clamp an integer HA number-entity payload into [min, max]. */
const parseBoundedInteger = ({
  payload,
  min,
  max,
}: {
  payload: string
  min: number
  max: number
}) => {
  const value = Number.parseFloat(payload)
  if (Number.isNaN(value)) {
    return null
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** The config-knob kind key for a crop edge (matches the MQTT topic slug). */
const getCropKnobKind = (edge: CropEdge) => `crop_${edge}`

// The ConfigKnob framework type lives in @castkit/shared — both client modes
// use retained-MQTT-state-as-persistence knobs.

const main = async () => {
  loadEnvironmentFile()

  const config = loadConfig()
  const { baseTopic } = config.mqtt

  const publisher = await createMqttPublisher({
    config: config.mqtt,
    availabilityTopic: buildAvailabilityTopic(baseTopic),
  })
  const renderService = await createRenderService({
    engineName: config.renderEngine,
  })
  const deviceStore = createDeviceStore({
    deviceIds: config.devices.map((device) => device.id),
  })
  const viewDataStore = createViewDataStore()
  const deviceConfigStore = createDeviceConfigStore()

  // The photo rotation interval and photo recency half-life are HA config
  // (global default on the Inkcast Server device + a per-screen override),
  // resolved live from the config store — no env vars. See docs/decisions/
  // 2026-07-03-user-tunable-view-settings-are-ha-config-entities.md.
  const resolvePhotoIntervalMinutes = (
    deviceId: string,
  ) => {
    const perDevice =
      deviceConfigStore.getPhotoIntervalMinutes(deviceId)
    if (perDevice !== undefined && perDevice > 0) {
      return perDevice
    }
    const global =
      deviceConfigStore.getGlobalPhotoIntervalMinutes()
    if (global !== undefined && global > 0) {
      return global
    }
    return DEFAULT_PHOTO_INTERVAL_MINUTES
  }
  const resolvePhotoRecencyHalfLifeDays = (
    deviceId: string,
  ) => {
    const perDevice =
      deviceConfigStore.getPhotoRecencyHalfLifeDays(
        deviceId,
      )
    if (perDevice !== undefined && perDevice > 0) {
      return perDevice
    }
    const global =
      deviceConfigStore.getGlobalPhotoRecencyHalfLifeDays()
    if (global !== undefined && global > 0) {
      return global
    }
    return DEFAULT_PHOTO_RECENCY_HALF_LIFE_DAYS
  }
  // The photo wire format + lossy quality, resolved per device: a real
  // per-device value wins; "Auto"/0 (or unset) inherit the global default; and
  // if neither is set the ARMv6-safe fallback (JPEG q80) applies.
  const resolvePhotoEncoding = (
    deviceId: string,
  ): FullColourEncoding => {
    const perDeviceFormat =
      deviceConfigStore.getPhotoFormat(deviceId)
    const format: PhotoFormat =
      perDeviceFormat && perDeviceFormat !== "auto"
        ? perDeviceFormat
        : (deviceConfigStore.getGlobalPhotoFormat() ??
          DEFAULT_PHOTO_FORMAT)

    const perDeviceQuality =
      deviceConfigStore.getPhotoQuality(deviceId)
    const quality =
      perDeviceQuality !== undefined && perDeviceQuality > 0
        ? perDeviceQuality
        : (deviceConfigStore.getGlobalPhotoQuality() ??
          DEFAULT_PHOTO_QUALITY)

    return { format, quality }
  }
  // The clock timezone + time/date format, resolved per device: a real
  // per-device value wins; "Auto"/empty inherit the global default; and if
  // neither is set, the process `TZ` + 12-hour + long-date fallbacks apply.
  const resolveClockConfig = (deviceId: string) => {
    const timezone =
      deviceConfigStore.getClockTimezone(deviceId) ||
      deviceConfigStore.getGlobalClockTimezone()
    const timeFormatSetting =
      deviceConfigStore.getClockTimeFormat(deviceId)
    const timeFormat: ClockTimeFormat =
      timeFormatSetting && timeFormatSetting !== "auto"
        ? timeFormatSetting
        : (deviceConfigStore.getGlobalClockTimeFormat() ??
          DEFAULT_CLOCK_TIME_FORMAT)
    const dateStyleSetting =
      deviceConfigStore.getClockDateStyle(deviceId)
    const dateStyle: ClockDateStyle =
      dateStyleSetting && dateStyleSetting !== "auto"
        ? dateStyleSetting
        : (deviceConfigStore.getGlobalClockDateStyle() ??
          DEFAULT_CLOCK_DATE_STYLE)
    return {
      timeZone: timezone || undefined,
      isTwelveHour: timeFormat === "12h",
      isNumericDate: dateStyle === "numeric",
    }
  }

  const pushController = createPushController({
    devices: config.devices,
    deviceStore,
    deviceConfigStore,
    viewDataStore,
    renderService,
    publisher,
    baseTopic,
    resolvePhotoEncoding,
    resolveClockConfig,
  })

  const pushDeviceLogged = (deviceId: string) => {
    pushController.pushDevice(deviceId).catch((error) => {
      console.error(
        `[inkcast] push failed for ${deviceId}`,
        error,
      )
    })
  }

  /** Push every device whose SELECTED view matches, without awaiting. */
  const pushDevicesShowingView = ({
    getIsViewIncluded,
  }: {
    getIsViewIncluded: (viewName: ViewName) => boolean
  }) => {
    config.devices
      .filter((device) =>
        getIsViewIncluded(
          deviceStore.getActiveView(device.id),
        ),
      )
      .forEach((device) => {
        pushDeviceLogged(device.id)
      })
  }

  // MQTT data-in: Home Assistant PUSHES each display its now-playing / weather /
  // agenda payload (`inkcast/<device>/{now_playing,weather,agenda}/set`);
  // Inkcast parses it into the view-data store and re-pushes that display if the
  // affected view is showing. Inkcast never reads HA — all source/priority/
  // exclusion logic lives in the HA templates that produce these payloads. See
  // docs/decisions/2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
  //
  // Payloads are JSON; the per-view parsers are defensive, so a non-JSON or
  // empty payload degrades to the view's idle placeholder rather than throwing.
  const parseJsonPayload = (payload: string): unknown => {
    try {
      return JSON.parse(payload)
    } catch {
      return undefined
    }
  }
  const applyNowPlayingPayload = async ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    const nowPlaying = parseNowPlayingPayload(
      parseJsonPayload(payload),
    )
    // The artwork URL HA pushed is fetched + inlined for the render engines;
    // the URL itself is the cache key (HA rotates it when the art changes).
    const artworkDataUri = nowPlaying.artworkPath
      ? await fetchArtworkDataUri({
          url: nowPlaying.artworkPath,
        })
      : undefined
    viewDataStore.setNowPlaying({
      deviceId,
      data: artworkDataUri
        ? { ...nowPlaying, artworkDataUri }
        : nowPlaying,
    })
    if (
      getIsNowPlayingView(
        deviceStore.getActiveView(deviceId),
      )
    ) {
      pushDeviceLogged(deviceId)
    }
  }

  const applyWeatherPayload = ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    const weather = parseWeatherPayload(
      parseJsonPayload(payload),
    )
    if (!weather) {
      return
    }
    viewDataStore.setWeather({ deviceId, data: weather })
    if (
      deviceStore.getActiveView(deviceId) ===
      "Clock (Weather)"
    ) {
      pushDeviceLogged(deviceId)
    }
  }

  const applyAgendaPayload = ({
    deviceId,
    payload,
  }: {
    deviceId: string
    payload: string
  }) => {
    viewDataStore.setAgenda({
      deviceId,
      data: parseAgendaPayload(parseJsonPayload(payload)),
    })
    if (
      deviceStore.getActiveView(deviceId) ===
      "Clock (Agenda)"
    ) {
      pushDeviceLogged(deviceId)
    }
  }

  // Keep clock-bearing panels on real time: re-push them each minute. This
  // also keeps the agenda view honest — the minute tick re-renders it, dropping
  // events that have just started and promoting the next one.
  const clockTicker = startClockTicker({
    onMinuteTick: () => {
      pushDevicesShowingView({
        getIsViewIncluded: getIsClockBearingView,
      })
    },
  })

  /** Re-push every device showing the Photo Frame (global format/quality changed). */
  const refreshAllPhotoFrameDevices = () => {
    config.devices
      .filter(
        (device) =>
          deviceStore.getActiveView(device.id) ===
          "Photo Frame",
      )
      .forEach((device) => {
        pushDeviceLogged(device.id)
      })
  }

  // Immich photo frame: rotates a recency-weighted random photo of the
  // configured people/query on an interval — for devices SHOWING the Photo
  // Frame (selected or idle-fallback). Enabled only when Immich credentials
  // are set.
  const hasPhotoFrameAdapter = Boolean(
    config.immich.url && config.immich.apiKey,
  )
  const photoFrameAdapter = hasPhotoFrameAdapter
    ? createPhotoFrameAdapter({
        immichConfig: {
          url: config.immich.url,
          apiKey: config.immich.apiKey,
        },
        getIntervalMinutes: resolvePhotoIntervalMinutes,
        getRecencyHalfLifeDays:
          resolvePhotoRecencyHalfLifeDays,
        devices: config.devices,
        deviceConfigStore,
        viewDataStore,
        getActiveView: deviceStore.getActiveView,
        pushDevice: (deviceId) =>
          pushController.pushDevice(deviceId),
      })
    : null

  /** Clear the current photo and fetch a fresh one (people/query changed). */
  const restartPhotoFrame = async (deviceId: string) => {
    viewDataStore.setPhotoFrame({
      deviceId,
      data: undefined,
    })
    await photoFrameAdapter?.refreshDevice(deviceId)
  }

  if (publisher.isEnabled) {
    // Advertise every device + the server-wide config device to HA
    // (retained discovery configs).
    const discoveryConfig = {
      discoveryPrefix: config.mqtt.discoveryPrefix,
      nodeId: config.mqtt.nodeId,
      baseTopic,
    }
    await Promise.all(
      config.devices
        .flatMap((device) =>
          buildDiscoveryMessages({
            device,
            viewNames: VIEW_NAMES,
            config: discoveryConfig,
          }),
        )
        .concat(
          buildGlobalDiscoveryMessages(discoveryConfig),
        )
        .map((message) =>
          publisher.publish({
            topic: message.topic,
            payload: JSON.stringify(message.payload),
            isRetained: message.isRetained,
          }),
        ),
    )

    // The HA-editable config knobs, all following one shape: a command
    // topic (user edits), a retained state topic (HA display + boot-time
    // restore — retained MQTT is the persistence layer, no config file).
    const configKnobs: ReadonlyMap<string, ConfigKnob> =
      new Map([
        [
          "photoPeople",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setPhotoPeople({
                deviceId,
                peopleText: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getPhotoPeople(deviceId),
              ),
            onApplied: restartPhotoFrame,
          },
        ],
        [
          "photoQuery",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setPhotoQuery({
                deviceId,
                queryText: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getPhotoQuery(deviceId),
              ),
            onApplied: restartPhotoFrame,
          },
        ],
        [
          // 0 = inherit the global default (a number entity always has a
          // value, so 0 is the "unset" sentinel).
          "photoInterval",
          {
            applyPayload: ({ deviceId, payload }) => {
              const minutes = parseBoundedInteger({
                payload,
                min: 0,
                max: 1440,
              })
              if (minutes === null) {
                return null
              }
              deviceConfigStore.setPhotoIntervalMinutes({
                deviceId,
                minutes,
              })
              return String(minutes)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoIntervalMinutes(
                deviceId,
              ) !== undefined,
            // Read live on the next rotation tick — no immediate re-render.
          },
        ],
        [
          "photoRecency",
          {
            applyPayload: ({ deviceId, payload }) => {
              const days = parseBoundedInteger({
                payload,
                min: 0,
                max: 3650,
              })
              if (days === null) {
                return null
              }
              deviceConfigStore.setPhotoRecencyHalfLifeDays(
                {
                  deviceId,
                  days,
                },
              )
              return String(days)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoRecencyHalfLifeDays(
                deviceId,
              ) !== undefined,
            // Read live on the next random pick — no immediate re-render.
          },
        ],
        [
          "photoFormat",
          {
            applyPayload: ({ deviceId, payload }) => {
              const setting =
                parsePhotoFormatSetting(payload)
              if (setting === null) {
                return null
              }
              deviceConfigStore.setPhotoFormat({
                deviceId,
                format: setting,
              })
              return PHOTO_FORMAT_OPTION_BY_SETTING[setting]
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoFormat(deviceId) !==
              undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          // 0 = inherit the global default (a number entity always has a
          // value, so 0 is the "unset" sentinel).
          "photoQuality",
          {
            applyPayload: ({ deviceId, payload }) => {
              const quality = parseBoundedInteger({
                payload,
                min: 0,
                max: 100,
              })
              if (quality === null) {
                return null
              }
              deviceConfigStore.setPhotoQuality({
                deviceId,
                quality,
              })
              return String(quality)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getPhotoQuality(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "clockTimezone",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setClockTimezone({
                deviceId,
                timezone: payload.trim(),
              })
              return payload.trim()
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getClockTimezone(
                  deviceId,
                ),
              ),
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "clockTimeFormat",
          {
            applyPayload: ({ deviceId, payload }) => {
              const setting =
                parseClockTimeFormatSetting(payload)
              if (setting === null) {
                return null
              }
              deviceConfigStore.setClockTimeFormat({
                deviceId,
                setting,
              })
              return CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
                setting
              ]
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getClockTimeFormat(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "clockDateStyle",
          {
            applyPayload: ({ deviceId, payload }) => {
              const setting =
                parseClockDateStyleSetting(payload)
              if (setting === null) {
                return null
              }
              deviceConfigStore.setClockDateStyle({
                deviceId,
                setting,
              })
              return CLOCK_DATE_STYLE_OPTION_BY_SETTING[
                setting
              ]
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getClockDateStyle(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "dither",
          {
            applyPayload: ({ deviceId, payload }) => {
              if (!getIsDitherAlgorithm(payload)) {
                return null
              }
              deviceConfigStore.setDitherAlgorithm({
                deviceId,
                algorithm: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getDitherAlgorithm(
                  deviceId,
                ),
              ),
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "rotation",
          {
            applyPayload: ({ deviceId, payload }) => {
              const rotation = parseRotation(payload)
              if (rotation === null) {
                return null
              }
              deviceConfigStore.setRotationOverride({
                deviceId,
                rotation,
              })
              return String(rotation)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getRotationOverride(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "colourMode",
          {
            applyPayload: ({ deviceId, payload }) => {
              if (
                payload !== "Color" &&
                payload !== "Black & White"
              ) {
                return null
              }
              deviceConfigStore.setColourModeOverride({
                deviceId,
                colourMode:
                  payload === "Color" ? "color" : "bw",
              })
              return payload
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getColourModeOverride(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "brightness",
          {
            applyPayload: ({ deviceId, payload }) => {
              const percent = parsePercentPayload(payload)
              if (percent === null) {
                return null
              }
              deviceConfigStore.setBrightnessPercent({
                deviceId,
                percent,
              })
              return String(percent)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getBrightnessPercent(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        [
          "saturation",
          {
            applyPayload: ({ deviceId, payload }) => {
              const percent = parsePercentPayload(payload)
              if (percent === null) {
                return null
              }
              deviceConfigStore.setSaturationPercent({
                deviceId,
                percent,
              })
              return String(percent)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getSaturationPercent(
                deviceId,
              ) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ],
        // One crop-inset knob per edge — the mat safe area, tuned live per
        // device (a reframed / unmatted unit can differ).
        ...CROP_EDGES.map((edge): [string, ConfigKnob] => [
          getCropKnobKind(edge),
          {
            applyPayload: ({ deviceId, payload }) => {
              const pixels = parsePixelPayload(payload)
              if (pixels === null) {
                return null
              }
              deviceConfigStore.setCropInset({
                deviceId,
                edge,
                pixels,
              })
              return String(pixels)
            },
            getHasValue: (deviceId) =>
              deviceConfigStore.getCropInset({
                deviceId,
                edge,
              }) !== undefined,
            onApplied: async (deviceId) => {
              await pushController.pushDevice(deviceId)
            },
          },
        ]),
      ])

    /** Knob kind → its command/state topics for one device. */
    const getKnobTopics = ({
      device,
      kind,
    }: {
      device: ConfiguredDevice
      kind: string
    }) => {
      const topics = buildDeviceTopics({
        baseTopic,
        device,
      })
      const byKind: Record<
        string,
        { command: string; state: string }
      > = {
        photoInterval: {
          command: topics.photoIntervalCommand,
          state: topics.photoIntervalState,
        },
        photoRecency: {
          command: topics.photoRecencyCommand,
          state: topics.photoRecencyState,
        },
        photoFormat: {
          command: topics.photoFormatCommand,
          state: topics.photoFormatState,
        },
        photoQuality: {
          command: topics.photoQualityCommand,
          state: topics.photoQualityState,
        },
        photoPeople: {
          command: topics.photoPeopleCommand,
          state: topics.photoPeopleState,
        },
        photoQuery: {
          command: topics.photoQueryCommand,
          state: topics.photoQueryState,
        },
        clockTimezone: {
          command: topics.clockTimezoneCommand,
          state: topics.clockTimezoneState,
        },
        clockTimeFormat: {
          command: topics.clockTimeFormatCommand,
          state: topics.clockTimeFormatState,
        },
        clockDateStyle: {
          command: topics.clockDateStyleCommand,
          state: topics.clockDateStyleState,
        },
        dither: {
          command: topics.ditherCommand,
          state: topics.ditherState,
        },
        rotation: {
          command: topics.rotationCommand,
          state: topics.rotationState,
        },
        colourMode: {
          command: topics.colourModeCommand,
          state: topics.colourModeState,
        },
        brightness: {
          command: topics.brightnessCommand,
          state: topics.brightnessState,
        },
        saturation: {
          command: topics.saturationCommand,
          state: topics.saturationState,
        },
        crop_top: {
          command: topics.cropTopCommand,
          state: topics.cropTopState,
        },
        crop_right: {
          command: topics.cropRightCommand,
          state: topics.cropRightState,
        },
        crop_bottom: {
          command: topics.cropBottomCommand,
          state: topics.cropBottomState,
        },
        crop_left: {
          command: topics.cropLeftCommand,
          state: topics.cropLeftState,
        },
      }
      return byKind[kind]
    }

    type TopicRoute = {
      /** "" for server-wide (global) topics. */
      deviceId: string
      kind:
        | "refresh"
        | "view"
        | "viewRestore"
        | "photoNext"
        | "photoPrevious"
        | "nowPlayingData"
        | "weatherData"
        | "agendaData"
        | "knob"
        | "globalKnob"
      /** Set when kind is "knob" or "globalKnob". */
      knobKind?: string
      /** True for a knob's retained-state (boot restore) topic. */
      isRestore?: boolean
    }

    const globalTopics = buildGlobalTopics(baseTopic)

    // The server-wide ("Inkcast Server" device) config knobs — the household
    // defaults each display inherits unless it sets its own override. Same
    // command/retained-state/restore shape as the per-device knobs.
    type GlobalConfigKnob = {
      command: string
      state: string
      /** Store the (valid) payload; returns the normalized retained-state payload, or null to reject. */
      applyPayload: (payload: string) => string | null
      getHasValue: () => boolean
      /** Re-render / re-fetch after a change or a boot-time restore. */
      afterChange?: () => void
      /** Retained-state seed for number knobs (avoids HA showing "unknown"). */
      seedDefault?: string
    }

    const globalConfigKnobs: ReadonlyMap<
      string,
      GlobalConfigKnob
    > = new Map([
      [
        "photoInterval",
        {
          command: globalTopics.photoIntervalCommand,
          state: globalTopics.photoIntervalState,
          applyPayload: (payload) => {
            const minutes = parseBoundedInteger({
              payload,
              min: 1,
              max: 1440,
            })
            if (minutes === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoIntervalMinutes(
              minutes,
            )
            return String(minutes)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoIntervalMinutes() !==
            undefined,
          seedDefault: String(
            DEFAULT_PHOTO_INTERVAL_MINUTES,
          ),
        },
      ],
      [
        "photoRecency",
        {
          command: globalTopics.photoRecencyCommand,
          state: globalTopics.photoRecencyState,
          applyPayload: (payload) => {
            const days = parseBoundedInteger({
              payload,
              min: 1,
              max: 3650,
            })
            if (days === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoRecencyHalfLifeDays(
              days,
            )
            return String(days)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoRecencyHalfLifeDays() !==
            undefined,
          seedDefault: String(
            DEFAULT_PHOTO_RECENCY_HALF_LIFE_DAYS,
          ),
        },
      ],
      [
        "photoFormat",
        {
          command: globalTopics.photoFormatCommand,
          state: globalTopics.photoFormatState,
          applyPayload: (payload) => {
            const setting = parsePhotoFormatSetting(payload)
            // The global default has no "Auto" — it IS the root default.
            if (setting === null || setting === "auto") {
              return null
            }
            deviceConfigStore.setGlobalPhotoFormat(setting)
            return PHOTO_FORMAT_OPTION_BY_SETTING[setting]
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoFormat() !==
            undefined,
          afterChange: refreshAllPhotoFrameDevices,
          seedDefault:
            PHOTO_FORMAT_OPTION_BY_SETTING[
              DEFAULT_PHOTO_FORMAT
            ],
        },
      ],
      [
        "photoQuality",
        {
          command: globalTopics.photoQualityCommand,
          state: globalTopics.photoQualityState,
          applyPayload: (payload) => {
            const quality = parseBoundedInteger({
              payload,
              min: 1,
              max: 100,
            })
            if (quality === null) {
              return null
            }
            deviceConfigStore.setGlobalPhotoQuality(quality)
            return String(quality)
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalPhotoQuality() !==
            undefined,
          afterChange: refreshAllPhotoFrameDevices,
          seedDefault: String(DEFAULT_PHOTO_QUALITY),
        },
      ],
      [
        "clockTimezone",
        {
          command: globalTopics.clockTimezoneCommand,
          state: globalTopics.clockTimezoneState,
          applyPayload: (payload) => {
            deviceConfigStore.setGlobalClockTimezone(
              payload.trim(),
            )
            return payload.trim()
          },
          getHasValue: () =>
            Boolean(
              deviceConfigStore.getGlobalClockTimezone(),
            ),
          afterChange: () => {
            pushDevicesShowingView({
              getIsViewIncluded: getIsClockBearingView,
            })
          },
        },
      ],
      [
        "clockTimeFormat",
        {
          command: globalTopics.clockTimeFormatCommand,
          state: globalTopics.clockTimeFormatState,
          applyPayload: (payload) => {
            const setting =
              parseClockTimeFormatSetting(payload)
            // The global default has no "Auto" — it IS the root default.
            if (setting === null || setting === "auto") {
              return null
            }
            deviceConfigStore.setGlobalClockTimeFormat(
              setting,
            )
            return CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
              setting
            ]
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalClockTimeFormat() !==
            undefined,
          afterChange: () => {
            pushDevicesShowingView({
              getIsViewIncluded: getIsClockBearingView,
            })
          },
          seedDefault:
            CLOCK_TIME_FORMAT_OPTION_BY_SETTING[
              DEFAULT_CLOCK_TIME_FORMAT
            ],
        },
      ],
      [
        "clockDateStyle",
        {
          command: globalTopics.clockDateStyleCommand,
          state: globalTopics.clockDateStyleState,
          applyPayload: (payload) => {
            const setting =
              parseClockDateStyleSetting(payload)
            if (setting === null || setting === "auto") {
              return null
            }
            deviceConfigStore.setGlobalClockDateStyle(
              setting,
            )
            return CLOCK_DATE_STYLE_OPTION_BY_SETTING[
              setting
            ]
          },
          getHasValue: () =>
            deviceConfigStore.getGlobalClockDateStyle() !==
            undefined,
          afterChange: () => {
            pushDevicesShowingView({
              getIsViewIncluded: getIsClockBearingView,
            })
          },
          seedDefault:
            CLOCK_DATE_STYLE_OPTION_BY_SETTING[
              DEFAULT_CLOCK_DATE_STYLE
            ],
        },
      ],
    ])

    const commandRoutes = new Map<string, TopicRoute>()
    config.devices.forEach((device) => {
      const topics = buildDeviceTopics({
        baseTopic,
        device,
      })
      commandRoutes.set(topics.refreshCommand, {
        deviceId: device.id,
        kind: "refresh",
      })
      commandRoutes.set(topics.viewCommand, {
        deviceId: device.id,
        kind: "view",
      })
      // The retained view state restores the pre-restart selection.
      commandRoutes.set(topics.viewState, {
        deviceId: device.id,
        kind: "viewRestore",
      })
      commandRoutes.set(topics.photoNextCommand, {
        deviceId: device.id,
        kind: "photoNext",
      })
      commandRoutes.set(topics.photoPreviousCommand, {
        deviceId: device.id,
        kind: "photoPrevious",
      })
      // HA pushes this display's view data (retained) to these topics.
      commandRoutes.set(topics.nowPlayingDataCommand, {
        deviceId: device.id,
        kind: "nowPlayingData",
      })
      commandRoutes.set(topics.weatherDataCommand, {
        deviceId: device.id,
        kind: "weatherData",
      })
      commandRoutes.set(topics.agendaDataCommand, {
        deviceId: device.id,
        kind: "agendaData",
      })
      Array.from(configKnobs.keys()).forEach((knobKind) => {
        const knobTopics = getKnobTopics({
          device,
          kind: knobKind,
        })
        commandRoutes.set(knobTopics.command, {
          deviceId: device.id,
          kind: "knob",
          knobKind,
          isRestore: false,
        })
        commandRoutes.set(knobTopics.state, {
          deviceId: device.id,
          kind: "knob",
          knobKind,
          isRestore: true,
        })
      })
    })

    // Server-wide ("Inkcast Server" device) knobs: the household defaults any
    // display inherits unless it overrides them. Retained state doubles as
    // boot-time restore.
    Array.from(globalConfigKnobs.entries()).forEach(
      ([knobKind, globalKnob]) => {
        commandRoutes.set(globalKnob.command, {
          deviceId: "",
          kind: "globalKnob",
          knobKind,
          isRestore: false,
        })
        commandRoutes.set(globalKnob.state, {
          deviceId: "",
          kind: "globalKnob",
          knobKind,
          isRestore: true,
        })
      },
    )

    await publisher.subscribe({
      topics: Array.from(commandRoutes.keys()),
      handler: async ({ topic, payload }) => {
        const route = commandRoutes.get(topic)
        if (!route) {
          return
        }

        if (route.kind === "refresh") {
          await pushController.pushDevice(route.deviceId)
          return
        }
        if (route.kind === "globalKnob") {
          const globalKnob = route.knobKind
            ? globalConfigKnobs.get(route.knobKind)
            : undefined
          if (!globalKnob) {
            return
          }
          if (route.isRestore) {
            // Boot-time restore from the retained state topic (only if nothing
            // set this run).
            if (
              !globalKnob.getHasValue() &&
              globalKnob.applyPayload(payload) !== null
            ) {
              globalKnob.afterChange?.()
            }
            return
          }
          const normalizedPayload =
            globalKnob.applyPayload(payload)
          if (normalizedPayload === null) {
            return
          }
          await publisher.publish({
            topic: globalKnob.state,
            payload: normalizedPayload,
            isRetained: true,
          })
          globalKnob.afterChange?.()
          return
        }
        if (route.kind === "view") {
          if (getIsViewName(payload)) {
            if (
              payload === "Photo Frame" &&
              photoFrameAdapter
            ) {
              // Switching into Photo Frame must (re)fetch using the
              // already-configured people/query — a bare push would only
              // repaint stale/absent bytes and wrongly show the "configure
              // in Home Assistant" placeholder.
              deviceStore.setActiveView({
                deviceId: route.deviceId,
                viewName: payload,
              })
              await photoFrameAdapter.showPhotoFrame(
                route.deviceId,
              )
            } else {
              // Every other view (including Clock (Agenda), whose data arrives
              // on the retained `agenda/set` topic) just renders what's known.
              await pushController.setView({
                deviceId: route.deviceId,
                viewName: payload,
              })
            }
          }
          return
        }
        if (route.kind === "viewRestore") {
          // Boot-time restore of the last selection from the retained
          // topic; explicit selections made this run always win.
          if (
            getIsViewName(payload) &&
            !deviceStore.getHasExplicitView(
              route.deviceId,
            ) &&
            payload !==
              deviceStore.getActiveView(route.deviceId)
          ) {
            deviceStore.setActiveView({
              deviceId: route.deviceId,
              viewName: payload,
              isExplicit: false,
            })
            if (
              payload === "Photo Frame" &&
              photoFrameAdapter
            ) {
              // Boot-time restore into Photo Frame: fetch straight away
              // instead of waiting up to a full interval tick, so the panel
              // never shows the placeholder while people/query are set.
              await photoFrameAdapter.showPhotoFrame(
                route.deviceId,
              )
            } else {
              await pushController.pushDevice(
                route.deviceId,
              )
            }
          }
          return
        }
        if (route.kind === "photoNext") {
          await photoFrameAdapter?.showNextPhoto(
            route.deviceId,
          )
          return
        }
        if (route.kind === "photoPrevious") {
          await photoFrameAdapter?.showPreviousPhoto(
            route.deviceId,
          )
          return
        }
        if (route.kind === "nowPlayingData") {
          await applyNowPlayingPayload({
            deviceId: route.deviceId,
            payload,
          })
          return
        }
        if (route.kind === "weatherData") {
          applyWeatherPayload({
            deviceId: route.deviceId,
            payload,
          })
          return
        }
        if (route.kind === "agendaData") {
          applyAgendaPayload({
            deviceId: route.deviceId,
            payload,
          })
          return
        }

        const knobKind = route.knobKind
        if (!knobKind) {
          return
        }
        const knob = configKnobs.get(knobKind)
        const device = pushController.deviceById.get(
          route.deviceId,
        )
        if (!knob || !device) {
          return
        }
        if (route.isRestore) {
          if (!knob.getHasValue(route.deviceId)) {
            knob.applyPayload({
              deviceId: route.deviceId,
              payload,
            })
          }
          return
        }
        const normalizedPayload = knob.applyPayload({
          deviceId: route.deviceId,
          payload,
        })
        if (normalizedPayload === null) {
          return
        }
        await publisher.publish({
          topic: getKnobTopics({
            device,
            kind: knobKind,
          }).state,
          payload: normalizedPayload,
          isRetained: true,
        })
        await knob.onApplied?.(route.deviceId)
      },
    })

    // Populate each HA image entity with a first frame.
    await Promise.all(
      config.devices.map((device) =>
        pushController.pushDevice(device.id),
      ),
    )

    // Seed the config entities' retained state with defaults for devices
    // with no retained value yet (any retained restore lands within the
    // first seconds of the subscription — hence the delay).
    setTimeout(() => {
      config.devices.forEach((device) => {
        const seedPairs: readonly {
          kind: string
          hasValue: boolean
          payload: string
        }[] = [
          {
            kind: "dither",
            hasValue: Boolean(
              deviceConfigStore.getDitherAlgorithm(
                device.id,
              ),
            ),
            payload: device.ditherProfile.algorithm,
          },
          {
            kind: "rotation",
            hasValue:
              deviceConfigStore.getRotationOverride(
                device.id,
              ) !== undefined,
            payload: String(device.rotation),
          },
          ...(device.colourMode === "e6"
            ? [
                {
                  kind: "colourMode",
                  hasValue:
                    deviceConfigStore.getColourModeOverride(
                      device.id,
                    ) !== undefined,
                  payload: "Color",
                },
              ]
            : []),
          {
            kind: "brightness",
            hasValue:
              deviceConfigStore.getBrightnessPercent(
                device.id,
              ) !== undefined,
            payload: "100",
          },
          {
            kind: "saturation",
            hasValue:
              deviceConfigStore.getSaturationPercent(
                device.id,
              ) !== undefined,
            payload: "100",
          },
          ...CROP_EDGES.map((edge) => ({
            kind: getCropKnobKind(edge),
            hasValue:
              deviceConfigStore.getCropInset({
                deviceId: device.id,
                edge,
              }) !== undefined,
            payload: "0",
          })),
          // Per-device Photo Frame overrides default to 0 (= inherit global).
          {
            kind: "photoInterval",
            hasValue:
              deviceConfigStore.getPhotoIntervalMinutes(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          {
            kind: "photoRecency",
            hasValue:
              deviceConfigStore.getPhotoRecencyHalfLifeDays(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          // Per-device format defaults to "Auto" (inherit global); quality to
          // 0 (= inherit global).
          {
            kind: "photoFormat",
            hasValue:
              deviceConfigStore.getPhotoFormat(
                device.id,
              ) !== undefined,
            payload: "Auto",
          },
          {
            kind: "photoQuality",
            hasValue:
              deviceConfigStore.getPhotoQuality(
                device.id,
              ) !== undefined,
            payload: "0",
          },
          // Per-device clock format/style default to "Auto" (inherit global).
          {
            kind: "clockTimeFormat",
            hasValue:
              deviceConfigStore.getClockTimeFormat(
                device.id,
              ) !== undefined,
            payload: "Auto",
          },
          {
            kind: "clockDateStyle",
            hasValue:
              deviceConfigStore.getClockDateStyle(
                device.id,
              ) !== undefined,
            payload: "Auto",
          },
        ]
        seedPairs
          .filter((seedPair) => !seedPair.hasValue)
          .forEach((seedPair) => {
            publisher
              .publish({
                topic: getKnobTopics({
                  device,
                  kind: seedPair.kind,
                }).state,
                payload: seedPair.payload,
                isRetained: true,
              })
              .catch(() => {})
          })
      })

      // Seed the server-wide number knobs (Inkcast Server device) so HA shows
      // a concrete default instead of "unknown".
      Array.from(globalConfigKnobs.values())
        .filter(
          (
            globalKnob,
          ): globalKnob is GlobalConfigKnob & {
            seedDefault: string
          } =>
            globalKnob.seedDefault !== undefined &&
            !globalKnob.getHasValue(),
        )
        .forEach((globalKnob) => {
          publisher
            .publish({
              topic: globalKnob.state,
              payload: globalKnob.seedDefault,
              isRetained: true,
            })
            .catch(() => {})
        })
    }, 5_000)
  }

  // Browser-mode (Slatecast) devices: HA discovery + MQTT routes + the
  // /d/<id> pages and their WebSocket hub. Fully isolated from the image
  // pipeline above.
  const browserMode = createBrowserMode({
    config,
    publisher,
  })
  await browserMode.start()

  const app = createApp({
    config,
    deviceStore,
    pushController,
  })
  const { injectWebSocket } = browserMode.attach(app)
  const server = serve({
    fetch: app.fetch,
    port: config.port,
  })
  injectWebSocket(server)
  console.log(
    `[castkit] serving on :${config.port} (engine=${config.renderEngine}, mqtt=${publisher.isEnabled ? "on" : "off"}, imageDevices=${config.devices.length}, browserDevices=${browserMode.deviceCount})`,
  )

  const shutdown = async () => {
    console.log("[inkcast] shutting down")
    server.close()
    clockTicker.close()
    photoFrameAdapter?.close()
    await publisher.close()
    await renderService.close()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
