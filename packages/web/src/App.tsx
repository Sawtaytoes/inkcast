import {
  IMPRESSION_DEVICE,
  PHAT_DEVICE,
} from "@castkit/core/devices/device"
import { type CSSProperties, useState } from "react"
import { PanelFrame } from "./PanelFrame.tsx"

/**
 * The Inkcast dev-preview app: edit the sample track and toggle playing/idle,
 * and see every panel re-render live at its native size. The "see + test" editor
 * from requirement 2 — a fast loop before anything is pushed to hardware.
 */

const PANELS = [
  { device: PHAT_DEVICE, zoom: 3 },
  { device: IMPRESSION_DEVICE, zoom: 1 },
]

const controlRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 24,
}

export const App = () => {
  const [artist, setArtist] = useState("Twilight Force")
  const [title, setTitle] = useState(
    "Dawn of the Dragonstar",
  )
  const [isPlaying, setIsPlaying] = useState(true)

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <h1 style={{ marginTop: 0 }}>Inkcast dev preview</h1>

      <div style={controlRowStyle}>
        <label>
          Artist{" "}
          <input
            value={artist}
            onChange={(changeEvent) =>
              setArtist(changeEvent.target.value)
            }
          />
        </label>

        <label>
          Title{" "}
          <input
            value={title}
            onChange={(changeEvent) =>
              setTitle(changeEvent.target.value)
            }
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={isPlaying}
            onChange={(changeEvent) =>
              setIsPlaying(changeEvent.target.checked)
            }
          />{" "}
          Playing
        </label>
      </div>

      <div
        style={{
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {PANELS.map(({ device, zoom }) => (
          <PanelFrame
            key={device.id}
            label={device.label}
            width={device.width}
            height={device.height}
            colourMode={device.colourMode}
            artist={artist}
            title={title}
            isPlaying={isPlaying}
            zoom={zoom}
          />
        ))}
      </div>
    </main>
  )
}
