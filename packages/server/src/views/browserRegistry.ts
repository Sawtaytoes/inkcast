import type { BrowserDeviceConfig } from "../config/env.ts"

/**
 * The browser-mode (Slatecast) view registry. Names double as the HA View
 * select options and the MQTT `view/set` payloads (same convention as image
 * views); `clientId` is what the SPA switches on over the WebSocket.
 *
 * Each view declares capability requirements — a device's View select only
 * offers the views it satisfies, so HA can never switch a touchless screen
 * into an interactive-only view. (No current view requires touch: Now Playing
 * degrades to display-only controls client-side.)
 */
export type BrowserViewDefinition = {
  name: string
  clientId: string
  isTouchRequired: boolean
}

export const BROWSER_VIEWS: readonly BrowserViewDefinition[] =
  [
    {
      name: "Now Playing",
      clientId: "now-playing",
      isTouchRequired: false,
    },
    {
      name: "Queue",
      clientId: "queue",
      isTouchRequired: false,
    },
    {
      name: "Ambient",
      clientId: "ambient",
      isTouchRequired: false,
    },
  ]

export const DEFAULT_BROWSER_VIEW = BROWSER_VIEWS[0]!

/** The views this device's capabilities allow. */
export const getBrowserViewsForDevice = (
  device: BrowserDeviceConfig,
): readonly BrowserViewDefinition[] =>
  BROWSER_VIEWS.filter(
    (view) => !view.isTouchRequired || device.hasTouch,
  )

export const getBrowserViewByName = (
  name: string,
): BrowserViewDefinition | undefined =>
  BROWSER_VIEWS.find((view) => view.name === name)
