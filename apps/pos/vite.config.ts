import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import path from "node:path"

export default defineConfig({
  plugins: [
    react(),
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
