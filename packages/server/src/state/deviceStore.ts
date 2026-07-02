import type { ViewName } from "../views/registry.ts"

/**
 * In-memory per-device runtime state: the SELECTED view (what the user picked
 * in HA — what the panel shows while its data source is active), whether that
 * selection was made explicitly this run (vs. restored/default — guards the
 * retained-MQTT restore on boot), and the last view actually rendered to the
 * panel (which may be the idle-fallback view, not the selection).
 */
export type DeviceStore = {
  getActiveView: (deviceId: string) => ViewName
  setActiveView: (params: {
    deviceId: string
    viewName: ViewName
    /** True when a user/API action set it; false for the boot-time restore. */
    isExplicit?: boolean
  }) => void
  /** Whether the view was explicitly chosen this run (blocks restores). */
  getHasExplicitView: (deviceId: string) => boolean
  /** The view most recently rendered+pushed (selection OR idle fallback). */
  getLastRenderedView: (
    deviceId: string,
  ) => ViewName | undefined
  setLastRenderedView: (params: {
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
  const explicitDeviceIds = new Set<string>()
  const lastRenderedViews = new Map<string, ViewName>()

  return {
    getActiveView: (deviceId) =>
      activeViews.get(deviceId) ?? defaultView,
    setActiveView: ({
      deviceId,
      viewName,
      isExplicit = true,
    }) => {
      activeViews.set(deviceId, viewName)
      if (isExplicit) {
        explicitDeviceIds.add(deviceId)
      }
    },
    getHasExplicitView: (deviceId) =>
      explicitDeviceIds.has(deviceId),
    getLastRenderedView: (deviceId) =>
      lastRenderedViews.get(deviceId),
    setLastRenderedView: ({ deviceId, viewName }) => {
      lastRenderedViews.set(deviceId, viewName)
    },
  }
}
