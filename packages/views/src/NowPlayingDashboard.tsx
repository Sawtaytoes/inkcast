/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { NowPlayingViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  getAccentColour,
} from "./viewStyles.ts"

/**
 * Now-playing view, dashboard variant: a play-state glyph + banner, the
 * clock in the top-right corner, album art beside the artist/title block,
 * and the date in a footer strip — the old panel's time + date + track
 * combination in one view. Time/date arrive pre-formatted from the server.
 * Inline styles + flexbox only (Satori-safe).
 */
export type NowPlayingDashboardProps =
  NowPlayingViewProps & {
    time: string
    date: string
  }

export const NowPlayingDashboard = ({
  width,
  height,
  colourMode,
  artist,
  title,
  isPlaying,
  time,
  date,
  artworkDataUri,
}: NowPlayingDashboardProps) => {
  const accentColour = getAccentColour({
    colourMode,
    e6Colour: "#d90000",
  })
  const hasArtwork = artworkDataUri !== undefined

  const bannerFontSize = Math.round(height * 0.08)
  const timeFontSize = Math.round(height * 0.12)
  const artistFontSize = Math.round(height * 0.2)
  const titleFontSize = Math.round(height * 0.14)
  const dateFontSize = Math.round(height * 0.1)
  const padding = Math.round(height * 0.07)

  const artworkSide = Math.round(
    height * (colourMode === "e6" ? 0.5 : 0.44),
  )
  const solidLineThickness = Math.max(
    2,
    Math.round(height * 0.008),
  )

  const glyphSize = Math.round(height * 0.08)
  const pauseBarWidth = Math.max(
    2,
    Math.round(glyphSize * 0.35),
  )

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    padding,
  }

  const headerRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  }

  const bannerGroupStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
  }

  const playGlyphStyle: CSSProperties = {
    display: "flex",
    width: 0,
    height: 0,
    borderTop: `${Math.round(glyphSize * 0.5)}px solid transparent`,
    borderBottom: `${Math.round(glyphSize * 0.5)}px solid transparent`,
    borderLeft: `${Math.round(glyphSize * 0.8)}px solid ${accentColour}`,
  }

  const pauseGlyphStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
  }

  const pauseBarStyle: CSSProperties = {
    display: "flex",
    width: pauseBarWidth,
    height: glyphSize,
    backgroundColor: accentColour,
  }

  const secondPauseBarStyle: CSSProperties = {
    ...pauseBarStyle,
    marginLeft: pauseBarWidth,
  }

  const bannerStyle: CSSProperties = {
    display: "flex",
    fontSize: bannerFontSize,
    fontWeight: 700,
    letterSpacing: 2,
    color: accentColour,
    textTransform: "uppercase",
    marginLeft: Math.round(glyphSize * 0.9),
  }

  const timeStyle: CSSProperties = {
    display: "flex",
    fontSize: timeFontSize,
    fontWeight: 700,
    lineHeight: 1,
  }

  const bodyRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    minWidth: 0,
  }

  const artworkFrameStyle: CSSProperties = {
    display: "flex",
    width: artworkSide,
    height: artworkSide,
    flexShrink: 0,
    border: `${solidLineThickness}px solid #000000`,
  }

  const artworkImageStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  }

  const trackColumnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
    minWidth: 0,
    marginLeft: hasArtwork ? Math.round(height * 0.06) : 0,
  }

  const artistStyle: CSSProperties = {
    display: "flex",
    maxWidth: "100%",
    fontSize: artistFontSize,
    fontWeight: 700,
    lineHeight: 1.05,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  }

  const titleStyle: CSSProperties = {
    display: "flex",
    maxWidth: "100%",
    fontSize: titleFontSize,
    lineHeight: 1.1,
    marginTop: Math.round(height * 0.03),
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  }

  const footerRuleStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    height: solidLineThickness,
    backgroundColor: "#000000",
  }

  const footerRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    marginTop: Math.round(height * 0.035),
  }

  const dateStyle: CSSProperties = {
    display: "flex",
    fontSize: dateFontSize,
    lineHeight: 1,
  }

  return (
    <div style={rootStyle}>
      <div style={headerRowStyle}>
        <div style={bannerGroupStyle}>
          {isPlaying ? (
            <div style={playGlyphStyle} />
          ) : (
            <div style={pauseGlyphStyle}>
              <div style={pauseBarStyle} />
              <div style={secondPauseBarStyle} />
            </div>
          )}
          <div style={bannerStyle}>
            {isPlaying ? "Now Playing" : "Last Played"}
          </div>
        </div>

        <div style={timeStyle}>{time}</div>
      </div>

      <div style={bodyRowStyle}>
        {hasArtwork ? (
          <div style={artworkFrameStyle}>
            <img
              alt=""
              src={artworkDataUri}
              style={artworkImageStyle}
            />
          </div>
        ) : null}

        <div style={trackColumnStyle}>
          <div style={artistStyle}>{artist}</div>
          <div style={titleStyle}>{title}</div>
        </div>
      </div>

      <div style={footerRuleStyle} />

      <div style={footerRowStyle}>
        <div style={dateStyle}>{date}</div>
      </div>
    </div>
  )
}
