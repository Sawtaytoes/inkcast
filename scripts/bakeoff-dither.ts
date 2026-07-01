import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { DitherAlgorithm } from "@inkcast/core/devices/device"
import { ditherToPanel } from "@inkcast/core/pipeline/dither"
import { createChromiumEngine } from "@inkcast/render/chromiumEngine"
import sharp from "sharp"
import {
  buildContactSheet,
  type LabelledTile,
} from "./bakeoff/contactSheet.ts"
import {
  type BakeoffPanel,
  buildGradient,
  buildNowPlayingElement,
  PANELS,
  tryFetchPhoto,
} from "./bakeoff/samples.ts"

/**
 * Decision-2 bake-off: for each panel, dither three test images (the card, a
 * gradient, and — if reachable — a photo) with every algorithm at supersample
 * 1×/2×/4×, and emit one contact sheet per (panel, image). Mono and E6 get
 * SEPARATE sheets so a different algorithm can be chosen per panel type.
 *
 * Rows = supersample factor, columns = algorithm. Chromium is the reference
 * engine for the card render (Decision 1 leans Chromium for fidelity).
 */

const ALGORITHMS: readonly DitherAlgorithm[] = [
  "threshold",
  "ordered",
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "sierra",
]

const SUPERSAMPLE_FACTORS = [1, 2, 4]

const OUTPUT_DIRECTORY = join(
  process.cwd(),
  "render-output",
  "dither",
)

/** A test image, produced at whatever supersampled size is requested. */
type SampleSource = {
  key: string
  label: string
  produce: (dimensions: {
    width: number
    height: number
  }) => Promise<Buffer>
}

/** How big to draw each tile in the sheet, and with which resize kernel. */
const getDisplayGeometry = (panel: BakeoffPanel) => {
  const isMono = panel.colourMode === "mono"
  // Mono: integer 2× upscale with nearest so individual dithered pixels stay
  // crisp. E6/photo: scale to 500px wide with a smooth kernel.
  const displayScale = isMono ? 2 : 500 / panel.width

  return {
    cellWidth: Math.round(panel.width * displayScale),
    cellImageHeight: Math.round(
      panel.height * displayScale,
    ),
    resizeKernel: isMono
      ? ("nearest" as const)
      : ("lanczos3" as const),
  }
}

type DisplayGeometry = ReturnType<typeof getDisplayGeometry>

/** The three test images for one panel (card via Chromium, gradient, photo). */
const buildSources = ({
  panel,
  chromiumEngine,
}: {
  panel: BakeoffPanel
  chromiumEngine: Awaited<
    ReturnType<typeof createChromiumEngine>
  >
}): SampleSource[] => [
  {
    key: "card",
    label: "now-playing card",
    produce: (dimensions) =>
      chromiumEngine.render({
        element: buildNowPlayingElement({
          width: panel.width,
          height: panel.height,
          colourMode: panel.colourMode,
        }),
        width: panel.width,
        height: panel.height,
        supersampleFactor: dimensions.width / panel.width,
      }),
  },
  {
    key: "gradient",
    label: "gradient",
    produce: buildGradient,
  },
  {
    key: "photo",
    label: "photo",
    produce: async (dimensions) =>
      (await tryFetchPhoto(dimensions)) ?? Buffer.alloc(0),
  },
]

/** Dither one source at one supersample factor with every algorithm → tiles. */
const buildFactorTiles = async ({
  panel,
  source,
  geometry,
  supersampleFactor,
}: {
  panel: BakeoffPanel
  source: SampleSource
  geometry: DisplayGeometry
  supersampleFactor: number
}): Promise<LabelledTile[]> => {
  const sourceBuffer = await source.produce({
    width: panel.width * supersampleFactor,
    height: panel.height * supersampleFactor,
  })

  if (sourceBuffer.length === 0) {
    return []
  }

  return Promise.all(
    ALGORITHMS.map(async (algorithm) => {
      const ditheredBuffer = await ditherToPanel({
        imageBuffer: sourceBuffer,
        width: panel.width,
        height: panel.height,
        palette: panel.palette,
        algorithm,
      })

      const displayPng = await sharp(ditheredBuffer)
        .resize(
          geometry.cellWidth,
          geometry.cellImageHeight,
          {
            fit: "fill",
            kernel: geometry.resizeKernel,
          },
        )
        .png()
        .toBuffer()

      return {
        label: `${algorithm} · ${supersampleFactor}×`,
        png: displayPng,
      }
    }),
  )
}

/** One contact sheet per (panel, source): rows = supersample, cols = algorithm. */
const writeSourceSheet = async ({
  panel,
  source,
  geometry,
}: {
  panel: BakeoffPanel
  source: SampleSource
  geometry: DisplayGeometry
}) => {
  const tilesByFactor = await Promise.all(
    SUPERSAMPLE_FACTORS.map((supersampleFactor) =>
      buildFactorTiles({
        panel,
        source,
        geometry,
        supersampleFactor,
      }),
    ),
  )
  const tiles = tilesByFactor.flat()

  if (tiles.length === 0) {
    console.log(
      `[dither] skipped ${panel.key}/${source.key} (no source)`,
    )
    return
  }

  const contactSheet = await buildContactSheet({
    tiles,
    columns: ALGORITHMS.length,
    cellWidth: geometry.cellWidth,
    cellImageHeight: geometry.cellImageHeight,
  })

  const sheetPath = join(
    OUTPUT_DIRECTORY,
    `${panel.key}--${source.key}.png`,
  )
  await writeFile(sheetPath, contactSheet)
  console.log(`[dither] wrote ${sheetPath}`)
}

const run = async () => {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })

  const chromiumEngine = await createChromiumEngine()

  try {
    // Panels sequentially (bounds memory on the big E6 4× buffers); within a
    // panel, its sources + factors + algorithms fan out.
    await PANELS.reduce(
      (previousPanel, panel) =>
        previousPanel.then(() => {
          const geometry = getDisplayGeometry(panel)
          const sources = buildSources({
            panel,
            chromiumEngine,
          })

          return Promise.all(
            sources.map((source) =>
              writeSourceSheet({ panel, source, geometry }),
            ),
          ).then(() => undefined)
        }),
      Promise.resolve(),
    )
  } finally {
    await chromiumEngine.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
