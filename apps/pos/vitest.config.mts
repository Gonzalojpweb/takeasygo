import { defineConfig } from "vitest/config"
import path from "node:path"

// Mismo criterio que vite.config.ts: los paquetes del monorepo se leen desde
// el código fuente (no desde dist/, que no se versiona y puede estar viejo).
const pkg = (p: string) => path.resolve(__dirname, "../../packages", p)

export default defineConfig({
  resolve: {
    alias: [
      { find: "@takeasygo/business/browser", replacement: pkg("business/src/browser.ts") },
      { find: "@takeasygo/business", replacement: pkg("business/src") },
      { find: "@takeasygo/types", replacement: pkg("types/src") },
    ],
  },
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
