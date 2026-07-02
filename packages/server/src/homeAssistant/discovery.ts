import type { DeviceMetadata } from "@inkcast/core/devices/device"

/**
 * Home Assistant MQTT-discovery payloads for an Inkcast device.
 *
 * Publishing these (retained) to the discovery topics makes HA's built-in MQTT
 * integration auto-create, per display:
 *   - an **Image** entity (see the current screen in HA),
 *   - a **Select** (switch the active view),
 *   - a **Button** (force a refresh),
 *   - a diagnostic **Sensor** (last-render time).
 * No custom HACS integration to maintain (the locked HA-integration approach).
 *
 * This module is pure — it only builds `{ topic, payload }` messages. The thin
 * MQTT client that actually publishes them lands with the broker credentials.
 */

export type HaDiscoveryConfig = {
  /** HA's discovery prefix. Default `homeassistant`. */
  discoveryPrefix?: string
  /** Groups these entities under one discovery node. Default `inkcast`. */
  nodeId?: string
  /** Root of the runtime state/command topics. Default `inkcast`. */
  baseTopic?: string
}

export type DiscoveryMessage = {
  topic: string
  payload: Record<string, unknown>
  isRetained: true
}

/**
 * The single bridge-level availability topic. One LWT on this topic marks every
 * Inkcast entity offline if the server disconnects — availability here means
 * "the Inkcast server is connected", which is what HA should reflect.
 */
export const buildAvailabilityTopic = (
  baseTopic = "inkcast",
): string => `${baseTopic}/availability`

/** Runtime topics for a device (image, commands, state). */
export const buildDeviceTopics = ({
  baseTopic = "inkcast",
  device,
}: {
  baseTopic?: string
  device: DeviceMetadata
}) => {
  const base = `${baseTopic}/${device.id}`

  return {
    image: `${base}/image`,
    refreshCommand: `${base}/refresh/set`,
    viewCommand: `${base}/view/set`,
    viewState: `${base}/view`,
    lastRender: `${base}/last_render`,
  }
}

/** The HA `device` block that ties every entity to one physical display. */
const buildDeviceBlock = (device: DeviceMetadata) => ({
  identifiers: [`inkcast_${device.id}`],
  connections: [["mac", device.mac]],
  name: device.label,
  manufacturer: "Inkcast",
  model: `${device.colourMode} ${device.width}×${device.height}`,
})

/**
 * Build every retained discovery message for one device. `viewNames` populates
 * the Select's options (the views this device can show).
 */
export const buildDiscoveryMessages = ({
  device,
  viewNames,
  config = {},
}: {
  device: DeviceMetadata
  viewNames: readonly string[]
  config?: HaDiscoveryConfig
}): DiscoveryMessage[] => {
  const discoveryPrefix =
    config.discoveryPrefix ?? "homeassistant"
  const nodeId = config.nodeId ?? "inkcast"
  const topics = buildDeviceTopics({
    baseTopic: config.baseTopic,
    device,
  })
  const deviceBlock = buildDeviceBlock(device)

  const availability = {
    availability_topic: buildAvailabilityTopic(
      config.baseTopic,
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
      topic: discoveryTopic("image", "screen"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Screen",
        unique_id: `inkcast_${device.id}_screen`,
        image_topic: topics.image,
        content_type: "image/png",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("select", "view"),
      isRetained: true,
      payload: {
        ...availability,
        name: "View",
        unique_id: `inkcast_${device.id}_view`,
        options: Array.from(viewNames),
        command_topic: topics.viewCommand,
        state_topic: topics.viewState,
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("button", "refresh"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Refresh",
        unique_id: `inkcast_${device.id}_refresh`,
        command_topic: topics.refreshCommand,
        payload_press: "refresh",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("sensor", "last_render"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Last render",
        unique_id: `inkcast_${device.id}_last_render`,
        state_topic: topics.lastRender,
        device_class: "timestamp",
        entity_category: "diagnostic",
        device: deviceBlock,
      },
    },
  ]
}
