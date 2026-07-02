import { timer } from "rxjs"
import type { ConfiguredDevice } from "../config/env.ts"
import {
  fetchFaceBoxes,
  fetchPreviewJpeg,
  type ImmichConfig,
  pickRandomAssetId,
  resolvePersonIds,
} from "../immich/immichClient.ts"
import { preparePhotoFrameImage } from "../immich/photoFrameImage.ts"
import type { DeviceConfigStore } from "../state/deviceConfigStore.ts"
import type { ViewDataStore } from "../state/viewDataStore.ts"
import type { ViewName } from "../views/registry.ts"

const TICK_MILLISECONDS = 60_000
const HISTORY_LIMIT = 20

type PhotoHistory = {
  assetIds: readonly string[]
  cursorIndex: number
}

/**
 * The Immich photo-frame adapter. Each minute it looks at every device whose
 * selected view is "Photo Frame" and, when the
 * current photo is older than the rotation interval (or missing), fetches a
 * fresh recency-weighted random photo matching the device's people and/or
 * smart-search query, crops it face-aware to the exact panel, stores it, and
 * re-pushes the device. `refreshDevice` also runs directly when the people or
 * query config changes from Home Assistant; `showNextPhoto` /
 * `showPreviousPhoto` walk a per-device history (the HA buttons).
 */
