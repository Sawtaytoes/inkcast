import type { ViewName } from "../views/registry.ts"

/**
 * In-memory per-device runtime state — currently just the active view. This is
 * the seam the Phase-2 idle/active state machine (playlist + priority push
 * overlay) grows from.
 */
export type DeviceStore = {
  getActiveView: (deviceId: string) => ViewName
  setActiveView: (params: {
    deviceId: string
    viewName: ViewName
  }) => void
}

export const createDeviceStore = ({
  deviceIds,
  defaultView = "Now Playing (Dashboard)",
}: {
  deviceIds: readonly string[]
  defaultView?: ViewName
}): DeviceStore => {
  const activeViews = new Map<string, ViewName>(
    deviceIds.map((deviceId) => [deviceId, defaultView]),
  )

  return {
    getActiveView: (deviceId) =>
      activeViews.get(deviceId) ?? defaultView,
    setActiveView: ({ deviceId, viewName }) => {
      activeViews.set(deviceId, viewName)
    },
  }
}
