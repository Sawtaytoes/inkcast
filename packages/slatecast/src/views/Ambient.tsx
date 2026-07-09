import { clockConfig, nowMs, weather } from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
} from "../time.ts"

/**
 * Ambient view: a big clock with today's date, plus the current weather
 * (temperature + condition) when Home Assistant has pushed it to
 * `<base>/<id>/weather/set`. The clock is client-side off the shared 1 Hz
 * tick, formatted with the server-stamped global clock config; weather is
 * retained MQTT, so it survives reconnects and appears the moment HA publishes.
 */
export const Ambient = () => {
  const data = weather.value

  return (
    <div class="ambient">
      <div class="ambient-time">
        {formatClockTime(nowMs.value, clockConfig.value)}
      </div>
      <div class="ambient-date">
        {formatClockDate(nowMs.value, clockConfig.value)}
      </div>
      {data ? (
        <div class="ambient-weather">
          <span class="ambient-temp">
            {data.temperatureText}
          </span>
          <span class="ambient-condition">
            {data.conditionText}
          </span>
        </div>
      ) : null}
    </div>
  )
}
