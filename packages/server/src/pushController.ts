import { createHash } from "node:crypto"
import { MONO_PALETTE } from "@castkit/core/panels/palette"
import type { FullColourEncoding } from "@castkit/core/pipeline/dither"
import type { ConfiguredDevice } from "./config/env.ts"
import { buildDeviceTopics } from "./homeAssistant/discovery.ts"
import type { MqttPublisher } from "./mqtt/publisher.ts"
import type { RenderService } from "./render/renderService.ts"
import type { DeviceConfigStore } from "./state/deviceConfigStore.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import type { RenderTokenStore } from "./state/renderTokenStore.ts"
import type { ViewDataStore } from "./state/viewDataStore.ts"
import {
  type ClockConfig,
  getIsBleedView,
  type ViewName,
} from "./views/registry.ts"

/**
 * The single place that renders a device's current view and pushes it to MQTT
 * (image + view-state + last-render timestamp). Shared by the HTTP API, the
 * MQTT command handler, and the data adapters so every path behaves
 * identically. When MQTT is disabled the publish calls no-op, so
 * `renderDevice` (the HTTP GET) still works.
 *
 * The rendered view is always the SELECTED view — no server-side idle
 * fallback. Home Assistant automations drive the View select (the "Music
 * playing" binary sensor is the signal they key off).
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
  deviceConfigStore,
  viewDataStore,
  renderService,
  publisher,
  baseTopic,
  resolvePhotoEncoding,
  resolveClockConfig,
  renderTokenStore,
  publicUrl,
}: {
  devices: readonly ConfiguredDevice[]
  deviceStore: DeviceStore
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  renderService: RenderService
  publisher: MqttPublisher
  baseTopic: string
  /**
   * Mints the single-use render tokens whose URLs are published to "http-pull"
   * panels (the same store the public `/render/<token>.png` endpoint serves).
   */
  renderTokenStore: RenderTokenStore
  /** Public base URL a "http-pull" panel fetches, e.g. https://castkit.octen.dev. */
  publicUrl: string
  /**
   * The device's resolved full-colour wire format (per-device override or
   * global default, both HA config). Only the bleed photo view uses it; every
   * other view stays lossless PNG so text and exact palette colours are never
   * degraded.
   */
  resolvePhotoEncoding: (
    deviceId: string,
  ) => FullColourEncoding
  /** The device's resolved clock timezone + time/date format (HA config). */
  resolveClockConfig: (deviceId: string) => ClockConfig
}): PushController => {
  const deviceById = new Map(
    devices.map((device) => [device.id, device]),
  )

  // Per-device hash of the last render whose URL we published to a "http-pull"
  // panel. A full e-ink refresh is expensive (and flashy), so we only publish a
  // fresh URL when the rendered bytes actually changed — a clock ticks every
  // minute so it still updates, but an unchanged agenda/now-playing frame won't
  // needlessly reflash the panel.
  const lastPublishedHashByDevice = new Map<
    string,
    string
  >()

  const renderDevice = async (deviceId: string) => {
    const device = deviceById.get(deviceId)
    if (!device) {
      return null
    }

    // HA-edited display config overrides the registry defaults.
    const ditherOverride =
      deviceConfigStore.getDitherAlgorithm(deviceId)
    const rotationOverride =
      deviceConfigStore.getRotationOverride(deviceId)
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
      ...(rotationOverride !== undefined
        ? { rotation: rotationOverride }
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

    // Text views honour the mat's safe-area crop; photos bleed to the edge.
    const activeView = deviceStore.getActiveView(deviceId)
    const isBleedView = getIsBleedView(activeView)
    // Only the bleed photo view may ship a lossy full-colour frame; every
    // other view stays lossless PNG (exact text + palette colours).
    const fullColourEncoding: FullColourEncoding =
      isBleedView
        ? resolvePhotoEncoding(deviceId)
        : { format: "png" }
    const safeAreaInset = isBleedView
      ? undefined
      : {
          top:
            deviceConfigStore.getCropInset({
              deviceId,
              edge: "top",
            }) ?? 0,
          right:
            deviceConfigStore.getCropInset({
              deviceId,
              edge: "right",
            }) ?? 0,
          bottom:
            deviceConfigStore.getCropInset({
              deviceId,
              edge: "bottom",
            }) ?? 0,
          left:
            deviceConfigStore.getCropInset({
              deviceId,
              edge: "left",
            }) ?? 0,
        }

    return renderService.renderDevice({
      device: effectiveDevice,
      viewName: activeView,
      clock: resolveClockConfig(deviceId),
      // HA pushes each display its own now-playing / weather / agenda payload,
      // all keyed by device id.
      nowPlaying: viewDataStore.getNowPlaying(deviceId),
      photoFrame: viewDataStore.getPhotoFrame(deviceId),
      weather: viewDataStore.getWeather(deviceId),
      agenda: viewDataStore.getAgenda(deviceId),
      ...(hasAdjustments
        ? {
            adjustments: {
              brightness: (brightnessPercent ?? 100) / 100,
              saturation: (saturationPercent ?? 100) / 100,
            },
          }
        : {}),
      ...(safeAreaInset ? { safeAreaInset } : {}),
      fullColourEncoding,
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

    // "http-pull" panels (ESPHome M5Paper) can't consume the MQTT image bytes
    // above — they fetch a PNG over HTTP. Mint a single-use token and publish
    // its URL (non-retained: a consumed/expired token would 404 on reconnect),
    // but skip when the render is byte-identical to the last one we delivered so
    // an idle panel doesn't reflash. `publicUrl` must be set for the URL to be
    // reachable off-host.
    if (device.imageDelivery === "http-pull" && publicUrl) {
      const renderHash = createHash("sha256")
        .update(image)
        .digest("hex")
      if (
        lastPublishedHashByDevice.get(deviceId) ===
        renderHash
      ) {
        console.log(
          `[inkcast] skip ${deviceId} image_url (unchanged render)`,
        )
        return true
      }
      const token = renderTokenStore.createToken(image)
      const url = `${publicUrl}/render/${token}.png`
      await publisher.publish({
        topic: topics.imageUrl,
        payload: url,
        isRetained: false,
      })
      lastPublishedHashByDevice.set(deviceId, renderHash)
      console.log(
        `[inkcast] push ${deviceId} image_url ${url}`,
      )
    }

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
    renderDevice,
    pushDevice,
    setView,
  }
}
