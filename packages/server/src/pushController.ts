import { MONO_PALETTE } from "@inkcast/core/panels/palette"
import { FOLLOWED_NOW_PLAYING_KEY } from "./adapters/nowPlayingAdapter.ts"
import type { ConfiguredDevice } from "./config/env.ts"
import {
  buildDeviceTopics,
  IDLE_VIEW_NONE_OPTION,
} from "./homeAssistant/discovery.ts"
import type { MqttPublisher } from "./mqtt/publisher.ts"
import type { RenderService } from "./render/renderService.ts"
import type { DeviceConfigStore } from "./state/deviceConfigStore.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import type { ViewDataStore } from "./state/viewDataStore.ts"
import {
  getIsNowPlayingView,
  getIsViewName,
  type ViewName,
} from "./views/registry.ts"

/** Idle timeout when the HA "Idle minutes" knob hasn't been set. */
export const DEFAULT_IDLE_MINUTES = 5

/**
 * The single place that renders a device's current view and pushes it to MQTT
 * (image + view-state + last-render timestamp). Shared by the HTTP API, the
 * MQTT command handler, and the data adapters so every path behaves
 * identically. When MQTT is disabled the publish calls no-op, so
 * `renderDevice` (the HTTP GET) still works.
 *
 * The view that actually renders is the EFFECTIVE view: the user's selection,
 * except that a now-playing selection with nothing playing for the idle
 * timeout falls back to the device's idle view (Clock (Weather) on the small
 * panel, Photo Frame on the large one). The selection itself is untouched —
 * playback resuming snaps the panel straight back.
 */
export type PushController = {
  deviceById: Map<string, ConfiguredDevice>
  getEffectiveView: (deviceId: string) => ViewName
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
  deviceConfigStore,
  viewDataStore,
  renderService,
  publisher,
  baseTopic,
}: {
  devices: readonly ConfiguredDevice[]
  deviceStore: DeviceStore
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  renderService: RenderService
  publisher: MqttPublisher
  baseTopic: string
}): PushController => {
  const deviceById = new Map(
    devices.map((device) => [device.id, device]),
  )

  const getNowPlayingKey = (device: ConfiguredDevice) =>
    device.nowPlayingEntityId ?? FOLLOWED_NOW_PLAYING_KEY

  const getEffectiveView = (deviceId: string) => {
    const device = deviceById.get(deviceId)
    const activeView = deviceStore.getActiveView(deviceId)
    if (!device || !getIsNowPlayingView(activeView)) {
      return activeView
    }

    // The HA "Idle view" select overrides the registry default; "None"
    // disables the fallback (HA automations stay fully in control).
    const idleViewName =
      deviceConfigStore.getIdleViewName(deviceId) ??
      device.idleViewName
    if (
      !idleViewName ||
      idleViewName === IDLE_VIEW_NONE_OPTION ||
      !getIsViewName(idleViewName)
    ) {
      return activeView
    }

    const entry = viewDataStore.getNowPlayingEntry(
      getNowPlayingKey(device),
    )
    if (entry?.data.isPlaying) {
      return activeView
    }

    const idleMilliseconds =
      (deviceConfigStore.getIdleMinutes(deviceId) ??
        DEFAULT_IDLE_MINUTES) * 60_000
    // No entry at all = the server has never seen playback: fall back
    // immediately rather than showing a stale/placeholder card forever.
    const stoppedAtMs = entry?.stoppedAtMs ?? 0
    return Date.now() - stoppedAtMs >= idleMilliseconds
      ? idleViewName
      : activeView
  }

  const renderDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    if (!device) {
      return null
    }

    // HA-edited display config overrides the registry defaults.
    const ditherOverride =
      deviceConfigStore.getDitherAlgorithm(deviceId)
    const isBlackAndWhite =
      deviceConfigStore.getColourModeOverride(deviceId) ===
      "bw"
    const brightnessPercent =
      deviceConfigStore.getBrightnessPercent(deviceId)
    const saturationPercent =
      deviceConfigStore.getSaturationPercent(deviceId)

    const effectiveDevice = {
      ...device,
      ...(isBlackAndWhite
        ? {
            colourMode: "mono" as const,
            palette: MONO_PALETTE,
          }
        : {}),
      ditherProfile: {
        ...device.ditherProfile,
        ...(ditherOverride
          ? { algorithm: ditherOverride }
          : {}),
      },
    }

    const hasAdjustments =
      (brightnessPercent !== undefined &&
        brightnessPercent !== 100) ||
      (saturationPercent !== undefined &&
        saturationPercent !== 100)

    return renderService.renderDevice({
      device: effectiveDevice,
      viewName: getEffectiveView(deviceId),
      // Unpinned devices follow the household's active player.
      nowPlaying: viewDataStore.getNowPlaying(
        getNowPlayingKey(device),
      ),
      photoFrame: viewDataStore.getPhotoFrame(deviceId),
      weather: viewDataStore.getWeather(),
      ...(hasAdjustments
        ? {
            adjustments: {
              brightness: (brightnessPercent ?? 100) / 100,
              saturation: (saturationPercent ?? 100) / 100,
            },
          }
        : {}),
    })
  }

  const pushDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    const effectiveView = getEffectiveView(deviceId)
    const image = await renderDevice(deviceId)
    if (!device || !image) {
      return false
    }

    const topics = buildDeviceTopics({ baseTopic, device })

    console.log(
      `[inkcast] push ${deviceId} (${effectiveView}, ${image.length} bytes)`,
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
    deviceStore.setLastRenderedView({
      deviceId,
      viewName: effectiveView,
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

  return {
    deviceById,
    getEffectiveView,
    renderDevice,
    pushDevice,
    setView,
  }
}
