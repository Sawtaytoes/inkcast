/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from "react"
import type { PanelViewProps } from "./viewProps.ts"
import {
  buildPanelRootStyle,
  fitText,
  getAccentColour,
  READABLE_FONT_FLOOR_PX,
} from "./viewStyles.ts"

/**
 * A clock view that surfaces the day's upcoming calendar events, so an
 * imminent appointment shows itself on the panel alongside the time, date, and
 * weather. It builds on `ClockWeatherView`: the big time is the anchor, then
 * date + weather, then an agenda block. When there are no events the view
 * renders *identically* to `ClockWeatherView` — time + date (+ weather) with no
 * empty "Today" heading — so a device parked on this view on a free day just
 * looks like the weather clock, and it is safe as an always-available option.
 *
 * The compact pHAT (≤200px tall) is switched to this view *because* one event
 * is imminent, so it foregrounds a single event line under a compact date/temp
 * row. The large Impression gives the date and weather their own rows, then a
 * "Today" heading and up to a handful of event rows. Every string
 * (time, date, weather, and each event's `timeText`) arrives pre-formatted so
 * the view stays a pure function of its props; all text is bold to survive
 * 1-bit dithering. Inline styles + flexbox only (Satori-safe).
 */
export type ClockAgendaEvent = {
  /** Pre-formatted per panel size, e.g. "2:30p" / "2:30 PM" / "All day". */
  timeText: string
  summary: string
}

export type ClockAgendaViewProps = PanelViewProps & {
  time: string
  date: string
  temperatureText?: string
  conditionText?: string
  /** Upcoming events, already sorted and sliced to the panel's budget. */
  events: readonly ClockAgendaEvent[]
}

const COMPACT_PANEL_MAX_HEIGHT = 200

export const ClockAgendaView = ({
  width,
  height,
  colourMode,
  time,
  date,
  temperatureText,
  conditionText,
  events,
}: ClockAgendaViewProps) => {
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
  const hasEvents = events.length > 0

  const horizontalPadding = Math.round(width * 0.04)
  const availableWidth = width - horizontalPadding * 2
  const readableFloor = READABLE_FONT_FLOOR_PX[colourMode]

  // With an event present the time cedes height to the agenda; without one the
  // proportions match ClockWeatherView.
  const fittedTime = fitText({
    baseFontSize: Math.round(
      height * (hasEvents ? 0.3 : hasWeather ? 0.36 : 0.42),
    ),
    minimumFontSize: readableFloor,
    availableWidth,
    text: time,
  })

  const compactInfoText = [
    date,
    temperatureText ?? "",
    conditionText ?? "",
  ].join(" ")
  const fittedCompactInfo = fitText({
    baseFontSize: Math.round(height * 0.12),
    minimumFontSize: readableFloor,
    availableWidth,
    text: compactInfoText,
  })
  const compactInfoFontSize = fittedCompactInfo.fontSize
  const compactTemperatureFontSize = Math.round(
    compactInfoFontSize * 1.25,
  )

  const dateFontSize = Math.round(height * 0.13)
  const largeTemperatureFontSize = Math.round(height * 0.14)
  const largeConditionFontSize = Math.round(height * 0.075)
  const headingFontSize = Math.round(height * 0.055)
  const eventTimeFontSize = Math.round(height * 0.07)
  const eventSummaryFontSize = Math.round(height * 0.07)

  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
  }

  const timeStyle: CSSProperties = {
    display: "flex",
    fontSize: fittedTime.fontSize,
    letterSpacing: fittedTime.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    color: accentColour,
  }

  const compactInfoRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: Math.round(height * 0.05),
  }

  const compactDateStyle: CSSProperties = {
    display: "flex",
    fontSize: compactInfoFontSize,
    letterSpacing: fittedCompactInfo.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
  }

  const compactSeparatorStyle: CSSProperties = {
    display: "flex",
    fontSize: compactInfoFontSize,
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
    fontSize: compactInfoFontSize,
    letterSpacing: fittedCompactInfo.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginLeft: Math.round(width * 0.02),
  }

  const largeDateStyle: CSSProperties = {
    display: "flex",
    fontSize: dateFontSize,
    fontWeight: 700,
    lineHeight: 1,
    marginTop: Math.round(height * 0.045),
  }

  const largeWeatherRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: Math.round(height * 0.05),
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
    marginLeft: Math.round(width * 0.025),
  }

  // The compact single-event line packs the imminent event's time + summary.
  const compactEventText = hasEvents
    ? `${events[0].timeText} ${events[0].summary}`
    : ""
  const fittedCompactEvent = fitText({
    baseFontSize: Math.round(height * 0.13),
    minimumFontSize: readableFloor,
    availableWidth,
    text: compactEventText,
  })

  const compactEventStyle: CSSProperties = {
    display: "flex",
    fontSize: fittedCompactEvent.fontSize,
    letterSpacing: fittedCompactEvent.letterSpacing,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    marginTop: Math.round(height * 0.06),
    color: accentColour,
  }

  const agendaBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: Math.round(height * 0.05),
  }

  const headingStyle: CSSProperties = {
    display: "flex",
    fontSize: headingFontSize,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: accentColour,
    marginBottom: Math.round(height * 0.02),
  }

  const eventRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Math.round(height * 0.015),
  }

  const eventTimeStyle: CSSProperties = {
    display: "flex",
    fontSize: eventTimeFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    color: accentColour,
    minWidth: Math.round(width * 0.16),
  }

  const eventSummaryStyle: CSSProperties = {
    display: "flex",
    fontSize: eventSummaryFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    marginLeft: Math.round(width * 0.02),
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

      {!hasEvents ? null : isCompactPanel ? (
        <div style={compactEventStyle}>
          {compactEventText}
        </div>
      ) : (
        <div style={agendaBlockStyle}>
          <div style={headingStyle}>Today</div>
          {events.map((event) => (
            <div
              key={`${event.timeText}-${event.summary}`}
              style={eventRowStyle}
            >
              <div style={eventTimeStyle}>
                {event.timeText}
              </div>
              <div style={eventSummaryStyle}>
                {event.summary}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
