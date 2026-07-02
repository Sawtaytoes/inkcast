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
import type { DeviceStore } from "../state/deviceStore.ts"
import type { ViewDataStore } from "../state/viewDataStore.ts"

const TICK_MILLISECONDS = 60_000

/**
 * The Immich photo-frame adapter. Each minute it looks at every device whose
 * active view is "Photo Frame" and, when the current photo is older than the
 * rotation interval (or missing, e.g. right after a view switch or a people
 * change), fetches a fresh random photo of the configured people —
 * face-aware-cropped to the exact panel — stores it, and re-pushes the
 * device. `refreshDevice` is also called directly when the per-device people
 * config changes from Home Assistant.
 */
export const createPhotoFrameAdapter = ({
  immichConfig,
  intervalMinutes,
  devices,
  deviceStore,
  deviceConfigStore,
  viewDataStore,
  pushDevice,
}: {
  immichConfig: ImmichConfig
  intervalMinutes: number
  devices: readonly ConfiguredDevice[]
  deviceStore: DeviceStore
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  pushDevice: (deviceId: string) => Promise<boolean>
}) => {
  const intervalMilliseconds = intervalMinutes * 60_000

  const refreshDevice = async (deviceId: string) => {
    const device = devices.find(
      (candidate) => candidate.id === deviceId,
    )
    const peopleText =
      deviceConfigStore.getPhotoPeople(deviceId)
    if (!device || !peopleText) {
      return
    }

    try {
      const { personIds, unknownNames } =
        await resolvePersonIds({
          config: immichConfig,
          peopleText,
        })
      if (unknownNames.length > 0) {
        console.error(
          `[inkcast] photo frame ${deviceId}: unknown Immich people: ${unknownNames.join(", ")}`,
        )
      }
      if (personIds.length === 0) {
        return
      }

      const assetId = await pickRandomAssetId({
        config: immichConfig,
        personIds,
      })
      if (!assetId) {
        console.error(
          `[inkcast] photo frame ${deviceId}: no assets for the configured people`,
        )
        return
      }

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
        deviceId,
        data: {
          photoDataUri: `data:image/png;base64,${png.toString("base64")}`,
          assetId,
          fetchedAtMs: Date.now(),
        },
      })
      console.log(
        `[inkcast] photo frame ${deviceId}: asset ${assetId.slice(0, 8)} [${mode}]`,
      )
      await pushDevice(deviceId)
    } catch (error) {
      console.error(
        `[inkcast] photo frame ${deviceId}: fetch failed`,
        error,
      )
    }
  }

  const subscription = timer(
    TICK_MILLISECONDS,
    TICK_MILLISECONDS,
  ).subscribe(() => {
    devices
      .filter(
        (device) =>
          deviceStore.getActiveView(device.id) ===
          "Photo Frame",
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
    close: () => {
      subscription.unsubscribe()
    },
  }
}
