/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { NowPlayingViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  getAccentColour,
} from "./viewStyles.ts"

/**
 * Now-playing view, editorial variant: typeset like a record sleeve — a
 * letterspaced uppercase eyebrow over a full-width rule, the track title as a
 * heavy hero line, a short accent rule, the artist as a tracked-caps byline,
 * a framed square art plate beside the type, and a solid "spine" bar
 * anchoring the bottom edge. The accent ink means "playing right now" and
 * drops to black for last-played. Inline styles + flexbox only (Satori-safe).
 */
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

  const padding = Math.round(height * 0.075)

  const titleLengthScale =
    title.length > 26
      ? 0.13
      : title.length > 15
        ? 0.16
        : 0.2
  const titleScale = hasArtwork
    ? titleLengthScale * 0.85
    : titleLengthScale
  const titleFontSize = Math.max(
    17,
    Math.round(height * titleScale),
  )

  const eyebrowFontSize = Math.max(
    10,
    Math.round(height * 0.055),
  )
  const artistFontSize = Math.max(
    12,
    Math.round(height * 0.09),
  )

  const hairlineThickness = Math.max(
    2,
    Math.round(height * 0.006),
  )
  const spineThickness = Math.max(
    4,
    Math.round(height * 0.025),
  )
  const accentRuleThickness = Math.max(
    3,
    Math.round(height * 0.012),
  )

  const artworkSide = Math.round(
    height * (colourMode === "e6" ? 0.66 : 0.55),
  )
  const artworkFrameThickness = Math.max(
    2,
    Math.round(height * 0.008),
  )

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
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
      Math.round(eyebrowFontSize * 0.18),
    ),
    textTransform: "uppercase",
    color: statusColour,
  }

  const eyebrowRuleStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    height: hairlineThickness,
    backgroundColor: "#000000",
    marginTop: Math.round(height * 0.02),
  }

  const bodyRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    width: "100%",
  }

  const typeColumnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
    minWidth: 0,
  }

  const titleStyle: CSSProperties = {
    width: "100%",
    fontSize: titleFontSize,
    fontWeight: 700,
    lineHeight: 1.08,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }

  const accentRuleStyle: CSSProperties = {
    display: "flex",
    width: Math.round(width * 0.12),
    height: accentRuleThickness,
    backgroundColor: statusColour,
    marginTop: Math.round(height * 0.035),
    marginBottom: Math.round(height * 0.035),
  }

  const artistStyle: CSSProperties = {
    width: "100%",
    fontSize: artistFontSize,
    fontWeight: 400,
    // Modest tracking — heavier tracking truncated short artist names once
    // the art plate narrowed the measure.
    letterSpacing: Math.max(
      1,
      Math.round(artistFontSize * 0.06),
    ),
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }

  const artworkPlateStyle: CSSProperties = {
    display: "flex",
    width: artworkSide,
    height: artworkSide,
    flexShrink: 0,
    border: `${artworkFrameThickness}px solid #000000`,
    marginLeft: Math.round(width * 0.04),
    boxSizing: "border-box",
  }

  const artworkImageStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  }

  const spineStyle: CSSProperties = {
    display: "flex",
    width: "100%",
    height: spineThickness,
    backgroundColor: statusColour,
  }

  return (
    <div style={rootStyle}>
      <div style={eyebrowRowStyle}>
        <div style={eyebrowTextStyle}>
          {isPlaying ? "Now Playing" : "Last Played"}
        </div>
        <div style={eyebrowRuleStyle} />
      </div>

      <div style={bodyRowStyle}>
        <div style={typeColumnStyle}>
          <div style={titleStyle}>{title}</div>
          <div style={accentRuleStyle} />
          <div style={artistStyle}>{artist}</div>
        </div>

        {hasArtwork ? (
          <div style={artworkPlateStyle}>
            <img
              alt=""
              src={artworkDataUri}
              style={artworkImageStyle}
            />
          </div>
        ) : null}
      </div>

      <div style={spineStyle} />
    </div>
  )
}
