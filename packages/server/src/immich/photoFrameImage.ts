import sharp from "sharp"
import type { FaceBox } from "./immichClient.ts"

/**
 * Turns an Immich preview JPEG into an exactly panel-sized image. The crop is
 * always the LARGEST target-aspect window the image allows (a normal
 * cover-crop), shifted just far enough that every configured face stays in
 * frame — faces are never the thing the crop zooms into, they only steer
 * where the unavoidable aspect-ratio trim happens. When the faces span more
 * than even the maximal window can hold, the whole image is letterboxed on
 * white instead so nobody is cut out.
 */

export type CropRect = {
  left: number
  top: number
  width: number
  height: number
}

/** Padding added around the face union so heads aren't flush with the edge. */
const FACE_PADDING_FRACTION = 0.15

const clamp = ({
  value,
  minimum,
  maximum,
}: {
  value: number
  minimum: number
  maximum: number
}) => Math.min(Math.max(value, minimum), maximum)

/**
 * The maximal target-aspect cover-crop window, centered on the image but
 * shifted the minimum distance needed to contain every (padded) face box —
 * or null when the padded face union is bigger than the window itself
 * (caller letterboxes so no face is lost).
 */
/** The largest panel-aspect cover-crop window that fits inside the image. */
const computeCoverWindow = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
}) => {
  const targetAspect = targetWidth / targetHeight
  const imageAspect = imageWidth / imageHeight
  const cropWidth =
    imageAspect > targetAspect
      ? imageHeight * targetAspect
      : imageWidth
  return { cropWidth, cropHeight: cropWidth / targetAspect }
}

/** The padded bounding box of every face, clamped inside the image (px). */
const computePaddedFaceUnion = ({
  imageWidth,
  imageHeight,
  faceBoxes,
}: {
  imageWidth: number
  imageHeight: number
  faceBoxes: readonly FaceBox[]
}) => {
  const rawLeft =
    Math.min(...faceBoxes.map((box) => box.x1)) * imageWidth
  const rawTop =
    Math.min(...faceBoxes.map((box) => box.y1)) *
    imageHeight
  const rawRight =
    Math.max(...faceBoxes.map((box) => box.x2)) * imageWidth
  const rawBottom =
    Math.max(...faceBoxes.map((box) => box.y2)) *
    imageHeight
  const paddingX =
    (rawRight - rawLeft) * FACE_PADDING_FRACTION
  const paddingY =
    (rawBottom - rawTop) * FACE_PADDING_FRACTION
  return {
    unionLeft: Math.max(0, rawLeft - paddingX),
    unionTop: Math.max(0, rawTop - paddingY),
    unionRight: Math.min(imageWidth, rawRight + paddingX),
    unionBottom: Math.min(
      imageHeight,
      rawBottom + paddingY,
    ),
  }
}

export const computeFaceCropRect = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
  faceBoxes,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
}): CropRect | null => {
  if (faceBoxes.length === 0) {
    return null
  }

  const { cropWidth, cropHeight } = computeCoverWindow({
    imageWidth,
    imageHeight,
    targetWidth,
    targetHeight,
  })
  const { unionLeft, unionTop, unionRight, unionBottom } =
    computePaddedFaceUnion({
      imageWidth,
      imageHeight,
      faceBoxes,
    })

  // Faces wider/taller than the maximal window: no shift can save them.
  if (
    unionRight - unionLeft > cropWidth + 1 ||
    unionBottom - unionTop > cropHeight + 1
  ) {
    return null
  }

  // Start where a plain cover-crop would (image center), then shift the
  // minimum distance that brings the face union fully inside the window.
  const centeredLeft = (imageWidth - cropWidth) / 2
  const centeredTop = (imageHeight - cropHeight) / 2
  const left = clamp({
    value: clamp({
      value: centeredLeft,
      minimum: unionRight - cropWidth,
      maximum: unionLeft,
    }),
    minimum: 0,
    maximum: imageWidth - cropWidth,
  })
  const top = clamp({
    value: clamp({
      value: centeredTop,
      minimum: unionBottom - cropHeight,
      maximum: unionTop,
    }),
    minimum: 0,
    maximum: imageHeight - cropHeight,
  })

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  }
}

