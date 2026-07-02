import {
  type DeviceMetadata,
  DITHER_ALGORITHMS,
} from "@inkcast/core/devices/device"

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
    photoPeopleCommand: `${base}/photo_people/set`,
    photoPeopleState: `${base}/photo_people`,
    photoQueryCommand: `${base}/photo_query/set`,
    photoQueryState: `${base}/photo_query`,
    photoNextCommand: `${base}/photo_next/set`,
    photoPreviousCommand: `${base}/photo_previous/set`,
    ditherCommand: `${base}/dither/set`,
    ditherState: `${base}/dither`,
    colourModeCommand: `${base}/colour_mode/set`,
    colourModeState: `${base}/colour_mode`,
    brightnessCommand: `${base}/brightness/set`,
    brightnessState: `${base}/brightness`,
    saturationCommand: `${base}/saturation/set`,
    saturationState: `${base}/saturation`,
    idleViewCommand: `${base}/idle_view/set`,
    idleViewState: `${base}/idle_view`,
    idleMinutesCommand: `${base}/idle_minutes/set`,
    idleMinutesState: `${base}/idle_minutes`,
  }
}

/** Server-wide (per-install, not per-device) config topics. */
export const buildGlobalTopics = (
  baseTopic = "inkcast",
) => ({
  followExcludeCommand: `${baseTopic}/config/follow_exclude/set`,
  followExcludeState: `${baseTopic}/config/follow_exclude`,
})

/** The HA-facing colour-mode option strings (double as MQTT payloads). */
export const COLOUR_MODE_OPTIONS = [
  "Color",
  "Black & White",
] as const

/** The idle-view select option that disables the idle fallback. */
export const IDLE_VIEW_NONE_OPTION = "None"

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
      // Config entities are name-prefixed by what they affect ("Display:",
      // "Photo Frame:") — HA has no custom config sub-sections, so the
      // prefix is what groups them on the device page.
      topic: discoveryTopic("select", "dither"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Dither",
        unique_id: `inkcast_${device.id}_dither`,
        options: Array.from(DITHER_ALGORITHMS),
        command_topic: topics.ditherCommand,
        state_topic: topics.ditherState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    // B&W-on-a-colour-panel only makes sense on colour hardware.
    ...(device.colourMode === "e6"
      ? [
          {
            topic: discoveryTopic("select", "colour_mode"),
            isRetained: true as const,
            payload: {
              ...availability,
              name: "Display: Color mode",
              unique_id: `inkcast_${device.id}_colour_mode`,
              options: Array.from(COLOUR_MODE_OPTIONS),
              command_topic: topics.colourModeCommand,
              state_topic: topics.colourModeState,
              entity_category: "config",
              device: deviceBlock,
            },
          },
        ]
      : []),
    {
      // Pre-dither brightness boost (e-ink panels read dark).
      topic: discoveryTopic("number", "brightness"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Brightness",
        unique_id: `inkcast_${device.id}_brightness`,
        command_topic: topics.brightnessCommand,
        state_topic: topics.brightnessState,
        min: 50,
        max: 200,
        step: 5,
        unit_of_measurement: "%",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("number", "saturation"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Saturation",
        unique_id: `inkcast_${device.id}_saturation`,
        command_topic: topics.saturationCommand,
        state_topic: topics.saturationState,
        min: 50,
        max: 200,
        step: 5,
        unit_of_measurement: "%",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Which view this panel falls back to when its now-playing selection
      // has had nothing playing for the idle timeout. "None" disables the
      // fallback (Home Assistant automations stay fully in control).
      topic: discoveryTopic("select", "idle_view"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Now Playing: Idle view",
        unique_id: `inkcast_${device.id}_idle_view`,
        options: [IDLE_VIEW_NONE_OPTION].concat(
          Array.from(viewNames),
        ),
        command_topic: topics.idleViewCommand,
        state_topic: topics.idleViewState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("number", "idle_minutes"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Now Playing: Idle minutes",
        unique_id: `inkcast_${device.id}_idle_minutes`,
        command_topic: topics.idleMinutesCommand,
        state_topic: topics.idleMinutesState,
        min: 1,
        max: 240,
        step: 1,
        unit_of_measurement: "min",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Which Immich people feed this device's Photo Frame view
      // (comma-separated names or person UUIDs). The retained state topic
      // doubles as the persistence layer.
      topic: discoveryTopic("text", "photo_people"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: People",
        unique_id: `inkcast_${device.id}_photo_people`,
        command_topic: topics.photoPeopleCommand,
        state_topic: topics.photoPeopleState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Free-text Immich smart-search query ("green shirt"). Combines with
      // the people list; automatable from HA (holiday themes, bedtime
      // rotations, presence-driven switches).
      topic: discoveryTopic("text", "photo_query"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Query",
        unique_id: `inkcast_${device.id}_photo_query`,
        command_topic: topics.photoQueryCommand,
        state_topic: topics.photoQueryState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("button", "photo_next"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Next photo",
        unique_id: `inkcast_${device.id}_photo_next`,
        command_topic: topics.photoNextCommand,
        payload_press: "next",
        device: deviceBlock,
      },
    },
    {
      topic: discoveryTopic("button", "photo_previous"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Previous photo",
        unique_id: `inkcast_${device.id}_photo_previous`,
        command_topic: topics.photoPreviousCommand,
        payload_press: "previous",
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

/**
 * Discovery messages for the server-wide "Inkcast Server" device — global
 * settings that aren't tied to one panel, exposed as normal HA entities so
 * they're editable, automatable, and visible (instead of hiding in env
 * vars). Retained state = persistence, exactly like the per-device knobs.
 */
export const buildGlobalDiscoveryMessages = (
  config: HaDiscoveryConfig = {},
): DiscoveryMessage[] => {
  const discoveryPrefix =
    config.discoveryPrefix ?? "homeassistant"
  const nodeId = config.nodeId ?? "inkcast"
  const topics = buildGlobalTopics(config.baseTopic)

  const availability = {
    availability_topic: buildAvailabilityTopic(
      config.baseTopic,
    ),
    payload_available: "online",
    payload_not_available: "offline",
  }
  const serverDeviceBlock = {
    identifiers: ["inkcast_server"],
    name: "Inkcast Server",
    manufacturer: "Inkcast",
    model: "render server",
  }

  return [
    {
      // media_player entities follow mode must IGNORE even while playing
      // (comma-separated entity ids) — e.g. bedtime-music speakers.
      // Applied live; no restart needed.
      topic: `${discoveryPrefix}/text/${nodeId}/server_follow_exclude/config`,
      isRetained: true,
      payload: {
        ...availability,
        name: "Follow: Excluded players",
        unique_id: "inkcast_server_follow_exclude",
        command_topic: topics.followExcludeCommand,
        state_topic: topics.followExcludeState,
        max: 255,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
  ]
}
