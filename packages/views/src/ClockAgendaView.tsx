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
 * The compact pHAT (≤200px tall) is switched to this view *because* an event
 * is imminent, so it shrinks the time to move it up and stacks a few tight
 * event rows under a compact date/temp row. The large Impression gives the
 * date and weather their own rows, then a
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
  // proportions match ClockWeatherView. On the compact pHAT the time shrinks
  // further still when events are present, moving it up to free vertical room
  // for a stack of event rows.
  const fittedTime = fitText({
    baseFontSize: Math.round(
      height *
        (hasEvents
          ? isCompactPanel
            ? 0.2
            : 0.3
          : hasWeather
            ? 0.36
            : 0.42),
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
  // Compact rows sit at the readable floor so as many fit as legibility allows,
  // with the time nudged up so it reads as the row's anchor.
  const compactEventTimeFontSize = Math.round(
    readableFloor * 1.15,
  )
  const compactEventSummaryFontSize = readableFloor

  // Pin the time to the top once a compact panel is carrying events: the agenda
  // stack can be taller than the short pHAT, and a centred column overflows
  // *both* edges — clipping the time (the anchor) off the top. Anchoring to the
  // top keeps the time fully on-panel and lets any overflow fall off the bottom
  // (the last, least-imminent event) instead. With no events the view still
  // centres, so it reads identically to ClockWeatherView on a free day.
  const pinToTop = isCompactPanel && hasEvents
  const rootStyle: CSSProperties = {
    ...buildPanelRootStyle({ width, height }),
    alignItems: "center",
    justifyContent: pinToTop ? "flex-start" : "center",
    paddingTop: pinToTop ? Math.round(height * 0.04) : 0,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
  }

  // Event summaries never wrap (one row each), so a long title would otherwise
  // run off the right edge. Cap each summary to the row's remaining width and
  // ellipsis-truncate — both render engines honour this with nowrap + hidden.
  const compactSummaryMaxWidth =
    availableWidth -
    Math.round(width * 0.2) -
    Math.round(width * 0.02)
  const largeSummaryMaxWidth =
    availableWidth -
    Math.round(width * 0.16) -
    Math.round(width * 0.02)

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

  // The compact pHAT stacks its imminent events as tight time + summary rows,
  // sized so a handful fit above the fold on a 122px panel.
  const compactAgendaBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: Math.round(height * 0.03),
  }

  const compactEventRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Math.round(height * 0.01),
  }

  const compactEventTimeStyle: CSSProperties = {
    display: "flex",
    fontSize: compactEventTimeFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    color: accentColour,
    minWidth: Math.round(width * 0.2),
  }

  const compactEventSummaryStyle: CSSProperties = {
    display: "flex",
    fontSize: compactEventSummaryFontSize,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: compactSummaryMaxWidth,
    marginLeft: Math.round(width * 0.02),
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: largeSummaryMaxWidth,
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
        <div style={compactAgendaBlockStyle}>
          {events.map((event) => (
            <div
              key={`${event.timeText}-${event.summary}`}
              style={compactEventRowStyle}
            >
              <div style={compactEventTimeStyle}>
                {event.timeText}
              </div>
              <div style={compactEventSummaryStyle}>
                {event.summary}
              </div>
            </div>
          ))}
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
