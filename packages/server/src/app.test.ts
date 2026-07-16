import { describe, expect, test } from "vitest"
import { createApp } from "./app.ts"
import { loadConfig } from "./config/env.ts"
import { createRenderTokenStore } from "./state/renderTokenStore.ts"

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const makeApp = ({
  render = async () => PNG as Buffer | null,
} = {}) =>
  createApp({
    config: loadConfig({}),
    deviceStore: { getActiveView: () => "Clock" } as never,
    pushController: { renderDevice: render } as never,
    renderTokenStore: createRenderTokenStore(),
  })

describe("render token delivery", () => {
  test("mint, then fetch via the .png URL, returns the PNG (single-use)", async () => {
    const app = makeApp()

    const mint = await app.request(
      "/api/devices/m5paper/render",
      {
        method: "POST",
      },
    )
    expect(mint.status).toBe(200)
    const { token, url } = (await mint.json()) as {
      token: string
      url: string
    }
    // The URL the device is handed ends in `.png`.
    expect(url).toMatch(/\/render\/[0-9a-f]+\.png$/)

    // Fetching that exact `.png` URL must return the image — the `.png`
    // extension on the path param must not break the token lookup.
    const first = await app.request(`/render/${token}.png`)
    expect(first.status).toBe(200)
    expect(first.headers.get("content-type")).toBe(
      "image/png",
    )
    expect(Buffer.from(await first.arrayBuffer())).toEqual(
      PNG,
    )

    // Single-use: the token is evicted after the first fetch.
    const second = await app.request(`/render/${token}.png`)
    expect(second.status).toBe(404)
  })

  test("render for an unknown device 404s", async () => {
    const app = makeApp({ render: async () => null })
    const res = await app.request(
      "/api/devices/nope/render",
      {
        method: "POST",
      },
    )
    expect(res.status).toBe(404)
  })
})
