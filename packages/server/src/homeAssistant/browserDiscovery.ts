import {
  buildAvailabilityTopic,
  type DiscoveryMessage,
  type HaDiscoveryConfig,
} from "@castkit/shared/discovery/types"
import type { BrowserDeviceConfig } from "../config/env.ts"
import { getBrowserViewsForDevice } from "../views/browserRegistry.ts"
import { ROTATION_OPTIONS } from "./discovery.ts"

/**
 * Home Assistant MQTT-discovery payloads for a browser-mode (Slatecast)
 * device. Publishing these (retained) auto-creates, per screen:
 *   - a **Select** (switch the active view — options filtered by capability),
 *   - a **Button** (tell the kiosk browser to reload),
 *   - a diagnostic **Sensor** (the page URL this device shows),
 *   - a diagnostic **Binary sensor** (a browser is connected over WS),
 *   - config **Selects** (theme, rotation — retained state = persistence).
 */

export const THEME_OPTIONS = [
  "Auto",
  "Dark",
  "Light",
] as const

/** Runtime topics for a browser device (view, data-in, commands out). */
export const buildBrowserDeviceTopics = ({
  baseTopic = "castkit",
  deviceId,
}: {
  baseTopic?: string
  deviceId: string
}) => {
  const base = `${baseTopic}/${deviceId}`

  return {
    viewCommand: `${base}/view/set`,
    viewState: `${base}/view`,
    url: `${base}/url`,
    connected: `${base}/connected`,
    reloadCommand: `${base}/reload/set`,
    themeCommand: `${base}/theme/set`,
    themeState: `${base}/theme`,
    rotationCommand: `${base}/rotation/set`,
    rotationState: `${base}/rotation`,
    // Panel backlight (gpio-backlight, on/off only on the HyperPixels) —
    // handled by a tiny MQTT agent ON THE KIOSK PI (castkit-backlight
    // service), not by the server or the SPA: a browser can't reach sysfs.
    // The agent carries its own LWT availability so the switch reflects the
    // Pi agent, not the render server.
    backlightCommand: `${base}/backlight/set`,
    backlightState: `${base}/backlight`,
    backlightAvailability: `${base}/backlight/available`,
    // View data HA pushes to this screen (retained) — same contract as the
    // image devices, plus the queue.
    nowPlayingDataCommand: `${base}/now_playing/set`,
    queueDataCommand: `${base}/queue/set`,
    weatherDataCommand: `${base}/weather/set`,
    agendaDataCommand: `${base}/agenda/set`,
    // Device → house: taps become one JSON command topic HA automations act
    // on. NOT retained. See the pure-MQTT command-path decision record.
    command: `${base}/command`,
  }
}

/** The HA `device` block; the model string surfaces the capability matrix. */
const buildDeviceBlock = (device: BrowserDeviceConfig) => ({
  identifiers: [`castkit_${device.id}`],
  connections: [["mac", device.mac]],
  name: device.label,
  manufacturer: "CastKit",
  model: `browser · ${device.hasTouch ? "touch" : "display-only"} · ${device.colour} · ${device.width}×${device.height} ${device.shape}`,
})

export const buildBrowserDiscoveryMessages = ({
  device,
  config = {},
}: {
  device: BrowserDeviceConfig
  config?: HaDiscoveryConfig
}): DiscoveryMessage[] => {
  const discoveryPrefix =
    config.discoveryPrefix ?? "homeassistant"
  const nodeId = config.nodeId ?? "castkit"
  const topics = buildBrowserDeviceTopics({
    baseTopic: config.baseTopic ?? "castkit",
    deviceId: device.id,
  })
  const deviceBlock = buildDeviceBlock(device)

  const availability = {
    availability_topic: buildAvailabilityTopic(
      config.baseTopic ?? "castkit",
    ),
    payload_available: "online",
    payload_not_available: "offline",
  }

  const discoveryTopic = (
    component: string,
    entity: string,
  ) =>
    `${discoveryPrefix}/${component}/${nodeId}/${device.id}_${entity}/config`

  return [
    {
      topic: discoveryTopic("select", "view"),
      isRetained: true,
      payload: {
        ...availability,
        name: "View",
        unique_id: `castkit_${device.id}_view`,
        options: getBrowserViewsForDevice(device).map(
          (view) => view.name,
        ),
        command_topic: topics.viewCommand,
        state_topic: topics.viewState,
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("button", "reload"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Reload",
        unique_id: `castkit_${device.id}_reload`,
        command_topic: topics.reloadCommand,
        payload_press: "reload",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("sensor", "url"),
      isRetained: true,
      payload: {
        ...availability,
        name: "URL",
        unique_id: `castkit_${device.id}_url`,
        state_topic: topics.url,
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("binary_sensor", "connected"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Browser connected",
        unique_id: `castkit_${device.id}_connected`,
        state_topic: topics.connected,
        payload_on: "ON",
        payload_off: "OFF",
        device_class: "connectivity",
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("select", "theme"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Theme",
        unique_id: `castkit_${device.id}_theme`,
        options: Array.from(THEME_OPTIONS),
        command_topic: topics.themeCommand,
        state_topic: topics.themeState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Panel backlight on/off — commands are consumed by the per-Pi
      // castkit-backlight agent (pure-MQTT peer, same contract style as the
      // tap commands). Availability = the agent's LWT, not the server's.
      topic: discoveryTopic("switch", "backlight"),
      isRetained: true,
      payload: {
        availability_topic: topics.backlightAvailability,
        payload_available: "online",
        payload_not_available: "offline",
        name: "Backlight",
        unique_id: `castkit_${device.id}_backlight`,
        command_topic: topics.backlightCommand,
        state_topic: topics.backlightState,
        payload_on: "ON",
        payload_off: "OFF",
        icon: "mdi:television-ambient-light",
        device: deviceBlock,
      },
    },
    {
      // Mount orientation (clockwise degrees), applied by the SPA as a CSS
      // transform — dynamic so an automation (or a future motorized mount)
      // can flip it live, no reload.
      topic: discoveryTopic("select", "rotation"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Rotation",
        unique_id: `castkit_${device.id}_rotation`,
        options: Array.from(ROTATION_OPTIONS),
        command_topic: topics.rotationCommand,
        state_topic: topics.rotationState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
  ]
}
