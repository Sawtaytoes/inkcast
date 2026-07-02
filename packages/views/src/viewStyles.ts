import type { CSSProperties } from "react"
import type { ViewColourMode } from "./viewProps.ts"

/**
 * Style bits shared by every Inkcast view, so panel-wide constants (font,
 * background, Satori-safe flex column root) live in one place instead of being
 * copied into each component.
 */

export const PANEL_FONT_FAMILY =
  '"Atkinson Hyperlegible", "DejaVu Sans", sans-serif'

/** The Satori-safe base every view's root element starts from. */
export const buildPanelRootStyle = ({
  width,
  height,
}: {
  width: number
  height: number
}): CSSProperties => ({
  width,
  height,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#ffffff",
  color: "#000000",
  fontFamily: PANEL_FONT_FAMILY,
  boxSizing: "border-box",
})

/** A view's accent ink: the given E6 colour, collapsing to black on mono. */
export const getAccentColour = ({
  colourMode,
  e6Colour,
}: {
  colourMode: ViewColourMode
  e6Colour: string
}) => (colourMode === "e6" ? e6Colour : "#000000")

/**
 * Average glyph advance of Atkinson Hyperlegible, as a fraction of the font
 * size. Multiplying `fontSize × ratio × characterCount` estimates a line's
 * rendered width without measuring text (neither render engine exposes
 * metrics to the view).
 */
const AVERAGE_GLYPH_ADVANCE_RATIO = 0.52

/** The smallest a fitted font may shrink to, as a fraction of its base size. */
const MINIMUM_FIT_FONT_SCALE = 0.62

/**
 * Shrink-to-fit font sizing for one line of text. Estimates the rendered
 * width as `fontSize × 0.52 × text.length` (the Atkinson Hyperlegible average
 * advance) and, when the base size would overflow, scales the font down just
 * enough to fit `availableWidth` — clamped to no smaller than 62% of the base
 * size so text stays legible across a room. Text still too wide at the
 * minimum scale is the caller's problem: keep an ellipsis truncation style on
 * the line as the final fallback.
 */
export const fitFontSize = ({
  baseFontSize,
  availableWidth,
  text,
}: {
  baseFontSize: number
  availableWidth: number
  text: string
}) => {
  const estimatedWidth =
    baseFontSize * AVERAGE_GLYPH_ADVANCE_RATIO * text.length

  if (estimatedWidth <= availableWidth) {
    return baseFontSize
  }

  const fittedFontSize =
    availableWidth /
    (AVERAGE_GLYPH_ADVANCE_RATIO * text.length)

  return Math.max(
    Math.round(fittedFontSize),
    Math.round(baseFontSize * MINIMUM_FIT_FONT_SCALE),
  )
}
