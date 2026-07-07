import { render } from "preact"
import {
  activeView,
  connect,
  device,
  settings,
} from "./state.ts"
import { Ambient } from "./views/Ambient.tsx"
import { NowPlaying } from "./views/NowPlaying.tsx"
import { Queue } from "./views/Queue.tsx"
import "./styles.css"

/**
 * Root: applies the dynamic settings (rotation as a CSS transform so an HA
 * automation can flip a motorized mount live; theme), the circle-safe inset
 * for round panels, and swaps views on the WebSocket `view` message — no
 * reloads, ever.
 */
const App = () => {
  const profile = device.value
  const { orientation, theme } = settings.value
  const isSideways =
    orientation === 90 || orientation === 270

  if (!profile) {
    return (
      <div class="idle">
        <div class="idle-title">Unknown device</div>
      </div>
    )
  }

  return (
    <div
      class={`stage shape-${profile.shape}${profile.hasTouch ? "" : " touchless"}`}
      data-theme={theme.toLowerCase()}
      style={{
        transform:
          orientation === 0
            ? undefined
            : `rotate(${orientation}deg)`,
        width: isSideways ? "100vh" : "100vw",
        height: isSideways ? "100vw" : "100vh",
      }}
    >
      {activeView.value === "queue" ? (
        <Queue />
      ) : activeView.value === "ambient" ? (
        <Ambient />
      ) : (
        <NowPlaying />
      )}
    </div>
  )
}

render(<App />, document.getElementById("app")!)
connect()
