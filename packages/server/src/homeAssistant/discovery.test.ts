import { PHAT_DEVICE } from "@inkcast/core/devices/device"
import { describe, expect, test } from "vitest"
import {
  buildAvailabilityTopic,
  buildDeviceTopics,
  buildDiscoveryMessages,
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
    viewNames: ["now-playing", "clock"],
  })

  test("emits image, select, button, and sensor entities", () => {
    const components = messages.map(
      (message) => message.topic.split("/")[1],
    )
    expect(components).toEqual([
      "image",
      "select",
      "button",
      "sensor",
    ])
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
      "now-playing",
      "clock",
    ])
  })

  test("respects a custom discovery prefix + node id", () => {
    const custom = buildDiscoveryMessages({
      device: PHAT_DEVICE,
      viewNames: ["clock"],
      config: { discoveryPrefix: "ha", nodeId: "ink" },
    })

    expect(custom[0].topic).toBe(
      "ha/image/ink/inky-phat_screen/config",
    )
  })
})
