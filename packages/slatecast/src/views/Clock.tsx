import { clockConfig, nowMs } from "../state.ts"
import {
  formatClockDate,
  formatClockTime,
} from "../time.ts"

/**
 * Plain clock: big time + date, no weather — the browser-native counterpart to
 * the e-ink "Clock" view (colour, no dithering). Client-side off the shared
 * 1 Hz tick in the device-local timezone. Reuses the `.ambient` layout, which
 * is already a centered time-over-date stack.
 */
export const Clock = () => (
  <div class="ambient">
    <div class="ambient-time">
      {formatClockTime(nowMs.value, clockConfig.value)}
    </div>
    <div class="ambient-date">
      {formatClockDate(nowMs.value, clockConfig.value)}
    </div>
  </div>
)
