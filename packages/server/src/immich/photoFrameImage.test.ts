import { describe, expect, test } from "vitest"
import { computeFaceCropRect } from "./photoFrameImage.ts"

const PANEL = { targetWidth: 800, targetHeight: 480 }

describe("computeFaceCropRect", () => {
  test("returns null with no face boxes (caller letterboxes)", () => {
    expect(
      computeFaceCropRect({
        imageWidth: 1600,
        imageHeight: 1200,
        ...PANEL,
        faceBoxes: [],
      }),
    ).toBe(null)
  })

  test("crops a panel-aspect window containing a centered face", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1600,
      imageHeight: 1200,
      ...PANEL,
      faceBoxes: [
        { x1: 0.45, y1: 0.45, x2: 0.55, y2: 0.55 },
      ],
    })

    expect(cropRect).not.toBe(null)
    if (cropRect) {
      expect(cropRect.width / cropRect.height).toBeCloseTo(
        800 / 480,
        1,
      )
      // The face (720..880 x, 540..660 y) sits inside the crop.
      expect(cropRect.left).toBeLessThanOrEqual(720)
      expect(
        cropRect.left + cropRect.width,
      ).toBeGreaterThanOrEqual(880)
      expect(cropRect.top).toBeLessThanOrEqual(540)
      expect(
        cropRect.top + cropRect.height,
      ).toBeGreaterThanOrEqual(660)
    }
  })

  test("returns null when faces span wider than the image allows", () => {
    expect(
      computeFaceCropRect({
        imageWidth: 1000,
        imageHeight: 1000,
        ...PANEL,
        faceBoxes: [
          { x1: 0.02, y1: 0.4, x2: 0.2, y2: 0.6 },
          { x1: 0.8, y1: 0.4, x2: 0.98, y2: 0.6 },
        ],
      }),
    ).toBe(null)
  })

  test("clamps the crop inside the image for an edge face", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1600,
      imageHeight: 1200,
      ...PANEL,
      faceBoxes: [{ x1: 0.0, y1: 0.0, x2: 0.1, y2: 0.1 }],
    })

    expect(cropRect).not.toBe(null)
    if (cropRect) {
      expect(cropRect.left).toBeGreaterThanOrEqual(0)
      expect(cropRect.top).toBeGreaterThanOrEqual(0)
      expect(
        cropRect.left + cropRect.width,
      ).toBeLessThanOrEqual(1600)
      expect(
        cropRect.top + cropRect.height,
      ).toBeLessThanOrEqual(1200)
    }
  })
})
