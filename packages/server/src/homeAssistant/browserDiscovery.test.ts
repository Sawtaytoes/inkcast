import { describe, expect, test } from "vitest"
import type { BrowserDeviceConfig } from "../config/env.ts"
import {
  buildBrowserDeviceTopics,
  buildBrowserDiscoveryMessages,
} from "./browserDiscovery.ts"

const TEST_DEVICE: BrowserDeviceConfig = {
  renderer: "browser",
  id: "dev-square",
  label: "Dev Square",
  mac: "aa:bb:cc:dd:ee:ff",
  width: 720,
  height: 720,
  shape: "square",
  hasTouch: true,
  colour: "full",
}

describe("buildBrowserDeviceTopics", () => {
  test("addresses flat under the base topic", () => {
    const topics = buildBrowserDeviceTopics({
      baseTopic: "castkit",
      deviceId: "dev-square",
    })
    expect(topics.viewCommand).toBe(
      "castkit/dev-square/view/set",
    )
    expect(topics.command).toBe(
      "castkit/dev-square/command",
    )
    expect(topics.queueDataCommand).toBe(
      "castkit/dev-square/queue/set",
    )
    expect(topics.connected).toBe(
      "castkit/dev-square/connected",
    )
  })
})

describe("buildBrowserDiscoveryMessages", () => {
  const messages = buildBrowserDiscoveryMessages({
    device: TEST_DEVICE,
    config: { baseTopic: "castkit", nodeId: "castkit" },
  })

  test("creates the browser entity set", () => {
    expect(
      messages.map((message) => message.topic),
    ).toEqual([
      "homeassistant/select/castkit/dev-square_view/config",
      "homeassistant/button/castkit/dev-square_reload/config",
      "homeassistant/sensor/castkit/dev-square_url/config",
      "homeassistant/binary_sensor/castkit/dev-square_connected/config",
      "homeassistant/select/castkit/dev-square_theme/config",
      "homeassistant/light/castkit/dev-square_backlight/config",
      "homeassistant/select/castkit/dev-square_rotation/config",
      "homeassistant/text/castkit/dev-square_photo_people/config",
      "homeassistant/text/castkit/dev-square_photo_query/config",
      "homeassistant/number/castkit/dev-square_photo_interval/config",
    ])
    expect(
      messages.every((message) => message.isRetained),
    ).toBe(true)
  })

  test("ties every entity to one CastKit device with the capability model string", () => {
    const devices = messages.map(
      (message) => message.payload.device,
    )
    devices.forEach((device) => {
      expect(device).toEqual({
        identifiers: ["castkit_dev-square"],
        connections: [["mac", "aa:bb:cc:dd:ee:ff"]],
        name: "Dev Square",
        manufacturer: "CastKit",
        model: "browser · touch · full · 720×720 square",
      })
    })
  })

  test("availability points at the bridge topic (backlight: the Pi agent's LWT)", () => {
    messages.forEach((message) => {
      expect(message.payload.availability_topic).toBe(
        message.topic.includes("_backlight/")
          ? "castkit/dev-square/backlight/available"
          : "castkit/availability",
      )
    })
  })

  test("the backlight is a dimmable light on the Pi agent's brightness topics", () => {
    const backlight = messages.find((message) =>
      message.topic.includes(
        "light/castkit/dev-square_backlight/",
      ),
    )!
    expect(backlight.payload.command_topic).toBe(
      "castkit/dev-square/backlight/set",
    )
    expect(backlight.payload.brightness_command_topic).toBe(
      "castkit/dev-square/backlight/brightness/set",
    )
    expect(backlight.payload.brightness_state_topic).toBe(
      "castkit/dev-square/backlight/brightness",
    )
    expect(backlight.payload.brightness_scale).toBe(255)
  })

  test("the View select offers the capability-filtered views", () => {
    const viewSelect = messages[0]!
    expect(viewSelect.payload.options).toEqual([
      "Now Playing",
      "Queue",
      "Ambient",
      "Clock",
      "Weather",
      "Calendar",
      "Photo Frame",
    ])
  })
})
