import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/services/cash.ts", "src/services/z-report.ts", "src/services/sync-cash.ts"],
    },
  },
})
