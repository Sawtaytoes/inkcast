import { nowMs, weather } from "../state.ts"

/**
 * Ambient view: a big clock with today's date, plus the current weather
 * (temperature + condition) when Home Assistant has pushed it to
 * `<base>/<id>/weather/set`. The clock is client-side off the shared 1 Hz
 * tick (device-local timezone — the kiosk Pi's TZ); weather is retained
 * MQTT, so it survives reconnects and appears the moment HA publishes.
 */
export const Ambient = () => {
  const date = new Date(nowMs.value)
  const timeText = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  const dateText = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  const data = weather.value

  return (
    <div class="ambient">
      <div class="ambient-time">{timeText}</div>
      <div class="ambient-date">{dateText}</div>
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
