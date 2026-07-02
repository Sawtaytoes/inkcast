/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { NowPlayingViewProps } from "./viewProps.ts"
import { buildPanelRootStyle } from "./viewStyles.ts"

/**
 * Now-playing view, poster variant (Swiss/Bauhaus): a full-height accent
 * rail with equalizer/pause bars, a black banner strip with a play-state
 * chip, the artist as display type on white over an underline slab, the
 * title dropped out white-on-black, and a black-matted art plate filling
 * the right edge. All chrome is flat rectangles of exact E6 ink values so
 * solid regions never dither; on mono every surface collapses to pure
 * black/white. Inline styles + flexbox only (Satori-safe).
 */
const E6_INKS = {
  black: "rgb(0, 0, 0)",
  white: "rgb(255, 255, 255)",
  yellow: "rgb(255, 255, 0)",
  red: "rgb(255, 0, 0)",
  blue: "rgb(0, 0, 255)",
  green: "rgb(0, 255, 0)",
} as const

type EqualizerBar = { id: string; heightRatio: number }

const PLAYING_BARS: readonly EqualizerBar[] = [
  { id: "low", heightRatio: 0.45 },
  { id: "high", heightRatio: 0.8 },
  { id: "mid", heightRatio: 0.6 },
]
const PAUSED_BARS: readonly EqualizerBar[] = [
  { id: "left", heightRatio: 0.7 },
  { id: "right", heightRatio: 0.7 },
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
  const isE6Panel = colourMode === "e6"
  const hasArtwork = typeof artworkDataUri === "string"

  const railWidth = Math.round(height * 0.16)
  const bannerHeight = Math.round(height * 0.16)
  const titleBlockHeight = Math.round(height * 0.34)
  const contentPadding = Math.round(height * 0.05)
  const hairlineHeight = Math.max(
    2,
    Math.round(height * 0.018),
  )

  const bannerFontSize = Math.round(height * 0.09)
  const artistFontSize = Math.round(height * 0.17)
  const titleFontSize = Math.round(height * 0.115)

  const stateChipSize = Math.round(bannerHeight * 0.42)
  const barWidth = Math.max(2, Math.round(railWidth * 0.2))
  const barGap = Math.max(1, Math.round(railWidth * 0.14))
  const barZoneHeight = Math.round(height * 0.16)

  const artworkColumnWidth = Math.round(height * 0.55)
  const artworkFrameWidth = Math.max(
    3,
    Math.round(height * 0.02),
  )
  const artworkImageWidth =
    artworkColumnWidth - artworkFrameWidth * 2
  const artworkImageHeight =
    height - bannerHeight - artworkFrameWidth * 2

  const railColour = isE6Panel ? E6_INKS.red : E6_INKS.black
  const stateChipColour = isE6Panel
    ? isPlaying
      ? E6_INKS.green
      : E6_INKS.yellow
    : E6_INKS.white
  const underlineColour = isE6Panel
    ? E6_INKS.yellow
    : E6_INKS.black
  const titleHairlineColour = isE6Panel
    ? E6_INKS.blue
    : E6_INKS.black

  const equalizerBars = isPlaying
    ? PLAYING_BARS
    : PAUSED_BARS

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    flexDirection: "row",
  }

  const railStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
    width: railWidth,
    backgroundColor: railColour,
    paddingBottom: contentPadding,
  }

  const barRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    height: barZoneHeight,
    gap: barGap,
  }

  const mainColumnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
  }

  const bannerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: bannerHeight,
    backgroundColor: E6_INKS.black,
    paddingLeft: contentPadding,
    paddingRight: contentPadding,
  }

  const bannerTextStyle: CSSProperties = {
    display: "flex",
    fontSize: bannerFontSize,
    fontWeight: 700,
    letterSpacing: Math.max(1, Math.round(height * 0.008)),
    color: E6_INKS.white,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
  }

  const stateChipStyle: CSSProperties = {
    display: "flex",
    width: stateChipSize,
    height: stateChipSize,
    backgroundColor: stateChipColour,
  }

  const contentRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
  }

  const textColumnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
  }

  const artistZoneStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
    padding: contentPadding,
    overflow: "hidden",
  }

  const artistTextStyle: CSSProperties = {
    display: "flex",
    fontSize: artistFontSize,
    fontWeight: 700,
    lineHeight: 1,
    color: E6_INKS.black,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
  }

  const underlineSlabStyle: CSSProperties = {
    display: "flex",
    width: Math.round(width * 0.3),
    height: Math.max(3, Math.round(height * 0.03)),
    backgroundColor: underlineColour,
    marginTop: Math.round(height * 0.03),
  }

  const titleBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: titleBlockHeight,
    backgroundColor: E6_INKS.black,
    overflow: "hidden",
  }

  const titleHairlineStyle: CSSProperties = {
    display: "flex",
    height: hairlineHeight,
    backgroundColor: titleHairlineColour,
  }

  const titleInnerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flexGrow: 1,
    paddingLeft: contentPadding,
    paddingRight: contentPadding,
    overflow: "hidden",
  }

  const titleTextStyle: CSSProperties = {
    display: "flex",
    fontSize: titleFontSize,
    fontWeight: 700,
    lineHeight: 1.15,
    color: E6_INKS.white,
  }

  const artworkPlateStyle: CSSProperties = {
    display: "flex",
    width: artworkColumnWidth,
    backgroundColor: E6_INKS.black,
    padding: artworkFrameWidth,
    overflow: "hidden",
  }

  const artworkImageStyle: CSSProperties = {
    width: artworkImageWidth,
    height: artworkImageHeight,
    objectFit: "cover",
  }

  return (
    <div style={rootStyle}>
      <div style={railStyle}>
        <div style={barRowStyle}>
          {equalizerBars.map((equalizerBar) => (
            <div
              key={equalizerBar.id}
              style={{
                display: "flex",
                width: barWidth,
                height: Math.round(
                  barZoneHeight * equalizerBar.heightRatio,
                ),
                backgroundColor: E6_INKS.white,
              }}
            />
          ))}
        </div>
      </div>

      <div style={mainColumnStyle}>
        <div style={bannerStyle}>
          <div style={bannerTextStyle}>
            {isPlaying ? "Now Playing" : "Last Played"}
          </div>
          <div style={stateChipStyle} />
        </div>

        <div style={contentRowStyle}>
          <div style={textColumnStyle}>
            <div style={artistZoneStyle}>
              <div style={artistTextStyle}>{artist}</div>
              <div style={underlineSlabStyle} />
            </div>

            <div style={titleBlockStyle}>
              <div style={titleHairlineStyle} />
              <div style={titleInnerStyle}>
                <div style={titleTextStyle}>{title}</div>
              </div>
            </div>
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
      </div>
    </div>
  )
}
