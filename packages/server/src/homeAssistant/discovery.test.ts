import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@inkcast/core/devices/device"
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
      "number", // Display: Brightness
      "number", // Display: Saturation
      "select", // Now Playing: Idle view
      "number", // Now Playing: Idle minutes
      "text", // Photo Frame: People
      "text", // Photo Frame: Query
      "button", // Photo Frame: Next photo
      "button", // Photo Frame: Previous photo
      "sensor", // last render
    ])
  })

  test("the idle-view select offers None plus every view", () => {
    const idleViewMessage = messages.find((message) =>
      message.topic.includes("_idle_view/"),
    )
    expect(idleViewMessage?.payload.options).toEqual([
      "None",
      "Now Playing (Dashboard)",
      "Clock",
    ])
  })

  test("the global device exposes the follow-exclusion text", () => {
    const globalMessages = buildGlobalDiscoveryMessages()
    expect(globalMessages).toHaveLength(1)
    expect(globalMessages[0].topic).toBe(
      "homeassistant/text/inkcast/server_follow_exclude/config",
    )
    expect(globalMessages[0].payload.command_topic).toBe(
      "inkcast/config/follow_exclude/set",
    )
    expect(
      (
        globalMessages[0].payload.device as {
          name: string
        }
      ).name,
    ).toBe("Inkcast Server")
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
