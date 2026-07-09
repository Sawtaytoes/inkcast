import { nowMs, weather } from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
} from "../time.ts"

/**
 * Weather-forward view: the current temperature + condition are the anchor,
 * with a smaller clock + date beneath. Distinct from Ambient (where the clock
 * is the anchor and weather is a footnote). Weather is retained MQTT pushed by
 * Home Assistant, so it survives reconnects and appears the moment HA
 * publishes; until then a placeholder line shows.
 */
export const Weather = () => {
  const data = weather.value

  return (
    <div class="weather">
      {data ? (
        <div class="weather-main">
          <div class="weather-temp">
            {data.temperatureText}
          </div>
          <div class="weather-condition">
            {data.conditionText}
          </div>
        </div>
      ) : (
        <div class="weather-empty">Weather unavailable</div>
      )}
      <div class="weather-clock">
        <span class="weather-time">
          {formatClockTime(nowMs.value)}
        </span>
        <span class="weather-date">
          {formatClockDate(nowMs.value)}
        </span>
      </div>
    </div>
  )
}
