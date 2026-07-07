import { queue } from "../state.ts"

const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

/**
 * The play queue — read-only for v1 (tap-to-jump is a stretch goal). The
 * shared parser caps the list at 50 items, so plain scrolling is fine
 * without virtualization at kiosk sizes.
 */
export const Queue = () => {
  const data = queue.value
  if (!data || data.items.length === 0) {
    return (
      <div class="idle">
        <div class="idle-title">Queue is empty</div>
      </div>
    )
  }

  return (
    <ul class="queue">
      {data.items.map((item, index) => (
        <li
          key={`${index}-${item.title}`}
          class={item.isCurrent ? "current" : ""}
        >
          {item.artworkPath ? (
            <img
              class="queue-art"
              src={item.artworkPath}
              alt=""
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div class="queue-art placeholder">♪</div>
          )}
          <div class="queue-track">
            <div class="queue-title">{item.title}</div>
            <div class="queue-artist">{item.artist}</div>
          </div>
          {item.durationSeconds !== undefined ? (
            <span class="queue-duration">
              {formatTime(item.durationSeconds)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
