import {
  type DeviceMetadata,
  DITHER_ALGORITHMS,
} from "@castkit/core/devices/device"
import type {
  DiscoveryMessage,
  HaDiscoveryConfig,
} from "@castkit/shared/discovery/types"

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

/**
 * The generic discovery shapes + the bridge availability topic moved to
 * `@castkit/shared` (both client modes use them); re-exported so existing
 * import sites keep working.
 */
export {
  buildAvailabilityTopic,
  type DiscoveryMessage,
  type HaDiscoveryConfig,
} from "@castkit/shared/discovery/types"

import { buildAvailabilityTopic } from "@castkit/shared/discovery/types"

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
    // View data HA pushes to this display (retained). Inkcast renders what it's
    // handed; it never reads HA. See docs/decisions/
    // 2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md.
    nowPlayingDataCommand: `${base}/now_playing/set`,
    weatherDataCommand: `${base}/weather/set`,
    agendaDataCommand: `${base}/agenda/set`,
    photoPeopleCommand: `${base}/photo_people/set`,
    photoPeopleState: `${base}/photo_people`,
    photoQueryCommand: `${base}/photo_query/set`,
    photoQueryState: `${base}/photo_query`,
    clockTimezoneCommand: `${base}/clock_timezone/set`,
    clockTimezoneState: `${base}/clock_timezone`,
    clockTimeFormatCommand: `${base}/clock_time_format/set`,
    clockTimeFormatState: `${base}/clock_time_format`,
    clockDateStyleCommand: `${base}/clock_date_style/set`,
    clockDateStyleState: `${base}/clock_date_style`,
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
    rotationCommand: `${base}/rotation/set`,
    rotationState: `${base}/rotation`,
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
  /** Global default clock timezone (IANA name; empty = process `TZ`). */
  clockTimezoneCommand: `${baseTopic}/clock_timezone/set`,
  clockTimezoneState: `${baseTopic}/clock_timezone`,
  /** Global default clock time format (12-hour / 24-hour). */
  clockTimeFormatCommand: `${baseTopic}/clock_time_format/set`,
  clockTimeFormatState: `${baseTopic}/clock_time_format`,
  /** Global default clock date style (Long / Numeric). */
  clockDateStyleCommand: `${baseTopic}/clock_date_style/set`,
  clockDateStyleState: `${baseTopic}/clock_date_style`,
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
 * HA-facing panel-rotation option strings (double as MQTT payloads). Clockwise
 * degrees the server applies before the panel draws — corrects a remounted or
 * upside-down panel live.
 */
export const ROTATION_OPTIONS = [
  "0",
  "90",
  "180",
  "270",
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

/**
 * HA-facing clock time-format options (double as MQTT payloads). The global
 * default select offers the two real formats; a per-device select prepends
 * "Auto" (= inherit the global default).
 */
export const GLOBAL_CLOCK_TIME_FORMAT_OPTIONS = [
  "12-hour",
  "24-hour",
] as const

export const CLOCK_TIME_FORMAT_OPTIONS = [
  "Auto",
  ...GLOBAL_CLOCK_TIME_FORMAT_OPTIONS,
] as const

/** HA-facing clock date-style options (double as MQTT payloads). */
export const GLOBAL_CLOCK_DATE_STYLE_OPTIONS = [
  "Long",
  "Numeric",
] as const

export const CLOCK_DATE_STYLE_OPTIONS = [
  "Auto",
  ...GLOBAL_CLOCK_DATE_STYLE_OPTIONS,
] as const

/** The HA `device` block that ties every entity to one physical display. */
const buildDeviceBlock = (device: DeviceMetadata) => ({
  identifiers: [`inkcast_${device.id}`],
  connections: [["mac", device.mac]],
  name: device.label,
  manufacturer: "CastKit",
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
    {
      // Mount orientation (clockwise degrees). Correct a remounted / upside-down
      // panel here — the panel Pi's own INKCAST_ROTATE must stay 0 or rotation
      // is applied twice.
      topic: discoveryTopic("select", "rotation"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Display: Rotation",
        unique_id: `inkcast_${device.id}_rotation`,
        options: Array.from(ROTATION_OPTIONS),
        command_topic: topics.rotationCommand,
        state_topic: topics.rotationState,
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
      // This device's clock timezone (an IANA name, e.g. America/Chicago).
      // Empty = inherit the global default on the Inkcast Server device.
      topic: discoveryTopic("text", "clock_timezone"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Clock: Timezone",
        unique_id: `inkcast_${device.id}_clock_timezone`,
        command_topic: topics.clockTimezoneCommand,
        state_topic: topics.clockTimezoneState,
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // This device's clock time format; "Auto" = inherit the global default.
      topic: discoveryTopic("select", "clock_time_format"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Clock: Time format",
        unique_id: `inkcast_${device.id}_clock_time_format`,
        command_topic: topics.clockTimeFormatCommand,
        state_topic: topics.clockTimeFormatState,
        options: [...CLOCK_TIME_FORMAT_OPTIONS],
        entity_category: "config",
        device: deviceBlock,
      },
    },
    {
      // This device's clock date style; "Auto" = inherit the global default.
      topic: discoveryTopic("select", "clock_date_style"),
      isRetained: true,
      payload: {
        ...availability,
        name: "Clock: Date style",
        unique_id: `inkcast_${device.id}_clock_date_style`,
        command_topic: topics.clockDateStyleCommand,
        state_topic: topics.clockDateStyleState,
        options: [...CLOCK_DATE_STYLE_OPTIONS],
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
    // identifiers/unique_ids keep the historical "inkcast_" prefix so HA
    // doesn't recreate entities — only the display strings are CastKit.
    identifiers: ["inkcast_server"],
    name: "CastKit Server",
    manufacturer: "CastKit",
    model: "render server",
  }

  return [
    {
      // Global default clock timezone (IANA name) — used by any display whose
      // own "Clock: Timezone" is empty; empty here too = the process `TZ`.
      topic: `${discoveryPrefix}/text/${nodeId}/server_clock_timezone/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Clock: Timezone",
        unique_id: "inkcast_server_clock_timezone",
        command_topic: topics.clockTimezoneCommand,
        state_topic: topics.clockTimezoneState,
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default clock time format — used by any display whose own
      // "Clock: Time format" is "Auto".
      topic: `${discoveryPrefix}/select/${nodeId}/server_clock_time_format/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Clock: Time format",
        unique_id: "inkcast_server_clock_time_format",
        command_topic: topics.clockTimeFormatCommand,
        state_topic: topics.clockTimeFormatState,
        options: [...GLOBAL_CLOCK_TIME_FORMAT_OPTIONS],
        entity_category: "config",
        device: serverDeviceBlock,
      },
    },
    {
      // Global default clock date style — used by any display whose own
      // "Clock: Date style" is "Auto".
      topic: `${discoveryPrefix}/select/${nodeId}/server_clock_date_style/config`,
      isRetained: true as const,
      payload: {
        ...availability,
        name: "Clock: Date style",
        unique_id: "inkcast_server_clock_date_style",
        command_topic: topics.clockDateStyleCommand,
        state_topic: topics.clockDateStyleState,
        options: [...GLOBAL_CLOCK_DATE_STYLE_OPTIONS],
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
