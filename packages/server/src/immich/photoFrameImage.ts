import sharp from "sharp"
import type { FaceBox } from "./immichClient.ts"

/**
 * Turns an Immich preview JPEG into an exactly panel-sized image: a
 * face-aware crop when every configured face fits a target-aspect window
 * (padded ~40%), else a letterbox on white so no face is ever cut. Direct
 * port of `prepare_image` from home-displays' `immich_impression_frame.py`.
 */

export type CropRect = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The smallest target-aspect crop window containing all face boxes (padded),
 * centered on them and clamped inside the image — or null when the padded
 * face union needs a window bigger than the image (caller letterboxes).
 */
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

  const unionLeft =
    Math.min(...faceBoxes.map((box) => box.x1)) * imageWidth
  const unionTop =
    Math.min(...faceBoxes.map((box) => box.y1)) *
    imageHeight
  const unionRight =
    Math.max(...faceBoxes.map((box) => box.x2)) * imageWidth
  const unionBottom =
    Math.max(...faceBoxes.map((box) => box.y2)) *
    imageHeight

  const faceWidth = unionRight - unionLeft
  const faceHeight = unionBottom - unionTop
  const paddingX = faceWidth * 0.4
  const paddingY = faceHeight * 0.4

  const neededWidth = faceWidth + paddingX * 2
  const neededHeight = faceHeight + paddingY * 2
  const targetAspect = targetWidth / targetHeight

  const cropWidth =
    neededWidth / neededHeight > targetAspect
      ? neededWidth
      : neededHeight * targetAspect
  const cropHeight = cropWidth / targetAspect

  if (
    cropWidth > imageWidth + 1 ||
    cropHeight > imageHeight + 1
  ) {
    return null
  }

  const centerX = (unionLeft + unionRight) / 2
  const centerY = (unionTop + unionBottom) / 2
  const left = Math.min(
    Math.max(0, centerX - cropWidth / 2),
    imageWidth - cropWidth,
  )
  const top = Math.min(
    Math.max(0, centerY - cropHeight / 2),
    imageHeight - cropHeight,
  )

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  }
}

/**
 * Produce an exactly `targetWidth×targetHeight` PNG: face-aware crop when the
 * faces fit, else the whole image letterboxed on white. Returns the PNG plus
 * which mode was used (for logging).
 */
export const preparePhotoFrameImage = async ({
  jpegBytes,
  targetWidth,
  targetHeight,
  faceBoxes,
}: {
  jpegBytes: Buffer
  targetWidth: number
  targetHeight: number
  faceBoxes: readonly FaceBox[]
}): Promise<{ png: Buffer; mode: string }> => {
  const image = sharp(jpegBytes)
  const metadata = await image.metadata()
  const imageWidth = metadata.width ?? 0
  const imageHeight = metadata.height ?? 0

  const cropRect = computeFaceCropRect({
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
    return { png, mode: "face-crop" }
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
