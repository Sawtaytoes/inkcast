import { serve } from "@hono/node-server"
import { createNowPlayingAdapter } from "./adapters/nowPlayingAdapter.ts"
import { createApp } from "./app.ts"
import { loadConfig } from "./config/env.ts"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
} from "./ha/discovery.ts"
import { createMqttPublisher } from "./mqtt/publisher.ts"
import { createPushController } from "./pushController.ts"
import { createRenderService } from "./render/renderService.ts"
import { startClockTicker } from "./schedulers/clockTicker.ts"
import { createDeviceStore } from "./state/deviceStore.ts"
import { createViewDataStore } from "./state/viewDataStore.ts"
import {
  getIsViewName,
  VIEW_NAMES,
} from "./views/registry.ts"

/**
 * Inkcast server entrypoint. Boots the render engine + MQTT bridge, advertises
 * every device to Home Assistant via MQTT discovery, subscribes to the HA
 * command topics, pushes an initial frame per device, and serves the HTTP API.
 */
const main = async () => {
  // Load a local .env if present (gitignored). In containers, env is usually
  // passed directly, so a missing file is fine.
  try {
    process.loadEnvFile()
  } catch {}

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
  const pushController = createPushController({
    devices: config.devices,
    deviceStore,
    viewDataStore,
    renderService,
    publisher,
    baseTopic,
  })

  /** Push every device currently showing `viewName`, without awaiting. */
  const pushDevicesShowingView = ({
    viewName,
    entityId,
  }: {
    viewName: string
    entityId?: string
  }) => {
    config.devices
      .filter(
        (device) =>
          deviceStore.getActiveView(device.id) ===
            viewName &&
          (entityId === undefined ||
            device.nowPlayingEntityId === entityId),
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

  // Phase-2 now-playing adapter: stream the watched media_player entities
  // from HA and re-push affected devices on change. Disabled unless HA_URL +
  // HA_TOKEN are set and at least one device is bound to an entity.
  const watchedEntityIds = Array.from(
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
  const hasNowPlayingAdapter = Boolean(
    config.ha.url &&
      config.ha.token &&
      watchedEntityIds.length > 0,
  )
  const nowPlayingAdapter = hasNowPlayingAdapter
    ? createNowPlayingAdapter({
        haUrl: config.ha.url,
        haToken: config.ha.token,
        entityIds: watchedEntityIds,
        viewDataStore,
        onNowPlayingChanged: (entityId) => {
          pushDevicesShowingView({
            viewName: "now-playing",
            entityId,
          })
        },
      })
    : null

  // Keep clock panels on real time: re-push them each minute.
  const clockTicker = startClockTicker({
    onMinuteTick: () => {
      pushDevicesShowingView({ viewName: "clock" })
    },
  })

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

    // Map each command topic back to a device + action, then subscribe.
    const commandRoutes = new Map<
      string,
      { deviceId: string; kind: "refresh" | "view" }
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
