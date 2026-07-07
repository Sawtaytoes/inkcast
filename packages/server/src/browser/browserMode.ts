import { relative } from "node:path"
import type { MqttPublisher } from "@castkit/shared/mqtt/publisher"
import { parseDeviceCommand } from "@castkit/shared/protocol/commands"
import type {
  ServerToClientMessage,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import {
  parseAgendaPayload,
  parseNowPlayingPayload,
  parseQueuePayload,
  parseWeatherPayload,
} from "@castkit/shared/viewData/parsers"
import { serveStatic } from "@hono/node-server/serve-static"
import { createNodeWebSocket } from "@hono/node-ws"
import type { Hono } from "hono"
import type { InkcastConfig } from "../config/env.ts"
import {
  buildBrowserDeviceTopics,
  buildBrowserDiscoveryMessages,
  THEME_OPTIONS,
} from "../homeAssistant/browserDiscovery.ts"
import { createViewDataStore } from "../state/viewDataStore.ts"
import {
  getBrowserViewByName,
  getBrowserViewsForDevice,
} from "../views/browserRegistry.ts"
import { createBrowserStateStore } from "./browserStateStore.ts"
import { createBrowserHub, type HubSocket } from "./hub.ts"
import {
  buildDevicePageHtml,
  resolveSlatecastDistDir,
} from "./pages.ts"

/**
 * Browser-mode (Slatecast) wiring: HA discovery + MQTT routes for the
 * browser devices, the `/d/<id>` page + WebSocket hub, and the tap→MQTT
 * command bridge. Isolated from the image-mode path in index.ts so the e-ink
 * pipeline never depends on any of this.
 */

const ROTATION_VALUES = [0, 90, 180, 270] as const
type Rotation = (typeof ROTATION_VALUES)[number]

const parseRotationPayload = (
  payload: string,
): Rotation | null => {
  const value = Number.parseInt(payload, 10)
  return (
    ROTATION_VALUES.find(
      (rotation) => rotation === value,
    ) ?? null
  )
}

const parseThemePayload = (payload: string) =>
  THEME_OPTIONS.find((option) => option === payload) ?? null

const parseJsonPayload = (payload: string): unknown => {
  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}

export type BrowserMode = ReturnType<
  typeof createBrowserMode
>

export const createBrowserMode = ({
  config,
  publisher,
}: {
  config: InkcastConfig
  publisher: MqttPublisher
}) => {
  const devices = config.browserDevices
  const { baseTopic } = config.mqtt
  const stateStore = createBrowserStateStore({ devices })
  const viewDataStore = createViewDataStore()
  // Which per-device knobs were set THIS run (blocks boot-time restore).
  const knobSetByDeviceId = {
    theme: new Set<string>(),
    rotation: new Set<string>(),
  }

  const topicsByDeviceId = new Map(
    devices.map((device) => [
      device.id,
      buildBrowserDeviceTopics({
        baseTopic,
        deviceId: device.id,
      }),
    ]),
  )

  const hub = createBrowserHub({
    onConnectionCountChange: ({
      deviceId,
      connectionCount,
    }) => {
      const topics = topicsByDeviceId.get(deviceId)
      if (!topics) {
        return
      }
      publisher
        .publish({
          topic: topics.connected,
          payload: connectionCount > 0 ? "ON" : "OFF",
          isRetained: true,
        })
        .catch(() => {})
    },
  })

  const buildViewDataState = (
    deviceId: string,
  ): ViewDataState => {
    const nowPlaying = viewDataStore.getNowPlaying(deviceId)
    const queue = viewDataStore.getQueue(deviceId)
    const weather = viewDataStore.getWeather(deviceId)
    const agenda = viewDataStore.getAgenda(deviceId)
    return {
      ...(nowPlaying ? { nowPlaying } : {}),
      ...(queue ? { queue } : {}),
      ...(weather ? { weather } : {}),
      ...(agenda ? { agenda } : {}),
    }
  }

  const buildSnapshot = (
    deviceId: string,
  ): Extract<
    ServerToClientMessage,
    { type: "snapshot" }
  > | null => {
    const device = stateStore.deviceById.get(deviceId)
    if (!device) {
      return null
    }
    const activeView = getBrowserViewByName(
      stateStore.getActiveView(deviceId),
    )
    return {
      type: "snapshot",
      device: {
        id: device.id,
        label: device.label,
        width: device.width,
        height: device.height,
        shape: device.shape,
        hasTouch: device.hasTouch,
        colour: device.colour,
      },
      settings: stateStore.getSettings(deviceId),
      view:
        activeView?.clientId ??
        getBrowserViewsForDevice(device)[0]?.clientId ??
        "now-playing",
      data: buildViewDataState(deviceId),
    }
  }

  const applyView = async ({
    deviceId,
    payload,
    isRestore,
  }: {
    deviceId: string
    payload: string
    isRestore: boolean
  }) => {
    const device = stateStore.deviceById.get(deviceId)
    const view = getBrowserViewByName(payload)
    if (
      !device ||
      !view ||
      !getBrowserViewsForDevice(device).some(
        (allowedView) => allowedView.name === view.name,
      )
    ) {
      return
    }
    if (
      isRestore &&
      stateStore.getHasExplicitView(deviceId)
    ) {
      return
    }
    stateStore.setActiveView({
      deviceId,
      viewName: view.name,
      isExplicit: !isRestore,
    })
    if (!isRestore) {
      const topics = topicsByDeviceId.get(deviceId)
      if (topics) {
        await publisher.publish({
          topic: topics.viewState,
          payload: view.name,
          isRetained: true,
        })
      }
    }
    hub.broadcast({
      deviceId,
      message: { type: "view", view: view.clientId },
    })
  }

  type RouteKind =
    | "view"
    | "viewRestore"
    | "reload"
    | "theme"
    | "themeRestore"
    | "rotation"
    | "rotationRestore"
    | "nowPlayingData"
    | "queueData"
    | "weatherData"
    | "agendaData"

  const routes = new Map<
    string,
    { deviceId: string; kind: RouteKind }
  >()
  devices.forEach((device) => {
    const topics = topicsByDeviceId.get(device.id)
    if (!topics) {
      return
    }
    const routeEntries: readonly [string, RouteKind][] = [
      [topics.viewCommand, "view"],
      [topics.viewState, "viewRestore"],
      [topics.reloadCommand, "reload"],
      [topics.themeCommand, "theme"],
      [topics.themeState, "themeRestore"],
      [topics.rotationCommand, "rotation"],
      [topics.rotationState, "rotationRestore"],
      [topics.nowPlayingDataCommand, "nowPlayingData"],
      [topics.queueDataCommand, "queueData"],
      [topics.weatherDataCommand, "weatherData"],
      [topics.agendaDataCommand, "agendaData"],
    ]
    routeEntries.forEach(([topic, kind]) => {
      routes.set(topic, { deviceId: device.id, kind })
    })
  })

  const broadcastSettings = (deviceId: string) => {
    hub.broadcast({
      deviceId,
      message: {
        type: "settings",
        settings: stateStore.getSettings(deviceId),
      },
    })
  }

  const handleMessage = async ({
    topic,
    payload,
  }: {
    topic: string
    payload: string
  }) => {
    const route = routes.get(topic)
    if (!route) {
      return
    }
    const { deviceId, kind } = route
    const topics = topicsByDeviceId.get(deviceId)
    if (!topics) {
      return
    }

    if (kind === "view" || kind === "viewRestore") {
      await applyView({
        deviceId,
        payload,
        isRestore: kind === "viewRestore",
      })
      return
    }
    if (kind === "reload") {
      hub.broadcast({
        deviceId,
        message: { type: "reload" },
      })
      return
    }
    if (kind === "theme" || kind === "themeRestore") {
      const theme = parseThemePayload(payload)
      if (theme === null) {
        return
      }
      if (
        kind === "themeRestore" &&
        knobSetByDeviceId.theme.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.theme.add(deviceId)
      stateStore.setSettings({
        deviceId,
        settings: { theme },
      })
      if (kind === "theme") {
        await publisher.publish({
          topic: topics.themeState,
          payload: theme,
          isRetained: true,
        })
      }
      broadcastSettings(deviceId)
      return
    }
    if (kind === "rotation" || kind === "rotationRestore") {
      const rotation = parseRotationPayload(payload)
      if (rotation === null) {
        return
      }
      if (
        kind === "rotationRestore" &&
        knobSetByDeviceId.rotation.has(deviceId)
      ) {
        return
      }
      knobSetByDeviceId.rotation.add(deviceId)
      stateStore.setSettings({
        deviceId,
        settings: { orientation: rotation },
      })
      if (kind === "rotation") {
        await publisher.publish({
          topic: topics.rotationState,
          payload: String(rotation),
          isRetained: true,
        })
      }
      broadcastSettings(deviceId)
      return
    }
    if (kind === "nowPlayingData") {
      const data = parseNowPlayingPayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setNowPlaying({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "now_playing", data },
      })
      return
    }
    if (kind === "queueData") {
      const data = parseQueuePayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setQueue({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "queue", data },
      })
      return
    }
    if (kind === "weatherData") {
      const data = parseWeatherPayload(
        parseJsonPayload(payload),
      )
      if (!data) {
        return
      }
      viewDataStore.setWeather({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "weather", data },
      })
      return
    }
    if (kind === "agendaData") {
      const data = parseAgendaPayload(
        parseJsonPayload(payload),
      )
      viewDataStore.setAgenda({ deviceId, data })
      hub.broadcast({
        deviceId,
        message: { type: "agenda", data },
      })
    }
  }

  const start = async () => {
    if (!publisher.isEnabled || devices.length === 0) {
      return
    }
    const discoveryConfig = {
      discoveryPrefix: config.mqtt.discoveryPrefix,
      nodeId: config.mqtt.nodeId,
      baseTopic,
    }
    await Promise.all(
      devices
        .flatMap((device) =>
          buildBrowserDiscoveryMessages({
            device,
            config: discoveryConfig,
          }),
        )
        .map((message) =>
          publisher.publish({
            topic: message.topic,
            payload: JSON.stringify(message.payload),
            isRetained: message.isRetained,
          }),
        ),
    )

    await publisher.subscribe({
      topics: Array.from(routes.keys()),
      handler: handleMessage,
    })

    // Publish the URL diagnostic sensor + reset the connected flag (retained
    // ON from a previous run would lie until the first socket event).
    await Promise.all(
      devices.flatMap((device) => {
        const topics = topicsByDeviceId.get(device.id)
        if (!topics) {
          return []
        }
        return [
          publisher.publish({
            topic: topics.url,
            payload: `${config.publicUrl}/d/${device.id}`,
            isRetained: true,
          }),
          publisher.publish({
            topic: topics.connected,
            payload:
              hub.getConnectionCount(device.id) > 0
                ? "ON"
                : "OFF",
            isRetained: true,
          }),
        ]
      }),
    )

    // Seed retained state for knobs/views with no retained value yet (any
    // retained restore lands within the first seconds of the subscription).
    setTimeout(() => {
      devices.forEach((device) => {
        const topics = topicsByDeviceId.get(device.id)
        if (!topics) {
          return
        }
        const seedPairs = [
          {
            topic: topics.viewState,
            hasValue: stateStore.getHasExplicitView(
              device.id,
            ),
            payload: stateStore.getActiveView(device.id),
          },
          {
            topic: topics.themeState,
            hasValue: knobSetByDeviceId.theme.has(
              device.id,
            ),
            payload: stateStore.getSettings(device.id)
              .theme,
          },
          {
            topic: topics.rotationState,
            hasValue: knobSetByDeviceId.rotation.has(
              device.id,
            ),
            payload: String(
              stateStore.getSettings(device.id).orientation,
            ),
          },
        ]
        seedPairs
          .filter((seedPair) => !seedPair.hasValue)
          .forEach((seedPair) => {
            publisher
              .publish({
                topic: seedPair.topic,
                payload: seedPair.payload,
                isRetained: true,
              })
              .catch(() => {})
          })
      })
    }, 5_000)
  }

  /** Attach `/d/:id`, its WebSocket, and the SPA assets to the HTTP app. */
  const attach = (app: Hono) => {
    const { injectWebSocket, upgradeWebSocket } =
      createNodeWebSocket({ app })

    const distDir = resolveSlatecastDistDir()
    if (distDir) {
      // serveStatic's root is cwd-relative.
      const relativeDistDir = relative(
        process.cwd(),
        distDir,
      )
      app.use(
        "/assets/*",
        serveStatic({
          root: relativeDistDir,
          rewriteRequestPath: (path) =>
            path.replace(/^\/assets/, "/assets"),
        }),
      )
    } else {
      console.warn(
        "[castkit] no Slatecast SPA build found — /d pages will 500 on assets (set SLATECAST_DIST_DIR or build packages/slatecast)",
      )
    }

    app.get("/d/:id", (context) => {
      const snapshot = buildSnapshot(
        context.req.param("id") ?? "",
      )
      if (!snapshot) {
        return context.json(
          { error: "unknown device" },
          404,
        )
      }
      return context.html(buildDevicePageHtml({ snapshot }))
    })

    app.get(
      "/d/:id/ws",
      upgradeWebSocket((context) => {
        const deviceId = context.req.param("id") ?? ""
        return {
          onOpen: (_event, ws) => {
            const socket = ws as unknown as HubSocket
            const snapshot = buildSnapshot(deviceId)
            if (!snapshot) {
              ws.close(4004, "unknown device")
              return
            }
            hub.addSocket({ deviceId, socket })
            hub.sendTo({ socket, message: snapshot })
          },
          onMessage: (event) => {
            const parsed = parseJsonPayload(
              String(event.data),
            ) as
              | { type?: string; command?: unknown }
              | undefined
            if (parsed?.type !== "command") {
              return
            }
            const command = parseDeviceCommand(
              parsed.command,
            )
            const topics = topicsByDeviceId.get(deviceId)
            if (!command || !topics) {
              return
            }
            publisher
              .publish({
                topic: topics.command,
                payload: JSON.stringify({
                  ...command,
                  ts: new Date().toISOString(),
                }),
              })
              .catch((error) => {
                console.error(
                  `[castkit] command publish failed for ${deviceId}`,
                  error,
                )
              })
          },
          onClose: (_event, ws) => {
            hub.removeSocket({
              deviceId,
              socket: ws as unknown as HubSocket,
            })
          },
        }
      }),
    )

    return { injectWebSocket }
  }

  return {
    deviceCount: devices.length,
    start,
    attach,
  }
}
