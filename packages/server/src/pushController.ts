import { FOLLOWED_NOW_PLAYING_KEY } from "./adapters/nowPlayingAdapter.ts"
import type { ConfiguredDevice } from "./config/env.ts"
import { buildDeviceTopics } from "./homeAssistant/discovery.ts"
import type { MqttPublisher } from "./mqtt/publisher.ts"
import type { RenderService } from "./render/renderService.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import type { ViewDataStore } from "./state/viewDataStore.ts"
import type { ViewName } from "./views/registry.ts"

/**
 * The single place that renders a device's current view and pushes it to MQTT
 * (image + view-state + last-render timestamp). Shared by the HTTP API, the
 * MQTT command handler, and the data adapters so every path behaves
 * identically. When MQTT is disabled the publish calls no-op, so
 * `renderDevice` (the HTTP GET) still works.
 */
export type PushController = {
  deviceById: Map<string, ConfiguredDevice>
  renderDevice: (deviceId: string) => Promise<Buffer | null>
  pushDevice: (deviceId: string) => Promise<boolean>
  setView: (params: {
    deviceId: string
    viewName: ViewName
  }) => Promise<boolean>
}

export const createPushController = ({
  devices,
  deviceStore,
  viewDataStore,
  renderService,
  publisher,
  baseTopic,
}: {
  devices: readonly ConfiguredDevice[]
  deviceStore: DeviceStore
  viewDataStore: ViewDataStore
  renderService: RenderService
  publisher: MqttPublisher
  baseTopic: string
}): PushController => {
  const deviceById = new Map(
    devices.map((device) => [device.id, device]),
  )

  const renderDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    if (!device) {
      return null
    }

    return renderService.renderDevice({
      device,
      viewName: deviceStore.getActiveView(deviceId),
      // Unpinned devices follow the household's active player.
      nowPlaying: viewDataStore.getNowPlaying(
        device.nowPlayingEntityId ??
          FOLLOWED_NOW_PLAYING_KEY,
      ),
    })
  }

  const pushDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    const image = await renderDevice(deviceId)
    if (!device || !image) {
      return false
    }

    const topics = buildDeviceTopics({ baseTopic, device })

    console.log(
      `[inkcast] push ${deviceId} (${deviceStore.getActiveView(deviceId)}, ${image.length} bytes)`,
    )
    await publisher.publish({
      topic: topics.image,
      payload: image,
      isRetained: true,
    })
    await publisher.publish({
      topic: topics.viewState,
      payload: deviceStore.getActiveView(deviceId),
      isRetained: true,
    })
    await publisher.publish({
      topic: topics.lastRender,
      payload: new Date().toISOString(),
      isRetained: true,
    })

    return true
  }

  const setView = async ({
    deviceId,
    viewName,
  }: {
    deviceId: string
    viewName: ViewName
  }) => {
    if (!deviceById.has(deviceId)) {
      return false
    }

    deviceStore.setActiveView({ deviceId, viewName })
    return pushDevice(deviceId)
  }

  return { deviceById, renderDevice, pushDevice, setView }
}
