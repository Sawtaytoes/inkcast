import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/render-output/**",
    ],
    projects: [
      "packages/core/vitest.config.ts",
      "packages/render/vitest.config.ts",
    ],
  },
})
