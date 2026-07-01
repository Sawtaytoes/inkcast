import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createChromiumEngine } from "@inkcast/render/chromiumEngine"
import { createSatoriEngine } from "@inkcast/render/satoriEngine"
import { buildContactSheet } from "./bakeoff/contactSheet.ts"
import {
  buildNowPlayingElement,
  PANELS,
} from "./bakeoff/samples.ts"

/**
 * Decision-1 bake-off: render the now-playing card through BOTH engines
 * (Chromium and Satori) at each panel size and lay them side by side so you
 * can compare fidelity + preview-parity. Writes full-colour (pre-dither) PNGs
 * and one comparison sheet to `render-output/render/`.
 */

// A modest supersample so the engine differences (text AA, layout) are visible.
const SUPERSAMPLE_FACTOR = 2

const OUTPUT_DIRECTORY = join(
  process.cwd(),
  "render-output",
  "render",
)

const run = async () => {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })

  const chromiumEngine = await createChromiumEngine()
  const satoriEngine = await createSatoriEngine()
  const engines = [chromiumEngine, satoriEngine]

  // Every (panel × engine) combo, rendered + written, yielding a tile each.
  const renderCombination = async ({
    panel,
    engine,
  }: {
    panel: (typeof PANELS)[number]
    engine: (typeof engines)[number]
  }) => {
    const pngBuffer = await engine.render({
      element: buildNowPlayingElement({
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
      }),
      width: panel.width,
      height: panel.height,
      supersampleFactor: SUPERSAMPLE_FACTOR,
    })

    const fileName = `${panel.key}--${engine.name}.png`
    await writeFile(
      join(OUTPUT_DIRECTORY, fileName),
      pngBuffer,
    )
    console.log(`[render] ${fileName}`)

    return {
      label: `${panel.label} · ${engine.name}`,
      png: pngBuffer,
    }
  }

  try {
    const combinations = PANELS.flatMap((panel) =>
      engines.map((engine) => ({ panel, engine })),
    )

    const tiles = await Promise.all(
      combinations.map(renderCombination),
    )

    const contactSheet = await buildContactSheet({
      tiles,
      columns: engines.length,
      cellWidth: 420,
      cellImageHeight: 252,
    })

    const sheetPath = join(
      OUTPUT_DIRECTORY,
      "engine-comparison.png",
    )
    await writeFile(sheetPath, contactSheet)
    console.log(`[render] wrote ${sheetPath}`)
  } finally {
    await chromiumEngine.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
