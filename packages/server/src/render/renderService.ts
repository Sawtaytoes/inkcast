import type { DeviceMetadata } from "@castkit/core/devices/device"
import type {
  DitherAdjustments,
  FullColourEncoding,
} from "@castkit/core/pipeline/dither"
import { createChromiumEngine } from "@castkit/render/chromiumEngine"
import type { RenderEngine } from "@castkit/render/engine"
import type { SafeAreaInset } from "@castkit/render/renderDeviceImage"
import {
  renderDeviceImage,
  resolveSafeArea,
} from "@castkit/render/renderDeviceImage"
import { createSatoriEngine } from "@castkit/render/satoriEngine"
import type {
  AgendaData,
  NowPlayingData,
  PhotoFrameData,
  WeatherData,
} from "../state/viewDataStore.ts"
import {
  type ClockConfig,
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
    clock: ClockConfig
    nowPlaying?: NowPlayingData
    photoFrame?: PhotoFrameData
    weather?: WeatherData
    agenda?: AgendaData
    adjustments?: DitherAdjustments
    safeAreaInset?: SafeAreaInset
    fullColourEncoding?: FullColourEncoding
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
      clock,
      nowPlaying,
      photoFrame,
      weather,
      agenda,
      adjustments,
      safeAreaInset,
      fullColourEncoding,
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
          clock,
          nowPlaying,
          photoFrame,
          weather,
          agenda,
        }),
        device,
        adjustments,
        safeAreaInset,
        fullColourEncoding,
      })
    },
    close: async () => {
      await engine.close?.()
    },
  }
}
