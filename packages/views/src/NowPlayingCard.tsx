/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { PanelViewProps } from "./viewProps.ts"

/**
 * The Phase-0 "spine" view: a now-playing card. Shows a NOW PLAYING / LAST
 * PLAYED banner, the artist, and the track title, scaled to the panel size.
 *
 * Rendered by BOTH the Chromium and Satori engines, so it is built only from
 * inline `style` objects and a flexbox layout (Satori's supported subset) — no
 * Tailwind, no external CSS, no grid. On the mono pHAT the accent collapses to
 * black; on the E6 Impression it uses the panel's red ink.
 */
export type NowPlayingCardProps = PanelViewProps & {
  artist: string
  title: string
  isPlaying: boolean
}

export const NowPlayingCard = ({
  width,
  height,
  colourMode,
  artist,
  title,
  isPlaying,
}: NowPlayingCardProps) => {
  // Type everything to CSSProperties so Satori and React agree on the shape.
  const accentColour =
    colourMode === "e6" ? "#d90000" : "#000000"

  const bannerFontSize = Math.round(height * 0.11)
  const artistFontSize = Math.round(height * 0.2)
  const titleFontSize = Math.round(height * 0.14)
  const padding = Math.round(height * 0.08)

  const rootStyle: CSSProperties = {
    width,
    height,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    color: "#000000",
    padding,
    fontFamily: "DejaVu Sans, sans-serif",
    boxSizing: "border-box",
  }

  const bannerStyle: CSSProperties = {
    display: "flex",
    fontSize: bannerFontSize,
    fontWeight: 700,
    letterSpacing: 2,
    color: accentColour,
    textTransform: "uppercase",
  }

  const bodyStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
  }

  const artistStyle: CSSProperties = {
    display: "flex",
    fontSize: artistFontSize,
    fontWeight: 700,
    lineHeight: 1.05,
  }

  const titleStyle: CSSProperties = {
    display: "flex",
    fontSize: titleFontSize,
    lineHeight: 1.1,
    marginTop: Math.round(height * 0.03),
  }

  return (
    <div style={rootStyle}>
      <div style={bannerStyle}>
        {isPlaying ? "Now Playing" : "Last Played"}
      </div>

      <div style={bodyStyle}>
        <div style={artistStyle}>{artist}</div>
        <div style={titleStyle}>{title}</div>
      </div>
    </div>
  )
}
