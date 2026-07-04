import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@inkcast/core/devices/device"
import { createChromiumEngine } from "@inkcast/render/chromiumEngine"
import { NowPlayingDashboard } from "@inkcast/views/NowPlayingDashboard"
import { NowPlayingEditorial } from "@inkcast/views/NowPlayingEditorial"
import { NowPlayingPoster } from "@inkcast/views/NowPlayingPoster"
import { createElement } from "react"
import sharp from "sharp"

/** A synthetic 2:3 movie-style poster as a data URI (stand-in for a Plex poster). */
const buildPosterDataUri = async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a2a6c"/><stop offset="0.5" stop-color="#b21f1f"/>
      <stop offset="1" stop-color="#fdbb2d"/></linearGradient></defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <circle cx="200" cy="230" r="90" fill="#ffffff" opacity="0.85"/>
    <rect x="60" y="420" width="280" height="26" fill="#ffffff"/>
    <rect x="60" y="470" width="190" height="18" fill="#ffffff" opacity="0.7"/>
  </svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

/** Render every now-playing view × panel to a pre-dither PNG for eyeballing. */
const OUTPUT_DIRECTORY = join(
  process.cwd(),
  "render-output",
  "nowplaying",
)

const VIEWS = [
  { key: "dashboard", component: NowPlayingDashboard },
  { key: "editorial", component: NowPlayingEditorial },
  { key: "poster", component: NowPlayingPoster },
] as const

const PANELS = [
  { key: "phat", device: PHAT_DEVICE },
  { key: "impression", device: IMPRESSION_DEVICE },
] as const

// Title as the adapter would deliver it — emoji already stripped.
const SAMPLE = {
  artist: "Hidden Pigeon Channel",
  title:
    "ALL The Pigeon Books! | The Pigeon Finds a Hot Dog! + MORE!",
  isPlaying: true,
  time: "2:46 AM",
  date: "Thursday, July 4",
}

// A shorter title too, to see the non-overflow case.
const SHORT_TITLE = "Zack Snyder's Justice League (2021)"

const run = async () => {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  const engine = await createChromiumEngine()
  const artworkDataUri = await buildPosterDataUri()

  const artStates = [
    { key: "art", artwork: artworkDataUri },
    { key: "noart", artwork: undefined },
  ] as const

  for (const panel of PANELS) {
    for (const view of VIEWS) {
      for (const artState of artStates) {
        const pngBuffer = await engine.render({
          element: createElement(view.component, {
            width: panel.device.width,
            height: panel.device.height,
            colourMode: panel.device.colourMode,
            ...SAMPLE,
            title:
              artState.key === "art"
                ? SHORT_TITLE
                : SAMPLE.title,
            artworkDataUri: artState.artwork,
          }),
          width: panel.device.width,
          height: panel.device.height,
          supersampleFactor: 2,
        })
        const fileName = `${panel.key}--${view.key}--${artState.key}.png`
        await writeFile(
          join(OUTPUT_DIRECTORY, fileName),
          pngBuffer,
        )
        console.log(`[preview] ${fileName}`)
      }
    }
  }

  await engine.close?.()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
