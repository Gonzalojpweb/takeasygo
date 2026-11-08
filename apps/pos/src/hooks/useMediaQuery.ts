import { useEffect, useState } from "react"

/** true mientras la media query coincide (se actualiza al rotar o redimensionar). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches)

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

// ============================================================================
// Ancho real del POS (auditoría responsive 08/11)
// ============================================================================
// El CSS del shell usa @container app (…) sobre .ros-frame, que lleva el zoom
// de la interfaz: mide pantalla ÷ zoom. matchMedia mide la pantalla física, así
// que con zoom 125 % en una tablet de 1180 creía tener 1180 px y mostraba el
// menú de escritorio en 944 px reales. Este hook usa la misma cuenta que el CSS.
// ============================================================================

export const UI_ZOOM_EVENT = "pos-ui-zoom-change"

function currentZoom(): number {
  if (typeof document === "undefined") return 1
  const z = Number(getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom"))
  return Number.isFinite(z) && z > 0 ? z : 1
}

/** Ancho disponible para el POS en px de layout (pantalla ÷ zoom). */
export function layoutWidth(): number {
  if (typeof window === "undefined") return 1920
  return window.innerWidth / currentZoom()
}

/** true mientras el ancho real del POS es ≤ `px` (igual que @container app (max-width: px)). */
export function useLayoutMaxWidth(px: number): boolean {
  const [matches, setMatches] = useState(() => layoutWidth() <= px)

  useEffect(() => {
    // El valor inicial sale del useState; acá solo se escuchan los cambios.
    const update = () => setMatches(layoutWidth() <= px)
    window.addEventListener("resize", update)
    window.addEventListener(UI_ZOOM_EVENT, update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener(UI_ZOOM_EVENT, update)
    }
  }, [px])

  return matches
}
