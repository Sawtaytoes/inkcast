import type { BrowserDeviceSettings } from "@castkit/shared/protocol/ws"
import type { BrowserDeviceConfig } from "../config/env.ts"
import {
  DEFAULT_BROWSER_VIEW,
  getBrowserViewsForDevice,
} from "../views/browserRegistry.ts"

/**
 * In-memory per-browser-device state: the active view + the dynamic settings
 * (orientation, theme). Retained MQTT is the persistence layer — this store
 * only mirrors it for snapshot building, exactly like the image-mode stores.
 */
export type BrowserStateStore = ReturnType<
  typeof createBrowserStateStore
>

export const createBrowserStateStore = ({
  devices,
}: {
  devices: readonly BrowserDeviceConfig[]
}) => {
  const deviceById = new Map(
    devices.map((device) => [device.id, device]),
  )
  const viewByDeviceId = new Map<string, string>()
  const explicitViewDeviceIds = new Set<string>()
  const settingsByDeviceId = new Map<
    string,
    BrowserDeviceSettings
  >()

  const getDefaultView = (deviceId: string) => {
    const device = deviceById.get(deviceId)
    return device
      ? (getBrowserViewsForDevice(device)[0]?.name ??
          DEFAULT_BROWSER_VIEW.name)
      : DEFAULT_BROWSER_VIEW.name
  }

  return {
    deviceById,
    getActiveView: (deviceId: string) =>
      viewByDeviceId.get(deviceId) ??
      getDefaultView(deviceId),
    /** True when a view was selected THIS run (blocks boot-time restore). */
    getHasExplicitView: (deviceId: string) =>
      explicitViewDeviceIds.has(deviceId),
    setActiveView: ({
      deviceId,
      viewName,
      isExplicit = true,
    }: {
      deviceId: string
      viewName: string
      isExplicit?: boolean
    }) => {
      viewByDeviceId.set(deviceId, viewName)
      if (isExplicit) {
        explicitViewDeviceIds.add(deviceId)
      }
    },
    getSettings: (
      deviceId: string,
    ): BrowserDeviceSettings =>
      settingsByDeviceId.get(deviceId) ?? {
        orientation: 0,
        theme: "Auto",
      },
    setSettings: ({
      deviceId,
      settings,
    }: {
      deviceId: string
      settings: Partial<BrowserDeviceSettings>
    }): BrowserDeviceSettings => {
      const current = settingsByDeviceId.get(deviceId) ?? {
        orientation: 0 as const,
        theme: "Auto" as const,
      }
      const next = { ...current, ...settings }
      settingsByDeviceId.set(deviceId, next)
      return next
    },
  }
}
