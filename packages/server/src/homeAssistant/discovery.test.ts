import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import { describe, expect, test } from "vitest"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
  buildGlobalDiscoveryMessages,
} from "./discovery.ts"

describe("buildDeviceTopics", () => {
  test("derives all runtime topics from the base + device id", () => {
    const topics = buildDeviceTopics({
      device: PHAT_DEVICE,
    })

    expect(topics.image).toBe("inkcast/inky-phat/image")
    expect(topics.viewCommand).toBe(
      "inkcast/inky-phat/view/set",
    )
    expect(topics.lastRender).toBe(
      "inkcast/inky-phat/last_render",
    )
  })

  test("honours a custom base topic", () => {
    const topics = buildDeviceTopics({
      baseTopic: "displays",
      device: PHAT_DEVICE,
    })

    expect(topics.image).toBe("displays/inky-phat/image")
  })
})

describe("buildAvailabilityTopic", () => {
  test("is one bridge-level topic, not per device", () => {
    expect(buildAvailabilityTopic()).toBe(
      "inkcast/availability",
    )
    expect(buildAvailabilityTopic("displays")).toBe(
      "displays/availability",
    )
  })
})

describe("buildDiscoveryMessages", () => {
  const messages = buildDiscoveryMessages({
    device: PHAT_DEVICE,
    viewNames: ["Now Playing (Dashboard)", "Clock"],
  })

  test("emits the full entity set for a mono panel (no colour-mode select)", () => {
    const components = messages.map(
      (message) => message.topic.split("/")[1],
    )
    expect(components).toEqual([
      "image",
      "select", // view
      "button", // refresh
      "select", // Display: Dither
      "select", // Display: Rotation
      "number", // Display: Brightness
      "number", // Display: Saturation
      "number", // Display: Crop top
      "number", // Display: Crop right
      "number", // Display: Crop bottom
      "number", // Display: Crop left
      "text", // Photo Frame: People
      "text", // Photo Frame: Query
      "text", // Clock: Timezone
      "select", // Clock: Time format
      "select", // Clock: Date style
      "number", // Photo Frame: Rotation minutes
      "number", // Photo Frame: Recency half-life days
      "select", // Photo Frame: Format
      "number", // Photo Frame: Quality
      "button", // Photo Frame: Next photo
      "button", // Photo Frame: Previous photo
      "sensor", // last render
    ])
  })

  test("the global device exposes the clock + inherited photo-frame defaults", () => {
    // HA pushes now-playing/weather/agenda data, so the server no longer
    // advertises a Music-playing sensor or Weather/Agenda entity-picker config.
    const globalMessages = buildGlobalDiscoveryMessages()
    expect(
      globalMessages.map((message) => message.topic),
    ).toEqual([
      "homeassistant/text/inkcast/server_clock_timezone/config",
      "homeassistant/select/inkcast/server_clock_time_format/config",
      "homeassistant/select/inkcast/server_clock_date_style/config",
      "homeassistant/number/inkcast/server_photo_interval/config",
      "homeassistant/number/inkcast/server_photo_recency/config",
      "homeassistant/select/inkcast/server_photo_format/config",
      "homeassistant/number/inkcast/server_photo_quality/config",
    ])
    expect(
      (
        globalMessages[0].payload.device as {
          name: string
        }
      ).name,
    ).toBe("CastKit Server")
  })

  test("adds the colour-mode select on a colour panel only", () => {
    const colourMessages = buildDiscoveryMessages({
      device: IMPRESSION_DEVICE,
      viewNames: ["Clock"],
    })

    const colourModeMessage = colourMessages.find(
      (message) => message.topic.includes("_colour_mode/"),
    )
    expect(colourModeMessage?.payload.options).toEqual([
      "Color",
      "Black & White",
    ])
    expect(
      messages.some((message) =>
        message.topic.includes("_colour_mode/"),
      ),
    ).toBe(false)
  })

  test("the per-device photo-format select offers Auto + the three formats", () => {
    const formatMessage = messages.find((message) =>
      message.topic.includes("_photo_format/"),
    )
    expect(formatMessage?.payload.options).toEqual([
      "Auto",
      "JPEG",
      "WebP",
      "PNG",
    ])
    // The global default select has no "Auto" — it is the root default.
    const globalFormatMessage =
      buildGlobalDiscoveryMessages().find((message) =>
        message.topic.includes("server_photo_format/"),
      )
    expect(globalFormatMessage?.payload.options).toEqual([
      "JPEG",
      "WebP",
      "PNG",
    ])
  })

  test("the per-device rotation select offers 0/90/180/270", () => {
    const rotationMessage = messages.find((message) =>
      message.topic.includes("_rotation/"),
    )
    expect(rotationMessage?.payload.options).toEqual([
      "0",
      "90",
      "180",
      "270",
    ])
    expect(rotationMessage?.payload.name).toBe(
      "Display: Rotation",
    )
  })

  test("every message is retained with a device-scoped unique_id", () => {
    messages.forEach((message) => {
      expect(message.isRetained).toBe(true)
      expect(message.payload.unique_id).toContain(
        "inkcast_inky-phat_",
      )
    })
  })

  test("the image entity points at the device image topic", () => {
    const imageMessage = messages.find((message) =>
      message.topic.startsWith("homeassistant/image/"),
    )

    expect(imageMessage?.payload.image_topic).toBe(
      "inkcast/inky-phat/image",
    )
    expect(imageMessage?.payload.content_type).toBe(
      "image/png",
    )
  })

  test("the select lists the provided views", () => {
    const selectMessage = messages.find((message) =>
      message.topic.startsWith("homeassistant/select/"),
    )

    expect(selectMessage?.payload.options).toEqual([
      "Now Playing (Dashboard)",
      "Clock",
    ])
  })

  test("respects a custom discovery prefix + node id", () => {
    const custom = buildDiscoveryMessages({
      device: PHAT_DEVICE,
      viewNames: ["Clock"],
      config: { discoveryPrefix: "ha", nodeId: "ink" },
    })

    expect(custom[0].topic).toBe(
      "ha/image/ink/inky-phat_screen/config",
    )
  })
})
