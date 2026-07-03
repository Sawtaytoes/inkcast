import { resolve } from "node:path"
import { serve } from "@hono/node-server"
import {
  DITHER_ALGORITHMS,
  type DitherAlgorithm,
} from "@inkcast/core/devices/device"
import { createCalendarAgendaAdapter } from "./adapters/calendarAgendaAdapter.ts"
import {
  createNowPlayingAdapter,
  FOLLOWED_NOW_PLAYING_KEY,
} from "./adapters/nowPlayingAdapter.ts"
import { createPhotoFrameAdapter } from "./adapters/photoFrameAdapter.ts"
import { createApp } from "./app.ts"
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
import { createPushController } from "./pushController.ts"
import { createRenderService } from "./render/renderService.ts"
import { startClockTicker } from "./schedulers/clockTicker.ts"
import {
  CROP_EDGES,
  type CropEdge,
  createDeviceConfigStore,
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
 * or the repo root (so `yarn workspace @inkcast/server dev`, whose cwd is
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

/**
 * One HA-editable config knob: how its MQTT payload is validated/normalized
 * into the config store, and what to do after a user change. The retained
 * state topic doubles as boot-time persistence (`restore`).
 */
type ConfigKnob = {
  /** Store the (valid) payload; returns the normalized retained-state payload, or null to reject. */
  applyPayload: (params: {
    deviceId: string
    payload: string
  }) => string | null
  /** Whether the store already has a value (blocks the boot-time restore). */
  getHasValue: (deviceId: string) => boolean
  /** Re-render / re-fetch after a user change (not after a restore). */
  onApplied?: (deviceId: string) => Promise<void>
}

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

  // The weather entity, photo rotation interval, and photo recency half-life
  // are all HA config (global default on the Inkcast Server device + a
  // per-screen override), resolved live from the config store — no env vars.
  // See docs/decisions/
  // 2026-07-03-user-tunable-view-settings-are-ha-config-entities.md.
  const resolveWeatherEntityId = (deviceId: string) =>
    deviceConfigStore.getWeatherEntity(deviceId) ||
    deviceConfigStore.getGlobalWeatherEntity()
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
  // The union of every device's resolved weather entity — the set the HA
  // stream watches (deduped, empties dropped). Read live so config edits take
  // effect without a reconnect.
  const getWeatherEntityIds = () =>
    Array.from(
      new Set(
        config.devices
          .map((device) =>
            resolveWeatherEntityId(device.id),
          )
          .filter((entityId) => entityId.length > 0),
      ),
    )

  const pushController = createPushController({
    devices: config.devices,
    deviceStore,
    deviceConfigStore,
    viewDataStore,
    renderService,
    publisher,
    baseTopic,
    resolveWeatherEntityId,
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
    entityKey,
  }: {
    getIsViewIncluded: (viewName: ViewName) => boolean
    /** Pinned entity id, or the followed-player key for unpinned devices. */
    entityKey?: string
  }) => {
    config.devices
      .filter(
        (device) =>
          getIsViewIncluded(
            deviceStore.getActiveView(device.id),
          ) &&
          (entityKey === undefined ||
            (device.nowPlayingEntityId ??
              FOLLOWED_NOW_PLAYING_KEY) === entityKey),
      )
      .forEach((device) => {
        pushDeviceLogged(device.id)
      })
  }

  // Phase-2 now-playing adapter: stream media_player entities from Home
  // Assistant and re-push affected devices on change. Devices with a pinned
  // nowPlayingEntityId watch that entity; devices without one follow the
  // most recently active player from the followed platforms (which players
  // are followed vs. ignored is an HA-automation concern). The same
  // connection streams the weather entity for the clock views. Disabled
  // unless HOME_ASSISTANT_URL + HOME_ASSISTANT_TOKEN are set.
  const pinnedEntityIds = Array.from(
    new Set(
      config.devices
        .map((device) => device.nowPlayingEntityId)
        .filter(
          (
            candidateEntityId,
          ): candidateEntityId is string =>
            Boolean(candidateEntityId),
        ),
    ),
  )
  const hasUnpinnedDevice = config.devices.some(
    (device) => !device.nowPlayingEntityId,
  )
  const hasNowPlayingAdapter = Boolean(
    config.homeAssistant.url && config.homeAssistant.token,
  )
  const nowPlayingAdapter = hasNowPlayingAdapter
    ? createNowPlayingAdapter({
        homeAssistantUrl: config.homeAssistant.url,
        homeAssistantToken: config.homeAssistant.token,
        pinnedEntityIds,
        followedPlatforms: hasUnpinnedDevice
          ? config.homeAssistant.followedPlatforms
          : [],
        getWeatherEntityIds,
        viewDataStore,
        onNowPlayingChanged: (entityKey) => {
          // The retained "Music playing" state is the signal HA automations
          // key off to drive the View selects (no server-side idle logic).
          if (entityKey === FOLLOWED_NOW_PLAYING_KEY) {
            publisher
              .publish({
                topic:
                  buildGlobalTopics(baseTopic)
                    .nowPlayingActiveState,
                payload: viewDataStore.getNowPlaying(
                  FOLLOWED_NOW_PLAYING_KEY,
                )?.isPlaying
                  ? "ON"
                  : "OFF",
                isRetained: true,
              })
              .catch(() => {})
          }
          pushDevicesShowingView({
            getIsViewIncluded: getIsNowPlayingView,
            entityKey,
          })
        },
        onWeatherChanged: (weatherEntityId) => {
          // Re-push only the weather-showing devices that resolve to the
          // entity whose data just changed.
          config.devices
            .filter(
              (device) =>
                deviceStore.getActiveView(device.id) ===
                  "Clock (Weather)" &&
                resolveWeatherEntityId(device.id) ===
                  weatherEntityId,
            )
            .forEach((device) => {
              pushDeviceLogged(device.id)
            })
        },
      })
    : null

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

  // Which calendars a device's agenda uses is HA config, resolved live from the
  // "Agenda: Calendars" text entities: the device's own value, or the global
  // default (Inkcast Server device) when the device's is empty. Comma-separated
  // calendar entity ids. No env var — see docs/decisions/
  // 2026-07-02-agenda-calendars-are-ha-config-entities-not-env.md.
  const parseCalendarEntityIds = (calendarsText: string) =>
    calendarsText
      .split(",")
      .map((entityId) => entityId.trim())
      .filter((entityId) => entityId.length > 0)
  const resolveCalendarEntityIds = (deviceId: string) => {
    const perDevice = parseCalendarEntityIds(
      deviceConfigStore.getAgendaCalendars(deviceId),
    )
    return perDevice.length > 0
      ? perDevice
      : parseCalendarEntityIds(
          deviceConfigStore.getGlobalAgendaCalendars(),
        )
  }

  // Calendar agenda adapter: pulls each device's configured calendars from HA
  // (like the weather flow) and re-pushes it when its day changes, so an
  // imminent appointment surfaces on the "Clock (Agenda)" view. HA automations
  // decide WHEN a display switches to that view; this just supplies the data.
  // Enabled whenever HA is configured; a device with no calendars set just
  // renders an empty (weather-clock) agenda until one is set from HA.
  const calendarAgendaAdapter = hasNowPlayingAdapter
    ? createCalendarAgendaAdapter({
        homeAssistantUrl: config.homeAssistant.url,
        homeAssistantToken: config.homeAssistant.token,
        deviceIds: config.devices.map(
          (device) => device.id,
        ),
        getCalendarEntityIds: resolveCalendarEntityIds,
        pollMinutes:
          config.homeAssistant.calendarPollMinutes,
        viewDataStore,
        onAgendaChanged: (deviceId) => {
          if (
            deviceStore.getActiveView(deviceId) ===
            "Clock (Agenda)"
          ) {
            pushDeviceLogged(deviceId)
          }
        },
      })
    : null

  /** Refresh every device's agenda (global calendars changed). */
  const refreshAllAgendas = () => {
    config.devices.forEach((device) => {
      void calendarAgendaAdapter?.refreshDevice(device.id)
    })
  }

  /** Re-push every device currently showing the weather clock (global weather changed). */
  const refreshAllWeatherDevices = () => {
    config.devices
      .filter(
        (device) =>
          deviceStore.getActiveView(device.id) ===
          "Clock (Weather)",
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
          "agendaCalendars",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setAgendaCalendars({
                deviceId,
                calendarsText: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getAgendaCalendars(
                  deviceId,
                ),
              ),
            onApplied: async (deviceId) => {
              await calendarAgendaAdapter?.refreshDevice(
                deviceId,
              )
            },
          },
        ],
        [
          "weatherEntity",
          {
            applyPayload: ({ deviceId, payload }) => {
              deviceConfigStore.setWeatherEntity({
                deviceId,
                entityId: payload,
              })
              return payload
            },
            getHasValue: (deviceId) =>
              Boolean(
                deviceConfigStore.getWeatherEntity(
                  deviceId,
                ),
              ),
            onApplied: async (deviceId) => {
              // Pull the newly-pointed entity's current value, then repaint.
              nowPlayingAdapter?.refreshWeather()
              await pushController.pushDevice(deviceId)
            },
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
        agendaCalendars: {
          command: topics.agendaCalendarsCommand,
          state: topics.agendaCalendarsState,
        },
        weatherEntity: {
          command: topics.weatherEntityCommand,
          state: topics.weatherEntityState,
        },
        photoInterval: {
          command: topics.photoIntervalCommand,
          state: topics.photoIntervalState,
        },
        photoRecency: {
          command: topics.photoRecencyCommand,
          state: topics.photoRecencyState,
        },
        photoPeople: {
          command: topics.photoPeopleCommand,
          state: topics.photoPeopleState,
        },
        photoQuery: {
          command: topics.photoQueryCommand,
          state: topics.photoQueryState,
        },
        dither: {
          command: topics.ditherCommand,
          state: topics.ditherState,
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
        "agendaCalendars",
        {
          command: globalTopics.agendaCalendarsCommand,
          state: globalTopics.agendaCalendarsState,
          applyPayload: (payload) => {
            deviceConfigStore.setGlobalAgendaCalendars(
              payload,
            )
            return payload
          },
          getHasValue: () =>
            Boolean(
              deviceConfigStore.getGlobalAgendaCalendars(),
            ),
          afterChange: refreshAllAgendas,
        },
      ],
      [
        "weatherEntity",
        {
          command: globalTopics.weatherEntityCommand,
          state: globalTopics.weatherEntityState,
          applyPayload: (payload) => {
            deviceConfigStore.setGlobalWeatherEntity(
              payload,
            )
            return payload
          },
          getHasValue: () =>
            Boolean(
              deviceConfigStore.getGlobalWeatherEntity(),
            ),
          afterChange: () => {
            nowPlayingAdapter?.refreshWeather()
            refreshAllWeatherDevices()
          },
        },
      ],
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
            } else if (payload === "Clock (Agenda)") {
              // Switching in renders the currently-known day immediately, then
              // a fresh pull re-pushes if the day has changed since last poll.
              await pushController.setView({
                deviceId: route.deviceId,
                viewName: payload,
              })
              await calendarAgendaAdapter?.refreshDevice(
                route.deviceId,
              )
            } else {
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
            } else if (payload === "Clock (Agenda)") {
              // Boot-time restore into the agenda: push what we have, then
              // pull the day so it's current without waiting for the poll.
              await pushController.pushDevice(
                route.deviceId,
              )
              await calendarAgendaAdapter?.refreshDevice(
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

      // Now that retained weather config has restored, pull the current value
      // of every configured weather entity (the initial HA snapshot may have
      // predated the restore).
      nowPlayingAdapter?.refreshWeather()
    }, 5_000)
  }

  const app = createApp({
    config,
    deviceStore,
    pushController,
  })
  const server = serve({
    fetch: app.fetch,
    port: config.port,
  })
  console.log(
    `[inkcast] serving on :${config.port} (engine=${config.renderEngine}, mqtt=${publisher.isEnabled ? "on" : "off"}, ha=${hasNowPlayingAdapter ? "on" : "off"}, agenda=${calendarAgendaAdapter ? "on" : "off"}, devices=${config.devices.length})`,
  )

  const shutdown = async () => {
    console.log("[inkcast] shutting down")
    server.close()
    clockTicker.close()
    nowPlayingAdapter?.close()
    calendarAgendaAdapter?.close()
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
