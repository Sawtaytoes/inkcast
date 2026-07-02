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
 * EFFECTIVE view is "Photo Frame" (selected, or idle-fallback) and, when the
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
  getEffectiveView,
  pushDevice,
}: {
  immichConfig: ImmichConfig
  intervalMinutes: number
  recencyHalfLifeDays: number
  devices: readonly ConfiguredDevice[]
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  getEffectiveView: (deviceId: string) => ViewName
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

  const refreshDevice = async (deviceId: string) => {
    const device = devices.find(
      (candidate) => candidate.id === deviceId,
    )
    if (!device) {
      return
    }

    try {
      const source = await resolvePhotoSource(deviceId)
      if (!source) {
        return
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
        return
      }

      await showAsset({
        device,
        assetId,
        personIds: source.personIds,
      })
      recordShownAsset({ deviceId, assetId })
    } catch (error) {
      console.error(
        `[inkcast] photo frame ${deviceId}: fetch failed`,
        error,
      )
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
          getEffectiveView(device.id) === "Photo Frame",
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
    showNextPhoto,
    showPreviousPhoto,
    close: () => {
      subscription.unsubscribe()
    },
  }
}
