import { useCallback, useEffect, useState } from "react"

// ============================================================================
// Zoom de la interfaz del POS (observación UI/UX 24/10)
// ============================================================================
// Igual que el zoom del SaaS (useWorkspaceZoom), pero para TODO el POS: el
// operador achica o agranda la interfaz según la pantalla (tablet chica,
// monitor grande, vista cansada). Funciona como un responsive interno: la
// app se escala con `zoom` y su alto/ancho se compensan (pos.css, --ui-zoom)
// para que siga ocupando exactamente la pantalla, sin scroll.
// Se recuerda por dispositivo (localStorage); sin storage, queda en 100 %.
// ============================================================================

const ZOOM_KEY = "takeasygo-pos-ui-zoom"
export const UI_ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25] as const
const DEFAULT_ZOOM = 1

function readZoom(): number {
  try {
    const stored = Number(localStorage.getItem(ZOOM_KEY))
    return (UI_ZOOM_LEVELS as readonly number[]).includes(stored) ? stored : DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

function applyZoom(level: number) {
  document.documentElement.style.setProperty("--ui-zoom", String(level))
}

/** Aplica el zoom guardado lo antes posible (main.tsx), sin esperar a React. */
export function bootUiZoom(): void {
  applyZoom(readZoom())
}

export function useUiZoom() {
  const [zoom, setZoom] = useState<number>(readZoom)

  useEffect(() => {
    applyZoom(zoom)
    try { localStorage.setItem(ZOOM_KEY, String(zoom)) } catch { /* sin storage: solo esta sesión */ }
  }, [zoom])

  const step = useCallback((dir: 1 | -1) => {
    setZoom((prev) => {
      const levels = UI_ZOOM_LEVELS as readonly number[]
      const idx = Math.max(0, levels.indexOf(prev))
      return levels[Math.min(levels.length - 1, Math.max(0, idx + dir))]
    })
  }, [])

  return {
    zoom,
    percent: Math.round(zoom * 100),
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    reset: () => setZoom(DEFAULT_ZOOM),
    canZoomIn: zoom < UI_ZOOM_LEVELS[UI_ZOOM_LEVELS.length - 1],
    canZoomOut: zoom > UI_ZOOM_LEVELS[0],
  }
}
