import { timer } from "rxjs"
import type { ConfiguredDevice } from "../config/env.ts"
import {
  fetchFaceBoxes,
  fetchPreviewJpeg,
  type ImmichConfig,
  pickRandomAssetId,
  pickRandomAssetIds,
  resolvePersonIds,
} from "../immich/immichClient.ts"
import {
  composeDualPortrait,
  isPortraitImage,
  type PhotoFitMode,
  preparePhotoFrameImage,
} from "../immich/photoFrameImage.ts"
import type { DeviceConfigStore } from "../state/deviceConfigStore.ts"
import type { ViewDataStore } from "../state/viewDataStore.ts"
import {
  getIsPhotoView,
  type ViewName,
} from "../views/registry.ts"

/** The dual-portrait (two-up) photo view. */
const DUAL_PHOTO_VIEW: ViewName = "Photo Frame (Duo)"

/**
 * How each photo view fits a single photo to the panel: the plain "Photo Frame"
 * letterboxes when faces don't fit; "(Fill)" and "(Duo)" fill the panel. (Duo
 * only falls back to a single photo when two portraits aren't available, and it
 * fills when it does.)
 */
const getPhotoFitMode = (
  viewName: ViewName,
): PhotoFitMode =>
  viewName === "Photo Frame" ? "letterbox" : "fill"

const TICK_MILLISECONDS = 60_000
const HISTORY_LIMIT = 20

/** White seam between the two photos in a dual-portrait composite, native px. */
const DUAL_PORTRAIT_GUTTER_PIXELS = 8

/**
 * How many candidate assets to draw when building a dual-portrait frame. We
 * keep the first two that are portrait; drawing a handful makes it likely two
 * portraits turn up even in a mixed-orientation pool before we fall back to a
 * single photo.
 */
const DUAL_PORTRAIT_CANDIDATE_DRAW = 6

type PhotoHistory = {
  assetIds: readonly string[]
  cursorIndex: number
}

/**
 * The Immich photo-frame adapter. Each minute it looks at every device on a
 * Photo Frame view (any of the photo-view family) and, when the current photo
 * is older than the rotation interval (or missing), fetches a fresh
 * recency-weighted random photo matching the device's people and/or
 * smart-search query, fits it to the panel per the active view (letterbox /
 * fill / dual-portrait), stores it, and re-pushes the device. `refreshDevice`
 * also runs directly when the people or query config changes from Home
 * Assistant; `showNextPhoto` / `showPreviousPhoto` walk a per-device history
 * (the HA buttons).
 */
