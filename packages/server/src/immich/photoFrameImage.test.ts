import { describe, expect, test } from "vitest"
import {
  computeDualPortraitColumns,
  computeFaceCropRect,
  computeFillCropRect,
} from "./photoFrameImage.ts"

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

  test("uses the MAXIMAL cover-crop window, not a zoomed-to-face one", () => {
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
      // 1600×1200 is taller than 800×480, so the maximal window is the
      // full width — a small centered face must NOT shrink the crop.
      expect(cropRect.width).toBe(1600)
      expect(cropRect.height).toBe(960)
      expect(cropRect.top).toBe(120)
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

  test("shifts the crop up for a portrait shot with faces at the top", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [
        { x1: 0.2, y1: 0.05, x2: 0.45, y2: 0.2 },
        { x1: 0.55, y1: 0.08, x2: 0.8, y2: 0.22 },
      ],
    })

    expect(cropRect).not.toBe(null)
    if (cropRect) {
      // Maximal window is full-width (1200×720). A centered crop would
      // start at y=440 and decapitate everyone; it must shift up so the
      // padded face union (top ≈ 44) is inside.
      expect(cropRect.width).toBe(1200)
      expect(cropRect.height).toBe(720)
      expect(cropRect.top).toBeLessThanOrEqual(44)
    }
  })

  test("keeps far-apart faces by widening to the window, not zooming", () => {
    const cropRect = computeFaceCropRect({
      imageWidth: 1000,
      imageHeight: 1000,
      ...PANEL,
      faceBoxes: [
        { x1: 0.02, y1: 0.4, x2: 0.2, y2: 0.6 },
        { x1: 0.8, y1: 0.4, x2: 0.98, y2: 0.6 },
      ],
    })

    // The maximal window (1000×600) can hold both faces, so this crops.
    expect(cropRect).not.toBe(null)
    if (cropRect) {
      expect(cropRect.left).toBe(0)
      expect(cropRect.width).toBe(1000)
      expect(cropRect.top).toBeLessThanOrEqual(400)
      expect(
        cropRect.top + cropRect.height,
      ).toBeGreaterThanOrEqual(600)
    }
  })

  test("returns null when faces span taller than the maximal window", () => {
    expect(
      computeFaceCropRect({
        imageWidth: 1000,
        imageHeight: 1000,
        ...PANEL,
        faceBoxes: [
          { x1: 0.4, y1: 0.02, x2: 0.6, y2: 0.2 },
          { x1: 0.4, y1: 0.8, x2: 0.6, y2: 0.98 },
        ],
      }),
    ).toBe(null)
  })

  test("fill: fills the panel (never null) when faces span too far", () => {
    // Same faces that make computeFaceCropRect letterbox (return null): here
    // fill must still return a crop that fills the panel, centred on the mass.
    const cropRect = computeFillCropRect({
      imageWidth: 1000,
      imageHeight: 1000,
      ...PANEL,
      faceBoxes: [
        { x1: 0.4, y1: 0.02, x2: 0.6, y2: 0.2 },
        { x1: 0.4, y1: 0.8, x2: 0.6, y2: 0.98 },
      ],
    })
    // Maximal window is 1000×600; the crop fills that, centred vertically on
    // the face mass (midpoint ≈ y 500 → top ≈ 200).
    expect(cropRect.width).toBe(1000)
    expect(cropRect.height).toBe(600)
    expect(cropRect.top).toBe(200)
  })

  test("fill: centre cover-crop when there are no faces", () => {
    const cropRect = computeFillCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [],
    })
    // 1200×1600 portrait into 800×480 landscape → full-width 1200×720 band,
    // vertically centred (top = (1600-720)/2 = 440).
    expect(cropRect.width).toBe(1200)
    expect(cropRect.height).toBe(720)
    expect(cropRect.top).toBe(440)
  })

  test("fill: shifts up to keep faces at the top of a portrait", () => {
    const cropRect = computeFillCropRect({
      imageWidth: 1200,
      imageHeight: 1600,
      ...PANEL,
      faceBoxes: [
        { x1: 0.2, y1: 0.05, x2: 0.45, y2: 0.2 },
        { x1: 0.55, y1: 0.08, x2: 0.8, y2: 0.22 },
      ],
    })
    expect(cropRect.width).toBe(1200)
    expect(cropRect.height).toBe(720)
    // The faces fit the 720-tall window, so it shifts up to include them.
    expect(cropRect.top).toBeLessThanOrEqual(44)
  })

  test("dual-portrait columns + gutter sum to the full width (even)", () => {
    const columns = computeDualPortraitColumns({
      targetWidth: 800,
      gutterPixels: 8,
    })
    expect(columns.leftWidth).toBe(396)
    expect(columns.rightWidth).toBe(396)
    expect(columns.rightLeftOffset).toBe(404)
    expect(columns.leftWidth + 8 + columns.rightWidth).toBe(
      800,
    )
  })

  test("dual-portrait left column absorbs the odd remainder", () => {
    const columns = computeDualPortraitColumns({
      targetWidth: 1601,
      gutterPixels: 10,
    })
    // usable 1591 → left ceil(795.5)=796, right 795, right offset 806.
    expect(columns.leftWidth).toBe(796)
    expect(columns.rightWidth).toBe(795)
    expect(columns.rightLeftOffset).toBe(806)
    expect(
      columns.leftWidth + 10 + columns.rightWidth,
    ).toBe(1601)
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
