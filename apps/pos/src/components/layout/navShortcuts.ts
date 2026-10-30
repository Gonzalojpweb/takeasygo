import type { ContextId, RosContext } from "./contexts"

// ============================================================================
// Atajos de la navegación en celular y tablet (obs. UX 30/10)
// ============================================================================
// En pantallas chicas no entran los 10 contextos: se muestran los más usados
// como atajos y el resto queda en «Más» (menú lateral). El orden es de uso
// en el turno: operar → cobrar → mirar → administrar.
// ============================================================================

export const NAV_PRIORITY: readonly ContextId[] = [
  "counter",
  "waiter",
  "caja",
  "ventas",
  "resumen",
  "flota",
  "clientes",
  "facturacion",
  "config",
  "usuario",
]

/** Celular: 5 atajos + «Más» = 6 botones (con 7 no entran en 360 px). */
export const MOBILE_SHORTCUTS = 5
/** Tablet: 6 atajos + «Más» en la columna. */
export const TABLET_SHORTCUTS = 6

export interface NavSplit {
  shortcuts: RosContext[]
  /** Contextos que solo están en «Más». Vacío ⇒ no hace falta el botón. */
  overflow: RosContext[]
}

/**
 * Atajos por prioridad (en el orden de la navegación de escritorio, para que
 * los íconos no cambien de lugar entre tamaños) y el resto a «Más».
 */
export function splitNav(items: readonly RosContext[], max: number): NavSplit {
  if (items.length <= max + 1) return { shortcuts: [...items], overflow: [] }
  const rank = (id: ContextId) => {
    const i = NAV_PRIORITY.indexOf(id)
    return i === -1 ? NAV_PRIORITY.length : i
  }
  const keep = new Set([...items].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, max).map((c) => c.id))
  return {
    shortcuts: items.filter((c) => keep.has(c.id)),
    overflow: items.filter((c) => !keep.has(c.id)),
  }
}
