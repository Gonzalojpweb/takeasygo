import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { execSync } from "node:child_process"

// ============================================================================
// Reproductor de pantallas (display.takeasygo.com) — misma base que apps/pos
// ============================================================================
// · Sello de versión (__DISPLAY_BUILD__ en el bundle + /version.json sin caché)
//   para detectar copias viejas, igual que el POS.
// · Service worker propio (injectManifest, src/sw/sw.ts), SIN librerías extra:
//   app shell para abrir sin internet + respuestas Range (206) para la
//   opción A del diagnóstico.
// · TypeScript sin React: el reproductor corre en TV Box de 1–2 GB.
// ============================================================================

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
    name: "display-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify(BUILD) })
    },
  }
}

export default defineConfig({
  define: {
    __DISPLAY_BUILD__: JSON.stringify(BUILD),
  },
  plugins: [
    versionFile(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "TakeasyGO Pantallas",
        short_name: "Pantallas",
        description: "Reproductor de contenido para tótems, TV y tablets",
        theme_color: "#000000",
        background_color: "#000000",
        display: "fullscreen",
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      injectManifest: {
        // index.html sí se guarda: la pantalla tiene que abrir sin internet.
        // El SW lo sirve NetworkFirst (versión publicada con red; copia sin red).
        globPatterns: ["**/*.{js,css,html,svg}"],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5175,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2019",
  },
})
