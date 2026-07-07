import preact from "@preact/preset-vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [preact()],
  build: {
    // The CastKit server provides the page shell (with the state snapshot
    // inlined), so the build has no index.html — just the module entry.
    // Fixed asset names: the shell references them directly (no manifest
    // indirection); the HA Reload button is the cache-buster.
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "assets/slatecast.js",
        chunkFileNames: "assets/slatecast-[name].js",
        assetFileNames: "assets/slatecast[extname]",
      },
    },
    // WPE WebKit (round-panel Pi Zero 2 W) is the oldest engine served.
    target: "es2020",
  },
})
