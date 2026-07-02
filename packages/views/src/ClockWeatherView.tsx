/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { PanelViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  fitFontSize,
  getAccentColour,
} from "./viewStyles.ts"

/**
 * A clock view with an optional weather line. The big time is the anchor
 * (like `ClockView`, which is deliberately kept weather-free); beneath it the
 * compact panel packs date + weather into one row ("Th-02 · 79° Partly
 * cloudy") so every pixel of the 250×122 mono panel goes to legibility, while
 * the large panel gives the date its own line and a prominent
 * temperature-and-condition row. When the weather props are absent the view
 * renders exactly like a clock — time + date, no empty placeholders. Time,
 * date, and weather arrive as pre-formatted strings so the view stays a pure
 * function of its props. All small text is bold so it survives 1-bit
 * dithering. Inline styles + flexbox only (Satori-safe).
 */
export type ClockWeatherViewProps = PanelViewProps & {
  time: string
  date: string
  temperatureText?: string
  conditionText?: string
}

const COMPACT_PANEL_MAX_HEIGHT = 200

export const ClockWeatherView = ({
  width,
  height,
  colourMode,
  time,
  date,
  temperatureText,
  conditionText,
}: ClockWeatherViewProps) => {
  const accentColour = getAccentColour({
    colourMode,
    e6Colour: "#1f4fd0",
  })
  const isCompactPanel = height <= COMPACT_PANEL_MAX_HEIGHT
  const hasTemperature =
    temperatureText !== undefined && temperatureText !== ""
  const hasCondition =
    conditionText !== undefined && conditionText !== ""
  const hasWeather = hasTemperature || hasCondition

  const horizontalPadding = Math.round(width * 0.04)
  const availableWidth = width - horizontalPadding * 2

  // With weather present the time cedes a little height to the extra line;
  // without it the proportions match ClockView. Long time strings
  // ("12:45 AM" on the wide panel) shrink to fit rather than wrapping.
  const timeFontSize = fitFontSize({
    baseFontSize: Math.round(
      height * (hasWeather ? 0.36 : 0.42),
    ),
    availableWidth,
    text: time,
  })
  const dateFontSize = Math.round(height * 0.13)

  // The compact panel packs date + weather into one line, so size the whole
  // line as one string (the temperature keeps a fixed bump over the rest).
  const compactInfoText = [
    date,
    temperatureText ?? "",
    conditionText ?? "",
  ].join(" ")
  const compactWeatherFontSize = fitFontSize({
    baseFontSize: Math.round(height * 0.13),
    availableWidth,
    text: compactInfoText,
  })
  const compactTemperatureFontSize = Math.round(
    compactWeatherFontSize * 1.25,
  )
  const largeTemperatureFontSize = Math.round(height * 0.16)
  const temperatureToConditionGap = Math.round(
    width * 0.025,
  )
  const estimatedTemperatureWidth = hasTemperature
    ? Math.round(
        largeTemperatureFontSize *
          0.52 *
          (temperatureText?.length ?? 0),
      ) + temperatureToConditionGap
    : 0
  const largeConditionFontSize = fitFontSize({
    baseFontSize: Math.round(height * 0.08),
    availableWidth:
      availableWidth - estimatedTemperatureWidth,
    text: conditionText ?? "",
  })

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    alignItems: "center",
    justifyContent: "center",
  }

  const timeStyle: CSSProperties = {
    display: "flex",
    fontSize: timeFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    color: accentColour,
  }

  const compactDateStyle: CSSProperties = {
    display: "flex",
    fontSize: compactWeatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
  }

  const dateStyle: CSSProperties = {
    display: "flex",
    fontSize: dateFontSize,
    fontWeight: 700,
    lineHeight: 1,
  }

  const compactInfoRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: Math.round(height * 0.07),
  }

  const compactSeparatorStyle: CSSProperties = {
    display: "flex",
    fontSize: compactWeatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
    marginLeft: Math.round(width * 0.02),
    marginRight: Math.round(width * 0.02),
  }

  const compactTemperatureStyle: CSSProperties = {
    display: "flex",
    fontSize: compactTemperatureFontSize,
    fontWeight: 700,
    lineHeight: 1,
    color: accentColour,
  }

  const compactConditionStyle: CSSProperties = {
    display: "flex",
    fontSize: compactWeatherFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginLeft: Math.round(width * 0.02),
  }

  const largeDateStyle: CSSProperties = {
    ...dateStyle,
    marginTop: Math.round(height * 0.05),
  }

  const largeWeatherRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: Math.round(height * 0.06),
  }

  const largeTemperatureStyle: CSSProperties = {
    display: "flex",
    fontSize: largeTemperatureFontSize,
    fontWeight: 700,
    lineHeight: 1,
    color: accentColour,
  }

  const largeConditionStyle: CSSProperties = {
    display: "flex",
    fontSize: largeConditionFontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginLeft:
      hasTemperature && hasCondition
        ? temperatureToConditionGap
        : 0,
  }

  return (
    <div style={rootStyle}>
      <div style={timeStyle}>{time}</div>

      {isCompactPanel ? (
        <div style={compactInfoRowStyle}>
          <div style={compactDateStyle}>{date}</div>
          {hasWeather ? (
            <div style={compactSeparatorStyle}>·</div>
          ) : null}
          {hasTemperature ? (
            <div style={compactTemperatureStyle}>
              {temperatureText}
            </div>
          ) : null}
          {hasCondition ? (
            <div style={compactConditionStyle}>
              {conditionText}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={largeDateStyle}>{date}</div>
      )}

      {isCompactPanel || !hasWeather ? null : (
        <div style={largeWeatherRowStyle}>
          {hasTemperature ? (
            <div style={largeTemperatureStyle}>
              {temperatureText}
            </div>
          ) : null}
          {hasCondition ? (
            <div style={largeConditionStyle}>
              {conditionText}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
