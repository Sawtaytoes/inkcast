import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    name: "core",
    include: ["src/**/*.test.ts"],
  },
})