export const createPhotoFrameAdapter = ({
  immichConfig,
  getIntervalMinutes,
  getRecencyHalfLifeDays,
  devices,
  deviceConfigStore,
  viewDataStore,
  getActiveView,
  pushDevice,
}: {
  immichConfig: ImmichConfig
  /** Rotation interval for a device, minutes (resolved live from HA config). */
  getIntervalMinutes: (deviceId: string) => number
  /** Recency half-life for a device, days (resolved live from HA config). */
  getRecencyHalfLifeDays: (deviceId: string) => number
  devices: readonly ConfiguredDevice[]
  deviceConfigStore: DeviceConfigStore
  viewDataStore: ViewDataStore
  getActiveView: (deviceId: string) => ViewName
  pushDevice: (deviceId: string) => Promise<boolean>
}) => {
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

  /** Fetch + fit + store + push one specific asset for one device. */
  const showAsset = async ({
    device,
    assetId,
    personIds,
    fitMode,
  }: {
    device: ConfiguredDevice
    assetId: string
    personIds: readonly string[]
    fitMode: PhotoFitMode
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
      fitMode,
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
   * Try to build a dual-portrait frame: two portrait photos face-steered into
   * their own half-panel columns and composited side by side. Draws a handful
   * of candidates and keeps the first two that are portrait. Returns false
   * (caller falls back to a single photo) when fewer than two portraits turn
   * up. The primary (left) asset is what history records.
   */
  const showDualPortrait = async ({
    device,
    source,
  }: {
    device: ConfiguredDevice
    source: {
      personIds: readonly string[]
      queryText: string
    }
  }) => {
    const candidateAssetIds = await pickRandomAssetIds({
      config: immichConfig,
      personIds: source.personIds,
      query: source.queryText || undefined,
      recencyHalfLifeDays: getRecencyHalfLifeDays(
        device.id,
      ),
      count: DUAL_PORTRAIT_CANDIDATE_DRAW,
    })

    const candidates = await Promise.all(
      candidateAssetIds.map(async (assetId) => {
        try {
          const jpegBytes = await fetchPreviewJpeg({
            config: immichConfig,
            assetId,
          })
          return {
            assetId,
            jpegBytes,
            isPortrait: await isPortraitImage({
              jpegBytes,
            }),
          }
        } catch {
          return null
        }
      }),
    )
    const portraits = candidates
      .filter((candidate) => candidate?.isPortrait)
      .slice(0, 2)
    if (portraits.length < 2) {
      return false
    }

    const [left, right] = portraits as [
      NonNullable<(typeof portraits)[number]>,
      NonNullable<(typeof portraits)[number]>,
    ]
    const [leftFaceBoxes, rightFaceBoxes] =
      await Promise.all([
        fetchFaceBoxes({
          config: immichConfig,
          assetId: left.assetId,
          personIds: source.personIds,
        }),
        fetchFaceBoxes({
          config: immichConfig,
          assetId: right.assetId,
          personIds: source.personIds,
        }),
      ])

    const { png, mode } = await composeDualPortrait({
      leftJpegBytes: left.jpegBytes,
      leftFaceBoxes,
      rightJpegBytes: right.jpegBytes,
      rightFaceBoxes,
      targetWidth: device.width,
      targetHeight: device.height,
      gutterPixels: DUAL_PORTRAIT_GUTTER_PIXELS,
    })

    viewDataStore.setPhotoFrame({
      deviceId: device.id,
      data: {
        photoDataUri: `data:image/png;base64,${png.toString("base64")}`,
        assetId: left.assetId,
        fetchedAtMs: Date.now(),
      },
    })
    console.log(
      `[inkcast] photo frame ${device.id}: assets ${left.assetId.slice(0, 8)} + ${right.assetId.slice(0, 8)} [${mode}]`,
    )
    recordShownAsset({
      deviceId: device.id,
      assetId: left.assetId,
    })
    await pushDevice(device.id)
    return true
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

      const activeView = getActiveView(deviceId)

      // The dual-portrait view on a landscape panel tries two side-by-side
      // portraits first; showDualPortrait returns false (and we fall through to
      // a single photo) when two portraits aren't available this cycle.
      const isDualPortrait =
        activeView === DUAL_PHOTO_VIEW &&
        device.width > device.height
      if (isDualPortrait) {
        const hasShownDual = await showDualPortrait({
          device,
          source,
        })
        if (hasShownDual) {
          return true
        }
      }

      const assetId = await pickRandomAssetId({
        config: immichConfig,
        personIds: source.personIds,
        query: source.queryText || undefined,
        recencyHalfLifeDays:
          getRecencyHalfLifeDays(deviceId),
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
        fitMode: getPhotoFitMode(activeView),
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
  const showPhotoFrame = async ({
    deviceId,
    isForcedRefresh = false,
  }: {
    deviceId: string
    /**
     * Recompose even when a photo is cached — used when the user switches
     * between photo views (e.g. Photo Frame → Fill), where the cached PNG was
     * fit for the previous view and must be rebuilt for the new one.
     */
    isForcedRefresh?: boolean
  }) => {
    const current = viewDataStore.getPhotoFrame(deviceId)
    if (current && !isForcedRefresh) {
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
        fitMode: getPhotoFitMode(getActiveView(deviceId)),
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
      .filter((device) =>
        getIsPhotoView(getActiveView(device.id)),
      )
      .forEach((device) => {
        const current = viewDataStore.getPhotoFrame(
          device.id,
        )
        const isStale =
          !current ||
          Date.now() - current.fetchedAtMs >=
            getIntervalMinutes(device.id) * 60_000
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
