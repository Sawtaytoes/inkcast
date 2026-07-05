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
  // Inkcast never connects to Home Assistant. HA PUSHES each display's
  // now-playing / weather / agenda data over MQTT
  // (`inkcast/<device>/{now_playing,weather,agenda}/set`) and Inkcast renders
  // it — so there is no HA URL/token/entity env. See docs/decisions/
  // 2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md. All user-tunable
  // display settings are HA/MQTT config entities, never env vars — see
  // 2026-07-03-user-tunable-view-settings-are-ha-config-entities.md.
  IMMICH_URL: z._default(z.string(), ""),
  IMMICH_API_TOKEN: z._default(z.string(), ""),
  // NOTE: the Photo Frame wire format + lossy quality are HA/MQTT config
  // entities (global default on the Inkcast Server device + a per-screen
  // override), resolved live in index.ts — NOT env vars. Same rule as the
  // photo interval / recency / weather entity above. See docs/decisions/
  // 2026-07-03-user-tunable-view-settings-are-ha-config-entities.md.
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
})

/**
 * A device as the server runs it: just the core render metadata. There is no
 * per-device data-source wiring — Home Assistant pushes each display's view
 * data over MQTT, keyed by device id.
 */
export type ConfiguredDevice = DeviceMetadata

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

export type ImmichSettings = {
  url: string
  apiKey: string
}

export type InkcastConfig = {
  port: number
  apiToken: string
  renderEngine: "chromium" | "satori"
  devices: readonly ConfiguredDevice[]
  mqtt: MqttConfig
  immich: ImmichSettings
}

/** Parse + validate configuration from `process.env`. Throws on bad input. */
export const loadConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): InkcastConfig => {
  const parsed = EnvSchema.parse(environment)
  const devices = loadDevices(parsed.INKCAST_DEVICES_FILE)

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
    immich: {
      url: parsed.IMMICH_URL,
      apiKey: parsed.IMMICH_API_TOKEN,
    },
  }
}