/**
 * One axis of a fill crop: shift the maximal cover-crop the minimum distance to
 * fit the whole face span when it fits, otherwise centre on the face span's
 * midpoint (keeping the middle faces and cropping the outliers). Always inside
 * the image — a fill crop never letterboxes.
 */
const computeFillOffset = ({
  imageSize,
  cropSize,
  spanStart,
  spanEnd,
}: {
  imageSize: number
  cropSize: number
  spanStart: number
  spanEnd: number
}) => {
  const centered = (imageSize - cropSize) / 2
  const isSpanWithinWindow = spanEnd - spanStart <= cropSize
  const value = isSpanWithinWindow
    ? clamp({
        value: centered,
        minimum: spanEnd - cropSize,
        maximum: spanStart,
      })
    : (spanStart + spanEnd) / 2 - cropSize / 2
  return clamp({
    value,
    minimum: 0,
    maximum: imageSize - cropSize,
  })
}

/**
 * The face-steered maximal cover-crop that ALWAYS fills the panel — it never
 * letterboxes. When the faces fit the window it behaves exactly like
 * `computeFaceCropRect`; when they span too far to all fit, it centres on the
 * face mass (keeping the primary/central faces, cropping the outermost) instead
 * of giving up to white bars. Powers the "Photo Frame (Fill)" view and each
 * column of a dual-portrait composite.
 */
export const computeFillCropRect = ({
  imageWidth,
  imageHeight,
  targetWidth,
  targetHeight,
  faceBoxes,
}: {
  imageWidth: number
  imageHeight: number
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
}): CropRect => {
  const { cropWidth, cropHeight } = computeCoverWindow({
    imageWidth,
    imageHeight,
    targetWidth,
    targetHeight,
  })

  if (faceBoxes.length === 0) {
    return {
      left: Math.round((imageWidth - cropWidth) / 2),
      top: Math.round((imageHeight - cropHeight) / 2),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    }
  }

  const { unionLeft, unionTop, unionRight, unionBottom } =
    computePaddedFaceUnion({
      imageWidth,
      imageHeight,
      faceBoxes,
    })

  return {
    left: Math.round(
      computeFillOffset({
        imageSize: imageWidth,
        cropSize: cropWidth,
        spanStart: unionLeft,
        spanEnd: unionRight,
      }),
    ),
    top: Math.round(
      computeFillOffset({
        imageSize: imageHeight,
        cropSize: cropHeight,
        spanStart: unionTop,
        spanEnd: unionBottom,
      }),
    ),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  }
}

/** True when the image is taller than it is wide (portrait orientation). */
export const isPortraitImage = async ({
  jpegBytes,
}: {
  jpegBytes: Buffer
}): Promise<boolean> => {
  const metadata = await sharp(jpegBytes).metadata()
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0
  return imageHeight > imageWidth
}

/**
 * How a photo is fit to its target window:
 * - `letterbox` — face-steered cover-crop when every face fits the maximal
 *   window, else white letterbox bars so no one is cut ("Photo Frame").
 * - `fill` — always fills the window, centring on the face mass when the faces
 *   can't all fit ("Photo Frame (Fill)" and dual-portrait columns).
 */
export type PhotoFitMode = "letterbox" | "fill"

/**
 * Render one JPEG into an exactly `targetWidth×targetHeight` PNG. `fitMode`
 * chooses letterbox vs fill (see `PhotoFitMode`). The shared core behind the
 * single-photo frame and each half of a dual-portrait composite.
 */
