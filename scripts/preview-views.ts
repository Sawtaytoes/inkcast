import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createChromiumEngine } from "@castkit/render/chromiumEngine"
import { ClockWeatherView } from "@castkit/views/ClockWeatherView"
import { NowPlayingDashboard } from "@castkit/views/NowPlayingDashboard"
import { createElement, type ReactElement } from "react"
import sharp from "sharp"

/**
 * View-iteration preview: renders the dashboard + clock-weather views through
 * the Chromium engine at both real panel sizes with representative data
 * (including the awkward cases — no artist, marathon YouTube Music titles) so
 * layout changes can be eyeballed as PNGs before touching a physical panel.
 * Writes `render-output/preview/<scenario>--<panel>.png` (gitignored).
 *
 * Run: `yarn tsx scripts/preview-views.ts`
 */

const SUPERSAMPLE_FACTOR = 2

const OUTPUT_DIRECTORY = join(
  process.cwd(),
  "render-output",
  "preview",
)

type PreviewPanel = {
  key: string
  width: number
  height: number
  colourMode: "mono" | "e6"
  /** Pre-formatted per-panel strings, as the server would supply them. */
  time: string
  date: string
}

const PANELS: readonly PreviewPanel[] = [
  {
    key: "phat-mono",
    width: 250,
    height: 122,
    colourMode: "mono",
    time: "12:45a",
    date: "Th-02",
  },
  {
    key: "impression-e6",
    width: 800,
    height: 480,
    colourMode: "e6",
    time: "12:45 AM",
    date: "Thursday, July 2",
  },
]

/** A tiny solid-colour PNG data URI standing in for real album artwork. */
const buildArtworkDataUri = async () => {
  const pngBuffer = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 46, g: 96, b: 158 },
    },
  })
    .png()
    .toBuffer()

  return `data:image/png;base64,${pngBuffer.toString("base64")}`
}

type PreviewScenario = {
  key: string
  buildElement: ({
    panel,
  }: {
    panel: PreviewPanel
  }) => ReactElement
}

const buildScenarios = ({
  artworkDataUri,
}: {
  artworkDataUri: string
}): readonly PreviewScenario[] => [
  {
    key: "now-playing",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "ALI PROJECT",
        title: "sekka zange shinjuu",
        album: "Kinsho",
        isPlaying: false,
        time: panel.time,
        date: panel.date,
      }),
  },
  {
    key: "now-playing-artwork",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "ALI PROJECT",
        title: "sekka zange shinjuu",
        album: "Kinsho",
        isPlaying: false,
        time: panel.time,
        date: panel.date,
        artworkDataUri,
      }),
  },
  {
    key: "now-playing-long-title",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "",
        title:
          "My Neighbor Totoro - Bedtime Music - Baby Music, Lullaby Music, Sleep Music",
        isPlaying: true,
        time: panel.time,
        date: panel.date,
      }),
  },
  {
    key: "now-playing-long-title-artwork",
    buildElement: ({ panel }) =>
      createElement(NowPlayingDashboard, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        artist: "—",
        title:
          "My Neighbor Totoro - Bedtime Music - Baby Music, Lullaby Music, Sleep Music",
        isPlaying: true,
        time: panel.time,
        date: panel.date,
        artworkDataUri,
      }),
  },
  {
    key: "clock-weather",
    buildElement: ({ panel }) =>
      createElement(ClockWeatherView, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        time: panel.time,
        date: panel.date,
        temperatureText: "79°",
        conditionText: "Partly cloudy",
      }),
  },
  {
    key: "clock-no-weather",
    buildElement: ({ panel }) =>
      createElement(ClockWeatherView, {
        width: panel.width,
        height: panel.height,
        colourMode: panel.colourMode,
        time: panel.time,
        date: panel.date,
      }),
  },
]

const run = async () => {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })

  const artworkDataUri = await buildArtworkDataUri()
  const scenarios = buildScenarios({ artworkDataUri })
  const chromiumEngine = await createChromiumEngine()

  const renderCombination = async ({
    scenario,
    panel,
  }: {
    scenario: PreviewScenario
    panel: PreviewPanel
  }) => {
    const pngBuffer = await chromiumEngine.render({
      element: scenario.buildElement({ panel }),
      width: panel.width,
      height: panel.height,
      supersampleFactor: SUPERSAMPLE_FACTOR,
    })

    const fileName = `${scenario.key}--${panel.key}.png`
    await writeFile(
      join(OUTPUT_DIRECTORY, fileName),
      pngBuffer,
    )
    console.log(`[preview] ${fileName}`)
  }

  try {
    const combinations = scenarios.flatMap((scenario) =>
      PANELS.map((panel) => ({ scenario, panel })),
    )

    await Promise.all(combinations.map(renderCombination))
  } finally {
    await chromiumEngine.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
