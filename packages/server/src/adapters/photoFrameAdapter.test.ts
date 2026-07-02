import { describe, expect, test, vi } from "vitest"
import type { ConfiguredDevice } from "../config/env.ts"
import { createDeviceConfigStore } from "../state/deviceConfigStore.ts"
import { createViewDataStore } from "../state/viewDataStore.ts"
import { createPhotoFrameAdapter } from "./photoFrameAdapter.ts"

const DEVICE_ID = "living-room"

const buildDevice = (): ConfiguredDevice =>
  ({
    id: DEVICE_ID,
    width: 800,
    height: 480,
  }) as unknown as ConfiguredDevice

const buildAdapter = () => {
  const deviceConfigStore = createDeviceConfigStore()
  const viewDataStore = createViewDataStore()
  const pushDevice = vi.fn().mockResolvedValue(true)
  const adapter = createPhotoFrameAdapter({
    immichConfig: {
      url: "http://immich.test",
      apiKey: "key",
    },
    intervalMinutes: 30,
    recencyHalfLifeDays: 30,
    devices: [buildDevice()],
    deviceConfigStore,
    viewDataStore,
    getActiveView: () => "Photo Frame",
    pushDevice,
  })
  return {
    adapter,
    deviceConfigStore,
    viewDataStore,
    pushDevice,
  }
}

describe("photoFrameAdapter.showPhotoFrame", () => {
  test("shows an already-cached photo immediately without refetching", async () => {
    const { adapter, viewDataStore, pushDevice } =
      buildAdapter()
    viewDataStore.setPhotoFrame({
      deviceId: DEVICE_ID,
      data: {
        photoDataUri: "data:image/png;base64,AAAA",
        assetId: "asset-1",
        fetchedAtMs: 1_000,
      },
    })

    await adapter.showPhotoFrame(DEVICE_ID)

    // Exactly one push, and the cached photo is left untouched (no fetch).
    expect(pushDevice).toHaveBeenCalledTimes(1)
    expect(pushDevice).toHaveBeenCalledWith(DEVICE_ID)
    expect(
      viewDataStore.getPhotoFrame(DEVICE_ID)?.assetId,
    ).toBe("asset-1")
  })

  test("renders the placeholder once when nothing is configured", async () => {
    const { adapter, viewDataStore, pushDevice } =
      buildAdapter()

    await adapter.showPhotoFrame(DEVICE_ID)

    // No people/query and no cached photo: a single push renders the
    // placeholder, and no photo data was fetched or stored.
    expect(pushDevice).toHaveBeenCalledTimes(1)
    expect(
      viewDataStore.getPhotoFrame(DEVICE_ID),
    ).toBeUndefined()
  })
})
