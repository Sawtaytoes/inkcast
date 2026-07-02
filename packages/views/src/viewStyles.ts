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
