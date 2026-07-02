/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { PanelViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  getAccentColour,
} from "./viewStyles.ts"

/**
 * A big-clock view: centered time with the date beneath. Time/date are passed in
 * as pre-formatted strings (the server formats them in the configured timezone),
 * so the view stays a pure function of its props and renders identically under
 * both engines. Inline styles + flexbox (Satori-safe).
 */
export type ClockViewProps = PanelViewProps & {
  time: string
  date: string
}

export const ClockView = ({
  width,
  height,
  colourMode,
  time,
  date,
}: ClockViewProps) => {
  const accentColour = getAccentColour({
    colourMode,
    e6Colour: "#1f4fd0",
  })

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    alignItems: "center",
    justifyContent: "center",
  }

  const timeStyle: CSSProperties = {
    display: "flex",
    fontSize: Math.round(height * 0.42),
    fontWeight: 700,
    lineHeight: 1,
    color: accentColour,
  }

  const dateStyle: CSSProperties = {
    display: "flex",
    fontSize: Math.round(height * 0.13),
    marginTop: Math.round(height * 0.06),
  }

  return (
    <div style={rootStyle}>
      <div style={timeStyle}>{time}</div>
      <div style={dateStyle}>{date}</div>
    </div>
  )
}
