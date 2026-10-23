import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import path from "node:path"
import { execSync } from "node:child_process"

// ── Sello de versión ─────────────────────────────────────────────────────────
// Cada build lleva su versión (commit) adentro del bundle (__POS_BUILD__) y en
// /version.json (nunca cacheado). Al abrir, la app compara las dos: si no
// coinciden, la página vino de una copia vieja y se limpia sola
// (src/services/app-update.ts). Además se muestra en pantalla.
function resolveCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 8)
  try {
    return execSync("git rev-parse --short=8 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return "local"
  }
}
const BUILD = { version: resolveCommit(), builtAt: new Date().toISOString() }

function versionFile(): Plugin {
  return {
    name: "pos-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify(BUILD) })
    },
  }
}

export default defineConfig({
  define: {
    __POS_BUILD__: JSON.stringify(BUILD),
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: "autoUpdate",
      // El registro y la política de recarga viven en src/services/app-update.ts
      // (el registerSW inyectado activaba la versión nueva sin recargar la
      // página: convivían dos versiones del POS).
      injectRegister: false,
      includeAssets: ["favicon.svg", "manifest.json"],
      manifest: {
        name: "TakeasyGO POS",
        short_name: "POS",
        description: "Sistema operativo para restaurantes — Hub-and-Spoke",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // index.html NO se precachea: servirlo cache-first mostraba la versión
        // vieja en cada apertura. Solo assets con hash (inmutables).
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Navegaciones: siempre la red (versión publicada); la copia
            // guardada solo se usa sin conexión o si la red no responde en 4 s.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pos-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 5 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@takeasygo/types": path.resolve(
        __dirname,
        "../../packages/types/src"
      ),
      "@takeasygo/db": path.resolve(__dirname, "../../packages/db/src"),
      "@takeasygo/business": path.resolve(
        __dirname,
        "../../packages/business/src"
      ),
      "@takeasygo/business/browser": path.resolve(
        __dirname,
        "../../packages/business/src/browser.ts"
      ),
      "@takeasygo/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
})
