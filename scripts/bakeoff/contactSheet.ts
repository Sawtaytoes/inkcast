import { FONT_FILE_PATHS } from "@inkcast/render/fonts"
import { Resvg } from "@resvg/resvg-js"
import sharp from "sharp"

/**
 * Bake-off contact-sheet helpers. Composes labelled PNG tiles into a grid so
 * you can eyeball render-engine and dither differences side by side (the
 * Decision-1 and Decision-2 deliverables). Labels are rasterized with resvg +
 * the DejaVu font so this works headless on any OS.
 */

const LABEL_HEIGHT = 34
const TILE_GAP = 16
const TILE_BACKGROUND = { r: 210, g: 210, b: 210, alpha: 1 }
const SHEET_BACKGROUND = {
  r: 240,
  g: 240,
  b: 240,
  alpha: 1,
}

/** Rasterize a single line of label text to a PNG of the given width. */
const renderLabel = ({
  text,
  width,
}: {
  text: string
  width: number
}) => {
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}">
    <rect width="100%" height="100%" fill="#111111"/>
    <text x="8" y="23" font-family="DejaVu Sans" font-size="18" fill="#ffffff">${escapedText}</text>
  </svg>`

  const resvg = new Resvg(svgMarkup, {
    font: {
      fontFiles: [
        FONT_FILE_PATHS.regular,
        FONT_FILE_PATHS.bold,
      ],
      defaultFontFamily: "DejaVu Sans",
      loadSystemFonts: false,
    },
  })

  return Buffer.from(resvg.render().asPng())
}

export type LabelledTile = {
  label: string
  png: Buffer
}

/**
 * Stack a label above its image and pad the image onto a neutral background so
 * every tile in a row shares the same footprint (mono and E6 tiles differ in
 * size otherwise). Returns a fixed-size PNG tile.
 */
const buildTile = async ({
  tile,
  cellWidth,
  cellImageHeight,
}: {
  tile: LabelledTile
  cellWidth: number
  cellImageHeight: number
}) => {
  const labelPng = renderLabel({
    text: tile.label,
    width: cellWidth,
  })

  const framedImage = await sharp(tile.png)
    .resize(cellWidth, cellImageHeight, {
      fit: "contain",
      background: TILE_BACKGROUND,
    })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: cellWidth,
      height: LABEL_HEIGHT + cellImageHeight,
      channels: 4,
      background: TILE_BACKGROUND,
    },
  })
    .composite([
      { input: labelPng, top: 0, left: 0 },
      { input: framedImage, top: LABEL_HEIGHT, left: 0 },
    ])
    .png()
    .toBuffer()
}

/**
 * Compose a grid of labelled tiles into one contact sheet. `columns` sets the
 * wrap width; tiles are sized to the largest native dimensions so panels of
 * different resolutions line up.
 */
export const buildContactSheet = async ({
  tiles,
  columns,
  cellWidth,
  cellImageHeight,
}: {
  tiles: readonly LabelledTile[]
  columns: number
  cellWidth: number
  cellImageHeight: number
}) => {
  const tilePngs = await Promise.all(
    tiles.map((tile) =>
      buildTile({ tile, cellWidth, cellImageHeight }),
    ),
  )

  const tileHeight = LABEL_HEIGHT + cellImageHeight
  const rowCount = Math.ceil(tilePngs.length / columns)

  const sheetWidth =
    columns * cellWidth + (columns + 1) * TILE_GAP
  const sheetHeight =
    rowCount * tileHeight + (rowCount + 1) * TILE_GAP

  const composites = tilePngs.map((tilePng, tileIndex) => {
    const columnIndex = tileIndex % columns
    const rowIndex = Math.floor(tileIndex / columns)

    return {
      input: tilePng,
      left: TILE_GAP + columnIndex * (cellWidth + TILE_GAP),
      top: TILE_GAP + rowIndex * (tileHeight + TILE_GAP),
    }
  })

  return sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: SHEET_BACKGROUND,
    },
  })
    .composite(composites)
    .png()
    .toBuffer()
}
