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
 * Now-playing view, editorial variant — ARTWORK-FORWARD.
 *
 * When the player exposes art (a Plex poster, album cover), the poster is the
 * hero: it bleeds full-height down one side of the panel with an accent spine,
 * and the type (kicker + heavy title + byline) sits in the remaining column.
 * When there is no art (YouTube on the Shield exposes none), the same type
 * fills the whole panel as a bold typographic poster instead — so the card
 * never looks empty.
 *
 * The title WRAPS (shrink-and-condense-to-fit across a few lines) rather than
 * truncating at ~15 chars, and the accent ink means "playing right now"
 * (drops to black for last-played). Inline styles + flexbox only (Satori-safe).
 */
const ARTIST_PLACEHOLDER = "—"

export const NowPlayingEditorial = ({
  width,
  height,
  colourMode,
  artist,
  title,
  isPlaying,
  artworkDataUri,
}: NowPlayingViewProps) => {
  const accentColour = getAccentColour({
    colourMode,
    e6Colour: "#d90000",
  })
  const statusColour = isPlaying ? accentColour : "#000000"
  const hasArtwork = artworkDataUri !== undefined
  const trimmedArtist = artist.trim()
  const hasVisibleArtist =
    trimmedArtist !== "" &&
    trimmedArtist !== ARTIST_PLACEHOLDER

  const readableFloor = READABLE_FONT_FLOOR_PX[colourMode]

  // The poster bleeds full-height down the leading edge; the type column takes
  // the rest. With no art, the type column is the whole panel.
  const posterPaneWidth = hasArtwork
    ? Math.round(width * (colourMode === "e6" ? 0.44 : 0.4))
    : 0
  const spineThickness = hasArtwork
    ? Math.max(3, Math.round(width * 0.01))
    : 0
  const padding = Math.round(height * 0.08)

  const typeColumnWidth =
    width - posterPaneWidth - spineThickness
  const textAvailableWidth = typeColumnWidth - padding * 2

  // The kicker + byline are fixed; the title is the flexible hero. Give it more
  // lines (and a bigger base) when it stands alone with the whole panel. Base
  // sizes stay conservative so greedy word-wrap fits within the line budget
  // rather than clipping at the maxHeight.
  const eyebrowFontSize = Math.max(
    11,
    Math.round(height * 0.058),
  )
  const artistFontSize = Math.max(
    12,
    Math.round(height * (hasArtwork ? 0.062 : 0.08)),
  )
  const titleLineCount = hasArtwork ? 4 : 5
  const baseTitleFontSize = Math.round(
    height * (hasArtwork ? 0.115 : 0.135),
  )
  const fittedTitle = fitText({
    baseFontSize: baseTitleFontSize,
    minimumFontSize: Math.min(
      baseTitleFontSize,
      readableFloor,
    ),
    availableWidth: textAvailableWidth,
    text: title,
    lineCount: titleLineCount,
  })

  const hairlineThickness = Math.max(
    2,
    Math.round(height * 0.006),
  )
  const accentRuleThickness = Math.max(
    3,
    Math.round(height * 0.014),
  )
  const titleLineHeight = 1.1

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    flexDirection: "row",
  }

  const posterPaneStyle: CSSProperties = {
    display: "flex",
    width: posterPaneWidth,
    height: "100%",
    flexShrink: 0,
  }

  const posterImageStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  }

  const spineStyle: CSSProperties = {
    display: "flex",
    width: spineThickness,
    height: "100%",
    flexShrink: 0,
    backgroundColor: statusColour,
  }

  const typeColumnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    padding,
    justifyContent: "space-between",
  }

  const eyebrowRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  }

  const eyebrowTextStyle: CSSProperties = {
    display: "flex",
    fontSize: eyebrowFontSize,
    fontWeight: 700,
    letterSpacing: Math.max(
      2,
      Math.round(eyebrowFontSize * 0.2),
    ),
    textTransform: "uppercase",
    color: statusColour,
  }

  const eyebrowRuleStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    height: hairlineThickness,
    backgroundColor: "#000000",
    marginTop: Math.round(height * 0.025),
  }

  // The title block is the optical centre; let it take the slack between the
  // kicker and the byline.
  const titleBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    minWidth: 0,
  }

  const titleStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    fontSize: fittedTitle.fontSize,
    letterSpacing: fittedTitle.letterSpacing,
    fontWeight: 700,
    lineHeight: titleLineHeight,
    overflow: "hidden",
    maxHeight: Math.round(
      fittedTitle.fontSize *
        titleLineHeight *
        titleLineCount,
    ),
  }

  const accentRuleStyle: CSSProperties = {
    display: "flex",
    width: Math.round(typeColumnWidth * 0.28),
    height: accentRuleThickness,
    backgroundColor: statusColour,
    marginTop: Math.round(height * 0.04),
  }

  const artistStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    fontSize: artistFontSize,
    fontWeight: 400,
    letterSpacing: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }

  return (
    <div style={rootStyle}>
      {hasArtwork ? (
        <div style={posterPaneStyle}>
          <img
            alt=""
            src={artworkDataUri}
            style={posterImageStyle}
          />
        </div>
      ) : null}
      {hasArtwork ? <div style={spineStyle} /> : null}

      <div style={typeColumnStyle}>
        <div style={eyebrowRowStyle}>
          <div style={eyebrowTextStyle}>
            {isPlaying ? "Now Playing" : "Last Played"}
          </div>
          <div style={eyebrowRuleStyle} />
        </div>

        <div style={titleBlockStyle}>
          <div style={titleStyle}>{title}</div>
          {hasVisibleArtist ? (
            <div style={accentRuleStyle} />
          ) : null}
        </div>

        {hasVisibleArtist ? (
          <div style={artistStyle}>{artist}</div>
        ) : null}
      </div>
    </div>
  )
}
