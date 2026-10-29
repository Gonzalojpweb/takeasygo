import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

// ============================================================================
// Ancho regulable del Context Panel (obs. UX 25/10)
// ============================================================================
// Como el explorador de VS Code: se arrastra el borde izquierdo del panel de
// detalle para ensancharlo o angostarlo.
//   · Doble clic: vuelve al ancho por defecto (el del CSS según la pantalla).
//   · Teclado: el borde es un separador enfocable; ← ensancha, → angosta
//     (Shift = pasos grandes), Inicio/Fin = mínimo/máximo.
//   · Se guarda por equipo (localStorage); sin storage, solo esta sesión.
//   · El workspace nunca queda con menos de WORKSPACE_MIN px.
//   · En celular no aplica (el panel es una hoja inferior).
// El ancho se aplica como --context-panel-width en .ros-app (la grilla lo usa).
// ============================================================================

const STORAGE_KEY = "takeasygo-pos-context-width"
export const PANEL_MIN = 280
const PANEL_MAX = 760
const WORKSPACE_MIN = 420
const STEP = 16

function readStored(): number | null {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(n) && n >= PANEL_MIN && n <= PANEL_MAX ? n : null
  } catch {
    return null
  }
}

function uiZoom(): number {
  const z = Number(getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom"))
  return Number.isFinite(z) && z > 0 ? z : 1
}

/** Máximo posible hoy: deja al menos WORKSPACE_MIN de workspace (px de layout). */
function maxWidth(): number {
  const app = document.querySelector<HTMLElement>(".ros-app")
  const nav = document.querySelector<HTMLElement>(".navigation")
  const appWidth = app ? app.getBoundingClientRect().width / uiZoom() : window.innerWidth
  const navWidth = nav ? nav.getBoundingClientRect().width / uiZoom() : 0
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(appWidth - navWidth - WORKSPACE_MIN)))
}

export function clampPanelWidth(w: number, max: number = PANEL_MAX): number {
  return Math.round(Math.min(Math.max(w, PANEL_MIN), Math.max(PANEL_MIN, max)))
}

/** Estado del ancho (null = el del CSS). Lo usa App para la grilla. */
export function useContextPanelWidth() {
  const [width, setWidthState] = useState<number | null>(readStored)
  const setWidth = useCallback((w: number | null) => {
    setWidthState(w)
    try {
      if (w === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(w))
    } catch { /* sin storage: solo esta sesión */ }
  }, [])

  // Si la ventana se achica, el panel no se come el workspace.
  useEffect(() => {
    if (width === null) return
    const onResize = () => {
      const max = maxWidth()
      if (width > max) setWidthState(max)
    }
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [width])

  return { width, setWidth }
}

interface PanelResizerProps {
  width: number | null
  onChange: (w: number | null) => void
}

export function PanelResizer({ width, onChange }: PanelResizerProps) {
  const dragging = useRef(false)
  const [active, setActive] = useState(false)

  const panelWidthNow = (handle: HTMLElement) => {
    const panel = handle.parentElement
    return panel ? panel.getBoundingClientRect().width / uiZoom() : (width ?? PANEL_MIN)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    setActive(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add("is-resizing-panel")
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const panel = e.currentTarget.parentElement
    if (!panel) return
    // Borde derecho del panel (fijo) menos el puntero = ancho visual.
    const right = panel.getBoundingClientRect().right
    onChange(clampPanelWidth((right - e.clientX) / uiZoom(), maxWidth()))
  }

  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    setActive(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ya liberado */ }
    document.body.classList.remove("is-resizing-panel")
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = width ?? panelWidthNow(e.currentTarget)
    const step = e.shiftKey ? STEP * 4 : STEP
    const max = maxWidth()
    let next: number | null = null
    if (e.key === "ArrowLeft") next = current + step
    else if (e.key === "ArrowRight") next = current - step
    else if (e.key === "Home") next = PANEL_MIN
    else if (e.key === "End") next = max
    else if (e.key === "Enter") { e.preventDefault(); onChange(null); return }
    if (next === null) return
    e.preventDefault()
    onChange(clampPanelWidth(next, max))
  }

  return (
    <div
      className={`panel-resizer${active ? " is-active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del panel de detalle (arrastrá, o usá las flechas; Enter o doble clic: ancho por defecto)"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Arrastrá para cambiar el ancho · doble clic: ancho por defecto"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => onChange(null)}
      onKeyDown={onKeyDown}
    />
  )
}
