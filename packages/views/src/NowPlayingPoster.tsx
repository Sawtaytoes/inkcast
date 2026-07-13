/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { NowPlayingViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  fitText,
  getAccentColour,
  READABLE_FONT_FLOOR_PX,
} from "./viewStyles.ts"

/**
 * Now-playing view, poster variant: a full-height album-art plate on the left
 * and a clean left-aligned "playbill" on the right — a small accent label with
 * a play-state equalizer, the title as the hero (fit-to-fit so it wraps but
 * never clips), the artist beneath it, and a short accent rule grounding the
 * block. White ground, black type, a single accent ink (E6 red, collapsing to
 * black on mono) — calmer than the old Bauhaus slab pile-up, and the fitted
 * type fills the column instead of leaving dead white space. Inline styles +
 * flexbox only (Satori-safe).
 */
const E6_RED = "rgb(255, 0, 0)"

type EqualizerBar = { id: string; heightRatio: number }

const PLAYING_BARS: readonly EqualizerBar[] = [
  { id: "low", heightRatio: 0.5 },
  { id: "high", heightRatio: 1 },
  { id: "mid", heightRatio: 0.7 },
  { id: "tail", heightRatio: 0.85 },
]
const PAUSED_BARS: readonly EqualizerBar[] = [
  { id: "left", heightRatio: 1 },
  { id: "right", heightRatio: 1 },
]

export const NowPlayingPoster = ({
  width,
  height,
  colourMode,
  artist,
  title,
  isPlaying,
  artworkDataUri,
}: NowPlayingViewProps) => {
  const hasArtwork = typeof artworkDataUri === "string"
  const accent = getAccentColour({
    colourMode,
    e6Colour: E6_RED,
  })
  const fontFloor = READABLE_FONT_FLOOR_PX[colourMode]

  // A full-height square art plate on the left, a thin accent spine, and the
  // rest of the width as the playbill. Art is capped so a very wide panel still
  // leaves a readable text column.
  const artSize = Math.min(height, Math.round(width * 0.6))
  const spineWidth = Math.max(2, Math.round(width * 0.005))
  const playbillWidth = width - artSize - spineWidth
  const playbillPadding = Math.round(height * 0.06)
  const contentWidth = playbillWidth - playbillPadding * 2

  const labelFontSize = Math.round(height * 0.05)
  const equalizerZoneHeight = Math.round(height * 0.08)
  const equalizerBarWidth = Math.max(
    2,
    Math.round(height * 0.022),
  )
  const equalizerBarGap = Math.max(
    2,
    Math.round(height * 0.014),
  )

  const equalizerBars = isPlaying
    ? PLAYING_BARS
    : PAUSED_BARS

  // The title is the hero: fit big, wrap up to four lines, never clip. The
  // artist is secondary; both shrink-and-condense to fit rather than truncate.
  const titleFit = fitText({
    baseFontSize: Math.round(height * 0.14),
    minimumFontSize: fontFloor,
    availableWidth: contentWidth,
    text: title,
    lineCount: 4,
  })
  const artistFit = fitText({
    baseFontSize: Math.round(height * 0.075),
    minimumFontSize: fontFloor,
    availableWidth: contentWidth,
    text: artist,
    lineCount: 2,
  })

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    flexDirection: "row",
    alignItems: "stretch",
  }

  const artPlateStyle: CSSProperties = {
    display: "flex",
    width: artSize,
    height,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: hasArtwork ? "#000000" : accent,
    overflow: "hidden",
  }

  const artImageStyle: CSSProperties = {
    width: artSize,
    height,
    objectFit: "cover",
  }

  const spineStyle: CSSProperties = {
    display: "flex",
    width: spineWidth,
    height,
    backgroundColor: accent,
  }

  const playbillStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
    minWidth: 0,
    padding: playbillPadding,
    overflow: "hidden",
  }

  const labelRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: Math.round(height * 0.05),
  }

  const labelTextStyle: CSSProperties = {
    display: "flex",
    fontSize: labelFontSize,
    fontWeight: 700,
    letterSpacing: Math.max(1, Math.round(height * 0.006)),
    color: accent,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }

  const equalizerRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    height: equalizerZoneHeight,
    gap: equalizerBarGap,
  }

  const titleTextStyle: CSSProperties = {
    display: "flex",
    fontSize: titleFit.fontSize,
    letterSpacing: titleFit.letterSpacing,
    fontWeight: 800,
    lineHeight: 1.05,
    color: "#000000",
    overflow: "hidden",
    overflowWrap: "break-word",
  }

  const artistTextStyle: CSSProperties = {
    display: "flex",
    fontSize: artistFit.fontSize,
    letterSpacing: artistFit.letterSpacing,
    fontWeight: 600,
    lineHeight: 1.1,
    color: "#000000",
    marginTop: Math.round(height * 0.035),
    overflow: "hidden",
    overflowWrap: "break-word",
  }

  const ruleStyle: CSSProperties = {
    display: "flex",
    width: Math.round(contentWidth * 0.42),
    height: Math.max(3, Math.round(height * 0.02)),
    backgroundColor: accent,
    marginTop: Math.round(height * 0.05),
  }

  return (
    <div style={rootStyle}>
      <div style={artPlateStyle}>
        {hasArtwork ? (
          <img
            alt=""
            src={artworkDataUri}
            style={artImageStyle}
          />
        ) : (
          <div style={equalizerRowStyle}>
            {equalizerBars.map((equalizerBar) => (
              <div
                key={equalizerBar.id}
                style={{
                  display: "flex",
                  width: Math.round(artSize * 0.06),
                  height: Math.round(
                    artSize *
                      0.4 *
                      equalizerBar.heightRatio,
                  ),
                  backgroundColor: "#ffffff",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={spineStyle} />

      <div style={playbillStyle}>
        <div style={labelRowStyle}>
          <div style={labelTextStyle}>
            {isPlaying ? "Now Playing" : "Last Played"}
          </div>
          <div style={equalizerRowStyle}>
            {equalizerBars.map((equalizerBar) => (
              <div
                key={equalizerBar.id}
                style={{
                  display: "flex",
                  width: equalizerBarWidth,
                  height: Math.round(
                    equalizerZoneHeight *
                      equalizerBar.heightRatio,
                  ),
                  backgroundColor: accent,
                }}
              />
            ))}
          </div>
        </div>

        <div style={titleTextStyle}>{title}</div>
        <div style={artistTextStyle}>{artist}</div>
        <div style={ruleStyle} />
      </div>
    </div>
  )
}
