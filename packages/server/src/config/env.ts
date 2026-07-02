import { readFileSync } from "node:fs"
import {
  type DeviceMetadata,
  DITHER_ALGORITHMS,
  SEED_DEVICES,
} from "@inkcast/core/devices/device"
import {
  E6_DEFAULT_PALETTE,
  MONO_PALETTE,
} from "@inkcast/core/panels/palette"
import * as z from "zod/mini"

/**
 * Runtime configuration, validated from environment variables. Everything
 * house-specific (hostnames, credentials, real device MACs, TLS material) lives
 * here and comes from the gitignored `.env` / device-config file — never from
 * committed source. See `.env.example`.
 *
 * Uses `zod/mini` (the tree-shakeable variant) — available here because Inkcast
 * builds its OpenAPI from zod's native `toJSONSchema`, not `@hono/zod-openapi`.
 */

const EnvSchema = z.object({
  PORT: z._default(z.coerce.number(), 8788),
  INKCAST_API_TOKEN: z._default(z.string(), ""),
  INKCAST_RENDER_ENGINE: z._default(
    z.enum(["chromium", "satori"]),
    "chromium",
  ),
  INKCAST_DEVICES_FILE: z.optional(z.string()),
  MQTT_URL: z._default(z.string(), ""),
  MQTT_USERNAME: z._default(z.string(), ""),
  MQTT_PASSWORD: z._default(z.string(), ""),
  MQTT_CA_FILE: z.optional(z.string()),
  MQTT_REJECT_UNAUTHORIZED: z._default(
    z.enum(["true", "false"]),
    "true",
  ),
  MQTT_DISCOVERY_PREFIX: z._default(
    z.string(),
    "homeassistant",
  ),
  MQTT_NODE_ID: z._default(z.string(), "inkcast"),
  MQTT_BASE_TOPIC: z._default(z.string(), "inkcast"),
  HOME_ASSISTANT_URL: z._default(z.string(), ""),
  HOME_ASSISTANT_TOKEN: z._default(z.string(), ""),
  HOME_ASSISTANT_NOW_PLAYING_ENTITY: z._default(
    z.string(),
    "",
  ),
  HOME_ASSISTANT_FOLLOW_PLATFORMS: z._default(
    z.string(),
    "music_assistant,plex",
  ),
  HOME_ASSISTANT_WEATHER_ENTITY: z._default(z.string(), ""),
  IMMICH_URL: z._default(z.string(), ""),
  IMMICH_API_TOKEN: z._default(z.string(), ""),
  INKCAST_PHOTO_MINUTES: z._default(z.coerce.number(), 10),
  INKCAST_PHOTO_RECENCY_HALF_LIFE_DAYS: z._default(
    z.coerce.number(),
    365,
  ),
})

/**
 * A device as written in the gitignored devices file. Palette is derived from
 * `colourMode`, so a real deployment never has to hand-write RGB triples.
 */
const DeviceConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  mac: z.string(),
  width: z.int().check(z.positive()),
  height: z.int().check(z.positive()),
  colourMode: z.enum(["mono", "e6"]),
  rotation: z._default(
    z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    0,
  ),
  ditherProfile: z._default(
    z.object({
      algorithm: z.enum(DITHER_ALGORITHMS),
      supersampleFactor: z.number().check(z.positive()),
    }),
    { algorithm: "floyd-steinberg", supersampleFactor: 2 },
  ),
  nowPlayingEntityId: z.optional(z.string()),
  idleViewName: z.optional(z.string()),
})

/**
 * A device as the server runs it: the core render metadata plus the server's
 * per-device data-source wiring (which HA `media_player` feeds its
 * now-playing view).
 */
export type ConfiguredDevice = DeviceMetadata & {
  nowPlayingEntityId?: string
}

const expandDevice = (
  deviceConfig: z.infer<typeof DeviceConfigSchema>,
) => ({
  ...deviceConfig,
  palette:
    deviceConfig.colourMode === "mono"
      ? MONO_PALETTE
      : E6_DEFAULT_PALETTE,
})

/** Load the real devices from the config file, or fall back to the examples. */
const loadDevices = (
  devicesFile: string | undefined,
): readonly ConfiguredDevice[] => {
  if (!devicesFile) {
    return SEED_DEVICES
  }

  const parsed = z
    .array(DeviceConfigSchema)
    .parse(JSON.parse(readFileSync(devicesFile, "utf8")))

  return parsed.map(expandDevice)
}

export type MqttConfig = {
  url: string
  username: string
  password: string
  caFile: string | undefined
  isRejectUnauthorized: boolean
  discoveryPrefix: string
  nodeId: string
  baseTopic: string
}

export type HomeAssistantConfig = {
  url: string
  token: string
  /** Integrations whose players the follow mode tracks. */
  followedPlatforms: readonly string[]
  /** HA weather entity feeding the weather-bearing clock view ("" = off). */
  weatherEntityId: string
}

export type ImmichSettings = {
  url: string
  apiKey: string
  /** Photo-frame rotation interval, minutes. */
  intervalMinutes: number
  /** Recency-weighting half-life for the random photo pick, days. */
  recencyHalfLifeDays: number
}

export type InkcastConfig = {
  port: number
  apiToken: string
  renderEngine: "chromium" | "satori"
  devices: readonly ConfiguredDevice[]
  mqtt: MqttConfig
  homeAssistant: HomeAssistantConfig
  immich: ImmichSettings
}

/** Parse + validate configuration from `process.env`. Throws on bad input. */
export const loadConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): InkcastConfig => {
  const parsed = EnvSchema.parse(environment)
  const devices = loadDevices(
    parsed.INKCAST_DEVICES_FILE,
  ).map((device) => ({
    ...device,
    // No pinned entity anywhere = follow-the-active-player mode.
    nowPlayingEntityId:
      device.nowPlayingEntityId ||
      parsed.HOME_ASSISTANT_NOW_PLAYING_ENTITY ||
      undefined,
  }))

  return {
    port: parsed.PORT,
    apiToken: parsed.INKCAST_API_TOKEN,
    renderEngine: parsed.INKCAST_RENDER_ENGINE,
    devices,
    mqtt: {
      url: parsed.MQTT_URL,
      username: parsed.MQTT_USERNAME,
      password: parsed.MQTT_PASSWORD,
      caFile: parsed.MQTT_CA_FILE,
      isRejectUnauthorized:
        parsed.MQTT_REJECT_UNAUTHORIZED === "true",
      discoveryPrefix: parsed.MQTT_DISCOVERY_PREFIX,
      nodeId: parsed.MQTT_NODE_ID,
      baseTopic: parsed.MQTT_BASE_TOPIC,
    },
    homeAssistant: {
      url: parsed.HOME_ASSISTANT_URL,
      token: parsed.HOME_ASSISTANT_TOKEN,
      followedPlatforms:
        parsed.HOME_ASSISTANT_FOLLOW_PLATFORMS.split(",")
          .map((platform) => platform.trim())
          .filter((platform) => platform.length > 0),
      weatherEntityId: parsed.HOME_ASSISTANT_WEATHER_ENTITY,
    },
    immich: {
      url: parsed.IMMICH_URL,
      apiKey: parsed.IMMICH_API_TOKEN,
      intervalMinutes: parsed.INKCAST_PHOTO_MINUTES,
      recencyHalfLifeDays:
        parsed.INKCAST_PHOTO_RECENCY_HALF_LIFE_DAYS,
    },
  }
}
