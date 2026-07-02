import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Font } from "satori"

/**
 * Font assets shared by all render paths. The panel face is Atkinson
 * Hyperlegible (OFL, Braille Institute) — designed for low-vision
 * readability, which is exactly the e-ink-at-a-distance problem
 * (docs/research/eink-fonts.md). DejaVu Sans ships alongside as the
 * fallback for glyphs Atkinson lacks (e.g. Japanese titles fall through to
 * the engine's system fonts). Satori has no system-font access — it needs
 * the raw TTF bytes; Chromium gets the same faces via an embedded
 * `@font-face` (so the container needs no installed fonts).
 */

const assetsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "assets",
  "fonts",
)

/** The CSS `font-family` the views reference; Satori matches fonts by name. */
export const FONT_FAMILY = "Atkinson Hyperlegible"

/** Absolute paths to the TTF faces, for tools that load fonts by path (resvg). */
export const FONT_FILE_PATHS = {
  regular: join(
    assetsDirectory,
    "AtkinsonHyperlegible-Regular.ttf",
  ),
  bold: join(
    assetsDirectory,
    "AtkinsonHyperlegible-Bold.ttf",
  ),
}

/** Read the regular + bold panel faces as raw TTF bytes. */
export const loadFontBytes = async () => {
  const [regularData, boldData] = await Promise.all([
    readFile(FONT_FILE_PATHS.regular),
    readFile(FONT_FILE_PATHS.bold),
  ])
  return { regularData, boldData }
}

/** Load the panel faces as Satori font descriptors (plus DejaVu fallback). */
export const loadSatoriFonts = async (): Promise<
  Font[]
> => {
  const { regularData, boldData } = await loadFontBytes()
  const [dejaVuRegular, dejaVuBold] = await Promise.all([
    readFile(join(assetsDirectory, "DejaVuSans.ttf")),
    readFile(join(assetsDirectory, "DejaVuSans-Bold.ttf")),
  ])

  return [
    {
      name: FONT_FAMILY,
      data: regularData,
      weight: 400,
      style: "normal",
    },
    {
      name: FONT_FAMILY,
      data: boldData,
      weight: 700,
      style: "normal",
    },
    {
      name: "DejaVu Sans",
      data: dejaVuRegular,
      weight: 400,
      style: "normal",
    },
    {
      name: "DejaVu Sans",
      data: dejaVuBold,
      weight: 700,
      style: "normal",
    },
  ]
}
