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
    agendaCalendarsCommand: `${base}/agenda_calendars/set`,
    agendaCalendarsState: `${base}/agenda_calendars`,
    weatherEntityCommand: `${base}/weather_entity/set`,
    weatherEntityState: `${base}/weather_entity`,
    nowPlayingSourceCommand: `${base}/now_playing_source/set`,
    nowPlayingSourceState: `${base}/now_playing_source`,
    photoIntervalCommand: `${base}/photo_interval/set`,
    photoIntervalState: `${base}/photo_interval`,
    photoRecencyCommand: `${base}/photo_recency/set`,
    photoRecencyState: `${base}/photo_recency`,
    photoFormatCommand: `${base}/photo_format/set`,
    photoFormatState: `${base}/photo_format`,
    photoQualityCommand: `${base}/photo_quality/set`,
    photoQualityState: `${base}/photo_quality`,
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
    cropTopCommand: `${base}/crop_top/set`,
    cropTopState: `${base}/crop_top`,
    cropRightCommand: `${base}/crop_right/set`,
    cropRightState: `${base}/crop_right`,
    cropBottomCommand: `${base}/crop_bottom/set`,
    cropBottomState: `${base}/crop_bottom`,
    cropLeftCommand: `${base}/crop_left/set`,
    cropLeftState: `${base}/crop_left`,
  }
}

/** Server-wide (per-install, not per-device) config topics. */
export const buildGlobalTopics = (
  baseTopic = "inkcast",
) => ({
  /** Retained ON/OFF: is the followed player actually playing right now. */
  nowPlayingActiveState: `${baseTopic}/now_playing_active`,
  /** Global default agenda calendars (comma-separated HA calendar entity ids). */
  agendaCalendarsCommand: `${baseTopic}/agenda_calendars/set`,
  agendaCalendarsState: `${baseTopic}/agenda_calendars`,
  /** Global default HA `weather` entity id. */
  weatherEntityCommand: `${baseTopic}/weather_entity/set`,
  weatherEntityState: `${baseTopic}/weather_entity`,
  /** Global default now-playing source list (comma-separated media_player entity ids). */
  nowPlayingSourceCommand: `${baseTopic}/now_playing_source/set`,
  nowPlayingSourceState: `${baseTopic}/now_playing_source`,
  /** Global default Photo Frame rotation interval, minutes. */
  photoIntervalCommand: `${baseTopic}/photo_interval/set`,
  photoIntervalState: `${baseTopic}/photo_interval`,
  /** Global default Photo Frame recency half-life, days. */
  photoRecencyCommand: `${baseTopic}/photo_recency/set`,
  photoRecencyState: `${baseTopic}/photo_recency`,
  /** Global default Photo Frame wire format. */
  photoFormatCommand: `${baseTopic}/photo_format/set`,
  photoFormatState: `${baseTopic}/photo_format`,
  /** Global default Photo Frame lossy quality (1–100). */
  photoQualityCommand: `${baseTopic}/photo_quality/set`,
  photoQualityState: `${baseTopic}/photo_quality`,
})

/** The HA-facing colour-mode option strings (double as MQTT payloads). */
export const COLOUR_MODE_OPTIONS = [
  "Color",
  "Black & White",
] as const

/**
 * HA-facing Photo Frame format options (double as MQTT payloads). The global
 * default select offers the three real formats; a per-device select prepends
 * "Auto" (= inherit the global default). WebP is listed for future ARMv7+/ARMv8
 * photo panels — it crashes ARMv6 Pis on decode (see the JPEG-not-WebP decision
 * record), so the shipped default stays JPEG.
 */
export const GLOBAL_PHOTO_FORMAT_OPTIONS = [
  "JPEG",
  "WebP",
  "PNG",
] as const

