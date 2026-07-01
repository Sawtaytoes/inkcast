import { Hono } from "hono"
import { bearerAuth } from "hono/bearer-auth"
import type { InkcastConfig } from "./config/env.ts"
import type { PushController } from "./pushController.ts"
import type { DeviceStore } from "./state/deviceStore.ts"
import {
  getIsViewName,
  VIEW_NAMES,
} from "./views/registry.ts"

/**
 * The Inkcast HTTP API (Hono). Token-authenticated (a Bearer token, no
 * user/password by preference); `/health` stays open. Lets an
 * agent or HA list devices, fetch the current rendered image, force a refresh,
 * or switch a device's view. The same actions are reachable over MQTT.
 */
export const createApp = ({
  config,
  deviceStore,
  pushController,
}: {
  config: InkcastConfig
  deviceStore: DeviceStore
  pushController: PushController
}) => {
  const app = new Hono()

  app.get("/health", (context) =>
    context.json({ status: "ok", views: VIEW_NAMES }),
  )

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
    const body = await context.req
      .json<{ view?: unknown }>()
      .catch(() => ({ view: undefined }))

    if (
      typeof body.view !== "string" ||
      !getIsViewName(body.view)
    ) {
      return context.json(
        { error: "invalid view", allowed: VIEW_NAMES },
        400,
      )
    }

    const isPushed = await pushController.setView({
      deviceId: context.req.param("id"),
      viewName: body.view,
    })
    return isPushed
      ? context.json({ ok: true, view: body.view })
      : context.json({ error: "unknown device" }, 404)
  })

  return app
}
