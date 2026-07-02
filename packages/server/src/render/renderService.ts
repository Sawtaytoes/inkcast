import type { DeviceMetadata } from "@inkcast/core/devices/device"
import type { DitherAdjustments } from "@inkcast/core/pipeline/dither"
import { createChromiumEngine } from "@inkcast/render/chromiumEngine"
import type { RenderEngine } from "@inkcast/render/engine"
import type { SafeAreaInset } from "@inkcast/render/renderDeviceImage"
import {
  renderDeviceImage,
  resolveSafeArea,
} from "@inkcast/render/renderDeviceImage"
import { createSatoriEngine } from "@inkcast/render/satoriEngine"
import type {
  NowPlayingData,
  PhotoFrameData,
  WeatherData,
} from "../state/viewDataStore.ts"
import {
  renderViewElement,
  type ViewName,
} from "../views/registry.ts"

/**
 * Holds the configured render engine and turns a (device, view, view data)
 * into that device's panel-ready PNG. The engine is chosen at startup —
 * Chromium (default) or Satori — and reused across renders.
 */
export type RenderService = {
  renderDevice: (params: {
    device: DeviceMetadata
    viewName: ViewName
    nowPlaying?: NowPlayingData
    photoFrame?: PhotoFrameData
    weather?: WeatherData
    adjustments?: DitherAdjustments
    safeAreaInset?: SafeAreaInset
  }) => Promise<Buffer>
  close: () => Promise<void>
}

export const createRenderService = async ({
  engineName,
}: {
  engineName: "chromium" | "satori"
}): Promise<RenderService> => {
  // Satori has no resources to release, so `close` only exists on Chromium.
  const engine: RenderEngine & {
    close?: () => Promise<void>
  } =
    engineName === "satori"
      ? await createSatoriEngine()
      : await createChromiumEngine()

  return {
    renderDevice: ({
      device,
      viewName,
      nowPlaying,
      photoFrame,
      weather,
      adjustments,
      safeAreaInset,
    }) => {
      // The view must be laid out in the safe box (device minus the mat
      // inset), not the full panel, so its text reflows to what stays
      // visible. renderDeviceImage places that render onto the full panel.
      const { contentWidth, contentHeight } =
        resolveSafeArea({
          width: device.width,
          height: device.height,
          safeAreaInset,
        })
      const contentDevice: DeviceMetadata = {
        ...device,
        width: contentWidth,
        height: contentHeight,
      }

      return renderDeviceImage({
        engine,
        element: renderViewElement({
          viewName,
          device: contentDevice,
          now: new Date(),
          nowPlaying,
          photoFrame,
          weather,
        }),
        device,
        adjustments,
        safeAreaInset,
      })
    },
    close: async () => {
      await engine.close?.()
    },
  }
}