export const PHOTO_FORMAT_OPTIONS = [
  "Auto",
  ...GLOBAL_PHOTO_FORMAT_OPTIONS,
] as const

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
    // Safe-area crop insets (px per edge): a physical mat overlaps the panel
    // edges, so text views render inside these; photo views bleed past them.
    // Tunable live so a reframed unit (or a second, unmatted one) can differ.
    ...(
      [
        {
          edge: "top",
          command: topics.cropTopCommand,
          state: topics.cropTopState,
        },
        {
          edge: "right",
          command: topics.cropRightCommand,
          state: topics.cropRightState,
        },
        {
          edge: "bottom",
          command: topics.cropBottomCommand,
          state: topics.cropBottomState,
        },
        {
          edge: "left",
          command: topics.cropLeftCommand,
          state: topics.cropLeftState,
        },
      ] as const
    ).map((cropEdge) => ({
      topic: discoveryTopic(
        "number",
        `crop_${cropEdge.edge}`,
      ),
      isRetained: true as const,
      payload: {
        ...availability,
        name: `Display: Crop ${cropEdge.edge}`,
        unique_id: `inkcast_${device.id}_crop_${cropEdge.edge}`,
        command_topic: cropEdge.command,
        state_topic: cropEdge.state,
        min: 0,
        max: 200,
        step: 1,
        unit_of_measurement: "px",
        entity_category: "config",
        device: deviceBlock,
      },
    })),
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
      // Which HA calendars feed this device's Clock (Agenda) view
      // (comma-separated calendar entity ids). Empty = use the global default
      // on the Inkcast Server device. Retained state doubles as persistence.
      topic: discoveryTopic("text", "agenda_calendars"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Agenda: Calendars",
        unique_id: `inkcast_${device.id}_agenda_calendars`,
        command_topic: topics.agendaCalendarsCommand,
        state_topic: topics.agendaCalendarsState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // HA `weather` entity feeding this device's Clock (Weather) view. Empty =
      // use the global default on the Inkcast Server device.
      topic: discoveryTopic("text", "weather_entity"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Weather: Entity",
        unique_id: `inkcast_${device.id}_weather_entity`,
        command_topic: topics.weatherEntityCommand,
        state_topic: topics.weatherEntityState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Priority-ordered, comma-separated media_player entity ids feeding this
      // device's now-playing view — the first that is playing wins (e.g. a Plex
      // integration player before the Shield's cast player). Empty = use the
      // global default on the Inkcast Server device, then follow mode.
      topic: discoveryTopic("text", "now_playing_source"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Now Playing: Source",
        unique_id: `inkcast_${device.id}_now_playing_source`,
        command_topic: topics.nowPlayingSourceCommand,
        state_topic: topics.nowPlayingSourceState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device Photo Frame rotation interval. 0 = inherit the global
      // default on the Inkcast Server device (a number entity always carries a
      // value, so 0 is the "unset/inherit" sentinel — 0 minutes is meaningless
      // as a real interval).
      topic: discoveryTopic("number", "photo_interval"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Rotation minutes",
        unique_id: `inkcast_${device.id}_photo_interval`,
        command_topic: topics.photoIntervalCommand,
        state_topic: topics.photoIntervalState,
        min: 0,
        max: 1440,
        step: 1,
        unit_of_measurement: "min",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device Photo Frame recency half-life. 0 = inherit the global
      // default (same sentinel rationale as the rotation interval above).
      topic: discoveryTopic("number", "photo_recency"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Recency half-life days",
        unique_id: `inkcast_${device.id}_photo_recency`,
        command_topic: topics.photoRecencyCommand,
        state_topic: topics.photoRecencyState,
        min: 0,
        max: 3650,
        step: 1,
        unit_of_measurement: "d",
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device Photo Frame wire format. "Auto" = inherit the global default
      // on the Inkcast Server device. Only the photo (bleed) view uses it;
      // text/dithered views are always PNG.
      topic: discoveryTopic("select", "photo_format"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Format",
        unique_id: `inkcast_${device.id}_photo_format`,
        options: Array.from(PHOTO_FORMAT_OPTIONS),
        command_topic: topics.photoFormatCommand,
        state_topic: topics.photoFormatState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // Per-device lossy quality for JPEG/WebP. 0 = inherit the global default
      // (a number entity always carries a value, so 0 is the "unset" sentinel).
      topic: discoveryTopic("number", "photo_quality"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Photo Frame: Quality",
        unique_id: `inkcast_${device.id}_photo_quality`,
        command_topic: topics.photoQualityCommand,
        state_topic: topics.photoQualityState,
        min: 0,
        max: 100,
        step: 1,
        unit_of_measurement: "%",
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
      // The one signal HA automations need to drive the View selects:
      // whether the followed player is ACTUALLY playing. Which players are
      // followed vs. ignored is decided by the HA automation, not here. View
      // switching itself is deliberately left to HA automations — no
      // server-side idle fallback.
      topic: `${discoveryPrefix}/binary_sensor/${nodeId}/server_now_playing_active/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Music playing",
        unique_id: "inkcast_server_now_playing_active",
        state_topic: topics.nowPlayingActiveState,
        payload_on: "ON",
        payload_off: "OFF",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default agenda calendars — the household calendars every
      // display's Clock (Agenda) view uses unless a display overrides them with
      // its own "Agenda: Calendars" text entity. Comma-separated calendar
      // entity ids; retained state = persistence.
      topic: `${discoveryPrefix}/text/${nodeId}/server_agenda_calendars/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Agenda: Calendars",
        unique_id: "inkcast_server_agenda_calendars",
        command_topic: topics.agendaCalendarsCommand,
        state_topic: topics.agendaCalendarsState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default weather entity — the HA `weather` entity every display's
      // Clock (Weather) view uses unless it overrides with its own "Weather:
      // Entity" text entity.
      topic: `${discoveryPrefix}/text/${nodeId}/server_weather_entity/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Weather: Entity",
        unique_id: "inkcast_server_weather_entity",
        command_topic: topics.weatherEntityCommand,
        state_topic: topics.weatherEntityState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default now-playing source — the priority-ordered media_player
      // list every display uses unless it overrides with its own "Now Playing:
      // Source" text entity. Comma-separated entity ids; retained = persistence.
      topic: `${discoveryPrefix}/text/${nodeId}/server_now_playing_source/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Now Playing: Source",
        unique_id: "inkcast_server_now_playing_source",
        command_topic: topics.nowPlayingSourceCommand,
        state_topic: topics.nowPlayingSourceState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default Photo Frame rotation interval (minutes) — used by any
      // display whose own "Photo Frame: Rotation minutes" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_interval/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Rotation minutes",
        unique_id: "inkcast_server_photo_interval",
        command_topic: topics.photoIntervalCommand,
        state_topic: topics.photoIntervalState,
        min: 1,
        max: 1440,
        step: 1,
        unit_of_measurement: "min",
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default Photo Frame recency half-life (days) — used by any
      // display whose own "Photo Frame: Recency half-life days" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_recency/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Recency half-life days",
        unique_id: "inkcast_server_photo_recency",
        command_topic: topics.photoRecencyCommand,
        state_topic: topics.photoRecencyState,
        min: 1,
        max: 3650,
        step: 1,
        unit_of_measurement: "d",
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default Photo Frame wire format — used by any display whose own
      // "Photo Frame: Format" is "Auto" (inherit).
      topic: `${discoveryPrefix}/select/${nodeId}/server_photo_format/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Format",
        unique_id: "inkcast_server_photo_format",
        options: Array.from(GLOBAL_PHOTO_FORMAT_OPTIONS),
        command_topic: topics.photoFormatCommand,
        state_topic: topics.photoFormatState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default lossy quality (1–100) for JPEG/WebP — used by any display
      // whose own "Photo Frame: Quality" is 0 (inherit).
      topic: `${discoveryPrefix}/number/${nodeId}/server_photo_quality/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Photo Frame: Quality",
        unique_id: "inkcast_server_photo_quality",
        command_topic: topics.photoQualityCommand,
        state_topic: topics.photoQualityState,
        min: 1,
        max: 100,
        step: 1,
        unit_of_measurement: "%",
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
  ]
}
