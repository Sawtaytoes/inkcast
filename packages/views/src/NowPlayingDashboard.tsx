/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { NowPlayingViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  fitFontSize,
  getAccentColour,
} from "./viewStyles.ts"

/**
 * Now-playing view, dashboard variant.
 *
 * The track title is the visual anchor: it comes first (big and bold), with
 * the artist beneath it and the album third. The artist line is hidden when
 * it is empty or the "—" placeholder (YouTube Music streams often carry no
 * artist). Long lines shrink-to-fit via `fitFontSize` before the ellipsis
 * truncation kicks in.
 *
 * Large panels: a play-state glyph + banner, the clock in the top-right
 * corner, album art beside the title/artist/album block, and the date in a
 * footer strip. Small panels (≤200px tall) drop the banner row entirely —
 * the space goes to the track text beside the art (nudged optically high so
 * the layout isn't bottom-heavy), small text is bold so it survives 1-bit
 * dithering, and the date + time share one footer line hugging the bottom
 * ("07-01W", "11:50p"), which the server pre-formats. Inline styles +
 * flexbox only (Satori-safe).
 */
export type NowPlayingDashboardProps =
  NowPlayingViewProps & {
    time: string
    date: string
  }

const COMPACT_PANEL_MAX_HEIGHT = 200

const ARTIST_PLACEHOLDER = "—"

export const NowPlayingDashboard = ({
  width,
  height,
  colourMode,
  artist,
  title,
  album,
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
  const isCompactPanel = height <= COMPACT_PANEL_MAX_HEIGHT
  const trimmedArtist = artist.trim()
  const hasVisibleArtist =
    trimmedArtist !== "" &&
    trimmedArtist !== ARTIST_PLACEHOLDER

  const bannerFontSize = Math.round(height * 0.08)
  const timeFontSize = Math.round(height * 0.12)
  const baseTitleFontSize = Math.round(height * 0.16)
  const baseArtistFontSize = Math.round(
    height * (isCompactPanel ? 0.13 : 0.14),
  )
  const baseAlbumFontSize = Math.round(
    height * (isCompactPanel ? 0.11 : 0.1),
  )
  const dateFontSize = Math.round(
    height * (isCompactPanel ? 0.12 : 0.1),
  )
  const padding = Math.round(height * 0.06)

  const artworkSide = Math.round(
    height *
      (colourMode === "e6"
        ? 0.5
        : isCompactPanel
          ? 0.6
          : 0.44),
  )
  const artworkToTextGap = Math.round(height * 0.06)
  const solidLineThickness = Math.max(
    2,
    Math.round(height * 0.008),
  )

  const trackTextAvailableWidth =
    width -
    padding * 2 -
    (hasArtwork ? artworkSide + artworkToTextGap : 0)

  const titleFontSize = fitFontSize({
    baseFontSize: baseTitleFontSize,
    availableWidth: trackTextAvailableWidth,
    text: title,
  })
  // The title is the anchor: when a long title shrinks below the artist's
  // base size, the artist/album cap below it so the hierarchy never inverts.
  const artistFontSize = fitFontSize({
    baseFontSize: Math.min(
      baseArtistFontSize,
      Math.round(titleFontSize * 0.85),
    ),
    availableWidth: trackTextAvailableWidth,
    text: artist,
  })
  const albumFontSize = fitFontSize({
    baseFontSize: Math.min(
      baseAlbumFontSize,
      Math.round(titleFontSize * 0.7),
    ),
    availableWidth: trackTextAvailableWidth,
    text: album ?? "",
  })

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
    // On the compact panel the centered body reads bottom-heavy next to the
    // footer strip, so bias the optical centre upward a touch.
    paddingBottom: isCompactPanel
      ? Math.round(height * 0.06)
      : 0,
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
    marginLeft: hasArtwork ? artworkToTextGap : 0,
  }

  const truncatingLineStyle: CSSProperties = {
    display: "flex",
    maxWidth: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  }

  const titleStyle: CSSProperties = {
    ...truncatingLineStyle,
    fontSize: titleFontSize,
    fontWeight: 700,
    lineHeight: 1.05,
  }

  const artistStyle: CSSProperties = {
    ...truncatingLineStyle,
    fontSize: artistFontSize,
    // Small text dithers away on the 1-bit panel unless it is bold.
    fontWeight: isCompactPanel ? 700 : 400,
    lineHeight: 1.1,
    marginTop: Math.round(height * 0.02),
  }

  const albumStyle: CSSProperties = {
    ...truncatingLineStyle,
    fontSize: albumFontSize,
    fontWeight: isCompactPanel ? 700 : 400,
    lineHeight: 1.1,
    marginTop: Math.round(height * 0.015),
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
    justifyContent: "space-between",
    marginTop: Math.round(
      height * (isCompactPanel ? 0.02 : 0.03),
    ),
  }

  const dateStyle: CSSProperties = {
    display: "flex",
    fontSize: dateFontSize,
    fontWeight: isCompactPanel ? 700 : 400,
    lineHeight: 1,
  }

  return (
    <div style={rootStyle}>
      {isCompactPanel ? null : (
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
      )}

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
          <div style={titleStyle}>{title}</div>
          {hasVisibleArtist ? (
            <div style={artistStyle}>{artist}</div>
          ) : null}
          {album ? (
            <div style={albumStyle}>{album}</div>
          ) : null}
        </div>
      </div>

      <div style={footerRuleStyle} />

      <div style={footerRowStyle}>
        <div style={dateStyle}>{date}</div>
        {isCompactPanel ? (
          <div style={timeStyle}>{time}</div>
        ) : null}
      </div>
    </div>
  )
}