export const createPhotoFrameAdapter = ({
  immichConfig,
  intervalMinutes,
  recencyHalfLifeDays,
  devices,
  deviceConfigStore,
  viewDataStore,
  getActiveView,
  pushDevice,
}: {
  immichConfig: ImmichConfig
  intervalMinutes: number
  recencyHalfLifeDays: number
  devices: readonly ConfiguredDevice[]
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  getActiveView: (deviceId: string) => ViewName
  pushDevice: (deviceId: string) => Promise<boolean>
}) => {
  const intervalMilliseconds = intervalMinutes * 60_000
  const historyByDeviceId = new Map<string, PhotoHistory>()

  const getHistory = (deviceId: string): PhotoHistory =>
    historyByDeviceId.get(deviceId) ?? {
      assetIds: [],
      cursorIndex: -1,
    }

  const recordShownAsset = ({
    deviceId,
    assetId,
  }: {
    deviceId: string
    assetId: string
  }) => {
    const history = getHistory(deviceId)
    // Showing a new asset truncates any forward (redo) tail, then caps the
    // history at HISTORY_LIMIT by dropping the oldest entries.
    const trimmed = history.assetIds
      .slice(0, history.cursorIndex + 1)
      .concat(assetId)
    const capped = trimmed.slice(-HISTORY_LIMIT)
    historyByDeviceId.set(deviceId, {
      assetIds: capped,
      cursorIndex: capped.length - 1,
    })
  }

  /** Fetch + crop + store + push one specific asset for one device. */
  const showAsset = async ({
    device,
    assetId,
    personIds,
  }: {
    device: ConfiguredDevice
    assetId: string
    personIds: readonly string[]
  }) => {
    const [jpegBytes, faceBoxes] = await Promise.all([
      fetchPreviewJpeg({
        config: immichConfig,
        assetId,
      }),
      fetchFaceBoxes({
        config: immichConfig,
        assetId,
        personIds,
      }),
    ])
    const { png, mode } = await preparePhotoFrameImage({
      jpegBytes,
      targetWidth: device.width,
      targetHeight: device.height,
      faceBoxes,
    })

    viewDataStore.setPhotoFrame({
      deviceId: device.id,
      data: {
        photoDataUri: `data:image/png;base64,${png.toString("base64")}`,
        assetId,
        fetchedAtMs: Date.now(),
      },
    })
    console.log(
      `[inkcast] photo frame ${device.id}: asset ${assetId.slice(0, 8)} [${mode}]`,
    )
    await pushDevice(device.id)
  }

  /**
   * Resolve the device's people + query config. Returns null when the device
   * has no photo source configured at all (nothing to show).
   */
  const resolvePhotoSource = async (deviceId: string) => {
    const peopleText =
      deviceConfigStore.getPhotoPeople(deviceId)
    const queryText = deviceConfigStore
      .getPhotoQuery(deviceId)
      .trim()
    if (!peopleText && !queryText) {
      return null
    }

    const { personIds, unknownNames } = peopleText
      ? await resolvePersonIds({
          config: immichConfig,
          peopleText,
        })
      : { personIds: [], unknownNames: [] }
    if (unknownNames.length > 0) {
      console.error(
        `[inkcast] photo frame ${deviceId}: unknown Immich people: ${unknownNames.join(", ")}`,
      )
    }
    if (personIds.length === 0 && !queryText) {
      return null
    }

    return { personIds, queryText }
  }

  /**
   * Fetch + crop + store + push a fresh random photo for the device. Returns
   * true only when a photo was actually pushed — false when nothing is
   * configured, nothing matched, or the fetch failed (so callers can decide
   * whether to fall back to the placeholder).
   */
  const refreshDevice = async (deviceId: string) => {
    const device = devices.find(
      (candidate) => candidate.id === deviceId,
    )
    if (!device) {
      return false
    }

    try {
      const source = await resolvePhotoSource(deviceId)
      if (!source) {
        return false
      }

      const assetId = await pickRandomAssetId({
        config: immichConfig,
        personIds: source.personIds,
        query: source.queryText || undefined,
        recencyHalfLifeDays,
      })
      if (!assetId) {
        console.error(
          `[inkcast] photo frame ${deviceId}: no assets match the configured people/query`,
        )
        return false
      }

      await showAsset({
        device,
        assetId,
        personIds: source.personIds,
      })
      recordShownAsset({ deviceId, assetId })
      return true
    } catch (error) {
      console.error(
        `[inkcast] photo frame ${deviceId}: fetch failed`,
        error,
      )
      return false
    }
  }

  /**
   * Run when a device switches INTO the Photo Frame view. A cached photo is
   * shown immediately (the interval tick handles rotation); otherwise a fresh
   * one is fetched. Only when there is genuinely nothing to show — no photo
   * cached and no people/query configured (or the fetch failed) — does it push
   * the instructional placeholder. Exactly one push happens either way, so
   * e-ink never flashes the placeholder before the photo.
   */
  const showPhotoFrame = async (deviceId: string) => {
    const current = viewDataStore.getPhotoFrame(deviceId)
    if (current) {
      await pushDevice(deviceId)
      return
    }

    const hasPushedPhoto = await refreshDevice(deviceId)
    if (!hasPushedPhoto) {
      await pushDevice(deviceId)
    }
  }

  /** Step through the per-device history; `next` past the end = new random. */
  const navigateHistory = async ({
    deviceId,
    step,
  }: {
    deviceId: string
    step: -1 | 1
  }) => {
    const device = devices.find(
      (candidate) => candidate.id === deviceId,
    )
    if (!device) {
      return
    }

    const history = getHistory(deviceId)
    const targetIndex = history.cursorIndex + step
    if (
      step === 1 &&
      targetIndex > history.assetIds.length - 1
    ) {
      await refreshDevice(deviceId)
      return
    }
    if (
      targetIndex < 0 ||
      targetIndex > history.assetIds.length - 1
    ) {
      return
    }

    try {
      const source = await resolvePhotoSource(deviceId)
      await showAsset({
        device,
        assetId: history.assetIds[targetIndex],
        personIds: source?.personIds ?? [],
      })
      historyByDeviceId.set(deviceId, {
        assetIds: history.assetIds,
        cursorIndex: targetIndex,
      })
    } catch (error) {
      console.error(
        `[inkcast] photo frame ${deviceId}: history navigation failed`,
        error,
      )
    }
  }

  const showNextPhoto = (deviceId: string) =>
    navigateHistory({ deviceId, step: 1 })
  const showPreviousPhoto = (deviceId: string) =>
    navigateHistory({ deviceId, step: -1 })

  const subscription = timer(
    TICK_MILLISECONDS,
    TICK_MILLISECONDS,
  ).subscribe(() => {
    devices
      .filter(
        (device) =>
          getActiveView(device.id) === "Photo Frame",
      )
      .forEach((device) => {
        const current = viewDataStore.getPhotoFrame(
          device.id,
        )
        const isStale =
          !current ||
          Date.now() - current.fetchedAtMs >=
            intervalMilliseconds
        if (isStale) {
          void refreshDevice(device.id)
        }
      })
  })

  return {
    refreshDevice,
    showPhotoFrame,
    showNextPhoto,
    showPreviousPhoto,
    close: () => {
      subscription.unsubscribe()
    },
  }
}
