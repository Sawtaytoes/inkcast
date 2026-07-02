import { resolve } from "node:path"
import { serve } from "@hono/node-server"
import {
  DITHER_ALGORITHMS,
  type DitherAlgorithm,
} from "@inkcast/core/devices/device"
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
  const pushController = createPushController({
    devices: config.devices,
    deviceStore,
    deviceConfigStore,
    viewDataStore,
    renderService,
    publisher,
    baseTopic,
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
        weatherEntityId:
          config.homeAssistant.weatherEntityId,
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
        onWeatherChanged: () => {
          config.devices
            .filter(
              (device) =>
                deviceStore.getActiveView(device.id) ===
                "Clock (Weather)",
            )
            .forEach((device) => {
              pushDeviceLogged(device.id)
            })
        },
      })
    : null

  // Keep clock-bearing panels on real time: re-push them each minute.
  const clockTicker = startClockTicker({
    onMinuteTick: () => {
      pushDevicesShowingView({
        getIsViewIncluded: getIsClockBearingView,
      })
    },
  })

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
        intervalMinutes: config.immich.intervalMinutes,
        recencyHalfLifeDays:
          config.immich.recencyHalfLifeDays,
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
      /** Set when kind is "knob". */
      knobKind?: string
      /** True for a knob's retained-state (boot restore) topic. */
      isRestore?: boolean
    }

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
    `[inkcast] serving on :${config.port} (engine=${config.renderEngine}, mqtt=${publisher.isEnabled ? "on" : "off"}, ha=${hasNowPlayingAdapter ? "on" : "off"}, devices=${config.devices.length})`,
  )

  const shutdown = async () => {
    console.log("[inkcast] shutting down")
    server.close()
    clockTicker.close()
    nowPlayingAdapter?.close()
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
