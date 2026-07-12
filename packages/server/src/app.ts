import { apiReference } from "@scalar/hono-api-reference"
import { Hono } from "hono"
import { bearerAuth } from "hono/bearer-auth"
import { buildOpenApiDocument } from "./api/openapi.ts"
import { SetViewRequestSchema } from "./api/schemas.ts"
import type { InkcastConfig } from "./config/env.ts"
import type { PushController } from "./pushController.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import type { RenderTokenStore } from "./state/renderTokenStore.ts"
import { VIEW_NAMES } from "./views/registry.ts"

/**
 * The Inkcast HTTP API (Hono). Token-authenticated (a Bearer token, no
 * user/password by preference); `/health` stays open. Lets an
 * agent or HA list devices, fetch the current rendered image, force a refresh,
 * or switch a device's view. The same actions are reachable over MQTT.
 *
 * Image-delivery endpoint: `/render/<token>.png` is public (no token needed);
 * `/api/devices/:id/render` is token-gated and mints single-use render tokens.
 */
export const createApp = ({
  config,
  deviceStore,
  pushController,
  renderTokenStore,
}: {
  config: InkcastConfig
  deviceStore: DeviceStore
  pushController: PushController
  renderTokenStore: RenderTokenStore
}) => {
  const app = new Hono()

  // Bare domain → the interactive API docs (otherwise "/" is a bare 404).
  app.get("/", (context) => context.redirect("/docs"))

  app.get("/health", (context) =>
    context.json({ status: "ok", views: VIEW_NAMES }),
  )

  // OpenAPI spec + Scalar docs UI (public — no token needed to read the docs).
  app.get("/openapi.json", (context) =>
    context.json(buildOpenApiDocument({ config })),
  )
  app.get("/docs", apiReference({ url: "/openapi.json" }))

  // Token-gate the API surface. With no token set (LAN/dev), the API is open.
  if (config.apiToken) {
    app.use(
      "/api/*",
      bearerAuth({ token: config.apiToken }),
    )
  }

  app.get("/api/devices", (context) =>
    context.json({
      devices: config.devices.map((device) => ({
        id: device.id,
        label: device.label,
        width: device.width,
        height: device.height,
        colourMode: device.colourMode,
        rotation: device.rotation,
        activeView: deviceStore.getActiveView(device.id),
      })),
    }),
  )

  app.get("/api/devices/:id/image", async (context) => {
    const image = await pushController.renderDevice(
      context.req.param("id"),
    )
    if (!image) {
      return context.json({ error: "unknown device" }, 404)
    }

    return context.body(new Uint8Array(image), 200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    })
  })

  app.post("/api/devices/:id/refresh", async (context) => {
    const isPushed = await pushController.pushDevice(
      context.req.param("id"),
    )
    return isPushed
      ? context.json({ ok: true })
      : context.json({ error: "unknown device" }, 404)
  })

  app.post("/api/devices/:id/view", async (context) => {
    const body = await context.req.json().catch(() => null)
    const parsed = SetViewRequestSchema.safeParse(body)

    if (!parsed.success) {
      return context.json(
        {
          error: `invalid view; allowed: ${VIEW_NAMES.join(", ")}`,
        },
        400,
      )
    }

    const isPushed = await pushController.setView({
      deviceId: context.req.param("id"),
      viewName: parsed.data.view,
    })
    return isPushed
      ? context.json({ ok: true, view: parsed.data.view })
      : context.json({ error: "unknown device" }, 404)
  })

  // HTTP image delivery: render a device's current view and return a single-use
  // token URL. HA uses this to mint URLs for ESPHome clients (M5Paper) that
  // fetch over HTTPS rather than MQTT.
  app.post("/api/devices/:id/render", async (context) => {
    const image = await pushController.renderDevice(
      context.req.param("id"),
    )
    if (!image) {
      return context.json({ error: "unknown device" }, 404)
    }

    const token = renderTokenStore.createToken(image)
    const url = `${config.publicUrl}/render/${token}.png`
    return context.json({ token, url })
  })

  // Public image-delivery endpoint: serve a single-use render token's PNG.
  // Evict the token after the response fully flushes (on close/completion).
  // Tokens are unguessable and consumed on fetch for single-use delivery.
  app.get("/render/:token", async (context) => {
    // The delivery URL is `/render/<token>.png`, so the `:token` path param
    // arrives WITH the `.png` extension — strip it before the store lookup
    // (the store is keyed by the bare token). Without this every fetch 404s.
    const token = context.req.param("token").replace(/\.png$/, "")
    const png = renderTokenStore.fetchToken(token)

    if (!png) {
      return context.json({ error: "token not found or already used" }, 404)
    }

    // Copy the bytes into a fixed-length response, then evict (single-use).
    // A fixed-length body carries a Content-Length header, which the ESP32
    // `online_image`/`http_request` client REQUIRES: a chunked/streamed reply
    // reports "Size: 0" on-device and the decode stalls forever (panel never
    // paints). We evict on serve rather than after-flush — for a ~40 KB LAN
    // fetch that's a single clean request, and the TTL sweeper still covers a
    // token that's minted but never fetched.
    const body = new Uint8Array(png)
    renderTokenStore.evictToken(token)

    return context.body(body, 200, {
      "Content-Type": "image/png",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    })
  })

  return app
}
