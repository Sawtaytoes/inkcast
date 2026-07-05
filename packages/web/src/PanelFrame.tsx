import { NowPlayingPoster } from "@inkcast/views/NowPlayingPoster"
import type { CSSProperties } from "react"

/**
 * Renders one view at a panel's exact native pixel size, scaled up by an integer
 * `zoom` (via CSS transform) so the tiny mono panel is legible on a desktop
 * monitor. The inner render is 1:1 with what the device gets — Chromium is the
 * render engine, so this browser preview matches device output (pre-dither).
 */
export type PanelFrameProps = {
  label: string
  width: number
  height: number
  colourMode: "mono" | "e6"
  artist: string
  title: string
  isPlaying: boolean
  zoom: number
}

export const PanelFrame = ({
  label,
  width,
  height,
  colourMode,
  artist,
  title,
  isPlaying,
  zoom,
}: PanelFrameProps) => {
  const scaledStyle: CSSProperties = {
    width: width * zoom,
    height: height * zoom,
    border: "1px solid #999",
    overflow: "hidden",
  }

  const transformStyle: CSSProperties = {
    width,
    height,
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
  }

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          marginBottom: 6,
          color: "#333",
        }}
      >
        {label} — {width}×{height} {colourMode} · {zoom}×
      </figcaption>

      <div style={scaledStyle}>
        <div style={transformStyle}>
          <NowPlayingPoster
            width={width}
            height={height}
            colourMode={colourMode}
            artist={artist}
            title={title}
            isPlaying={isPlaying}
          />
        </div>
      </div>
    </figure>
  )
}