const renderToTarget = async ({
  jpegBytes,
  targetWidth,
  targetHeight,
  faceBoxes,
  fitMode,
}: {
  jpegBytes: Buffer
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
  fitMode: PhotoFitMode
}): Promise<{ png: Buffer; mode: string }> => {
  const image = sharp(jpegBytes)
  const metadata = await image.metadata()
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0

  const cropRect =
    fitMode === "fill"
      ? computeFillCropRect({
          imageWidth,
          imageHeight,
          targetWidth,
          targetHeight,
          faceBoxes,
        })
      : computeFaceCropRect({
          imageWidth,
          imageHeight,
          targetWidth,
          targetHeight,
          faceBoxes,
        })

  if (cropRect) {
    const png = await image
      .extract(cropRect)
      .resize(targetWidth, targetHeight)
      .png()
      .toBuffer()
    return {
      png,
      mode:
        fitMode === "fill"
          ? "face-steered fill-crop"
          : "face-steered cover-crop",
    }
  }

  const png = await image
    .resize(targetWidth, targetHeight, {
      fit: "contain",
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    })
    .png()
    .toBuffer()
  return {
    png,
    mode:
      faceBoxes.length > 0
        ? "letterbox (faces span too far)"
        : "letterbox (no face data)",
  }
}

/**
 * Produce an exactly `targetWidth×targetHeight` PNG from one photo, fit per
 * `fitMode` (letterbox or fill). Returns the PNG plus which mode was used (for
 * logging).
 */
export const preparePhotoFrameImage = ({
  jpegBytes,
  targetWidth,
  targetHeight,
  faceBoxes,
  fitMode,
}: {
  jpegBytes: Buffer
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
  fitMode: PhotoFitMode
}) =>
  renderToTarget({
    jpegBytes,
    targetWidth,
    targetHeight,
    faceBoxes,
    fitMode,
  })

/**
 * Split `targetWidth` into two photo columns separated by a white gutter. The
 * left column absorbs any odd remainder so the two columns plus the gutter
 * always sum to exactly `targetWidth`.
 */
export const computeDualPortraitColumns = ({
  targetWidth,
  gutterPixels,
}: {
  targetWidth: number
  gutterPixels: number
}) => {
  const usableWidth = targetWidth - gutterPixels
  const leftWidth = Math.ceil(usableWidth / 2)
  const rightWidth = usableWidth - leftWidth
  return {
    leftWidth,
    rightWidth,
    rightLeftOffset: leftWidth + gutterPixels,
  }
}

/**
 * Compose two portrait photos side by side into one exactly
 * `targetWidth×targetHeight` PNG. Each photo is face-steered independently into
 * its own half-panel column and always fills it (fit "fill" — a column never
 * letterboxes), and the two columns are composited onto a white canvas with a
 * thin gutter between them. For landscape image-mode panels (see
 * docs/decisions/2026-07-12-dual-portrait-photo-layout.md).
 */
export const composeDualPortrait = async ({
  leftJpegBytes,
  leftFaceBoxes,
  rightJpegBytes,
  rightFaceBoxes,
  targetWidth,
  targetHeight,
  gutterPixels,
}: {
  leftJpegBytes: Buffer
  leftFaceBoxes: readonly FaceBox[]
  rightJpegBytes: Buffer
  rightFaceBoxes: readonly FaceBox[]
  targetWidth: number
  targetHeight: number
  gutterPixels: number
}): Promise<{ png: Buffer; mode: string }> => {
  const { leftWidth, rightWidth, rightLeftOffset } =
    computeDualPortraitColumns({
      targetWidth,
      gutterPixels,
    })

  const [leftColumn, rightColumn] = await Promise.all([
    renderToTarget({
      jpegBytes: leftJpegBytes,
      targetWidth: leftWidth,
      targetHeight,
      faceBoxes: leftFaceBoxes,
      fitMode: "fill",
    }),
    renderToTarget({
      jpegBytes: rightJpegBytes,
      targetWidth: rightWidth,
      targetHeight,
      faceBoxes: rightFaceBoxes,
      fitMode: "fill",
    }),
  ])

  const png = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: leftColumn.png, left: 0, top: 0 },
      {
        input: rightColumn.png,
        left: rightLeftOffset,
        top: 0,
      },
    ])
    .png()
    .toBuffer()

  return {
    png,
    mode: `dual-portrait (${leftColumn.mode} | ${rightColumn.mode})`,
  }
}
