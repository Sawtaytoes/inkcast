import { resolve } from "node:path"
import { serve } from "@hono/node-server"
import {
  createNowPlayingAdapter,
  FOLLOWED_NOW_PLAYING_KEY,
} from "./adapters/nowPlayingAdapter.ts"
import { createPhotoFrameAdapter } from "./adapters/photoFrameAdapter.ts"
import { createApp } from "./app.ts"
import { loadConfig } from "./config/env.ts"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
} from "./homeAssistant/discovery.ts"
import { createMqttPublisher } from "./mqtt/publisher.ts"
import { createPushController } from "./pushController.ts"
import { createRenderService } from "./render/renderService.ts"
import { startClockTicker } from "./schedulers/clockTicker.ts"
import { createDeviceConfigStore } from "./state/deviceConfigStore.ts"
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
    viewDataStore,
    renderService,
    publisher,
    baseTopic,
  })

  /** Push every device whose active view matches, without awaiting. */
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
        pushController
          .pushDevice(device.id)
          .catch((error) => {
            console.error(
              `[inkcast] push failed for ${device.id}`,
              error,
            )
          })
      })
  }

  // Phase-2 now-playing adapter: stream media_player entities from Home
  // Assistant and re-push affected devices on change. Devices with a pinned
  // nowPlayingEntityId watch that entity; devices without one follow the
  // most recently active Music Assistant player. Disabled unless
  // HOME_ASSISTANT_URL + HOME_ASSISTANT_TOKEN are set.
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
        viewDataStore,
        onNowPlayingChanged: (entityKey) => {
          pushDevicesShowingView({
            getIsViewIncluded: getIsNowPlayingView,
            entityKey,
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

  // Immich photo frame: rotates a random photo of the configured people on
  // an interval. Enabled only when Immich credentials are set.
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
        devices: config.devices,
        deviceStore,
        deviceConfigStore,
        viewDataStore,
        pushDevice: (deviceId) =>
          pushController.pushDevice(deviceId),
      })
    : null

  if (publisher.isEnabled) {
    // Advertise every device to HA (retained discovery configs).
    await Promise.all(
      config.devices.flatMap((device) =>
        buildDiscoveryMessages({
          device,
          viewNames: VIEW_NAMES,
          config: {
            discoveryPrefix: config.mqtt.discoveryPrefix,
            nodeId: config.mqtt.nodeId,
            baseTopic,
          },
        }).map((message) =>
          publisher.publish({
            topic: message.topic,
            payload: JSON.stringify(message.payload),
            isRetained: message.isRetained,
          }),
        ),
      ),
    )

    // Map each command/config topic back to a device + action, then
    // subscribe. The retained photo-people STATE topic is also subscribed:
    // it restores the HA-edited config after a server restart (retained MQTT
    // is the persistence layer — no config file needed).
    const commandRoutes = new Map<
      string,
      {
        deviceId: string
        kind:
          | "refresh"
          | "view"
          | "photoPeople"
          | "photoPeopleRestore"
      }
    >()
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
      commandRoutes.set(topics.photoPeopleCommand, {
        deviceId: device.id,
        kind: "photoPeople",
      })
      commandRoutes.set(topics.photoPeopleState, {
        deviceId: device.id,
        kind: "photoPeopleRestore",
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
        } else if (route.kind === "photoPeople") {
          const device = pushController.deviceById.get(
            route.deviceId,
          )
          if (!device) {
            return
          }
          deviceConfigStore.setPhotoPeople({
            deviceId: route.deviceId,
            peopleText: payload,
          })
          // Retained state = HA display + restart persistence.
          await publisher.publish({
            topic: buildDeviceTopics({
              baseTopic,
              device,
            }).photoPeopleState,
            payload,
            isRetained: true,
          })
          // New people = new pool; fetch a fresh photo right away.
          viewDataStore.setPhotoFrame({
            deviceId: route.deviceId,
            data: undefined,
          })
          await photoFrameAdapter?.refreshDevice(
            route.deviceId,
          )
        } else if (route.kind === "photoPeopleRestore") {
          if (
            !deviceConfigStore.getPhotoPeople(
              route.deviceId,
            )
          ) {
            deviceConfigStore.setPhotoPeople({
              deviceId: route.deviceId,
              peopleText: payload,
            })
          }
        } else if (getIsViewName(payload)) {
          await pushController.setView({
            deviceId: route.deviceId,
            viewName: payload,
          })
        }
      },
    })

    // Populate each HA image entity with a first frame.
    await Promise.all(
      config.devices.map((device) =>
        pushController.pushDevice(device.id),
      ),
    )
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
