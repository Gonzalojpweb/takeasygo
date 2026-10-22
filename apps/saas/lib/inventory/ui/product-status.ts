// ============================================================================
// Inventario V3 — estado de un producto para la UI (puro)
// ============================================================================
// Distingue SIEMPRE tres cosas que la pantalla clásica mezclaba:
//   · falta de datos (nunca se contó)       → "Sin conteo inicial"
//   · stock agotado o negativo (sí hay dato) → "Sin stock" / "Revisar"
//   · error de carga                         → lo maneja el estado de la vista
// No decide nada de inventario: traduce lo que ya calculó el servidor
// (anchored, flags, stockAlert, confidence).
// ============================================================================

export type ProductState = 'no_data' | 'negative' | 'out' | 'low' | 'uncertain' | 'ok'

export interface ProductStateInput {
  belief: { anchored: boolean; mu: number; flags: string[] }
  stockAlert: 'out' | 'low' | null
  confidence: string
}

export interface ProductStateView {
  state: ProductState
  label: string
  /** Para el ícono/color; el texto `label` siempre acompaña (nunca solo color). */
  tone: 'neutral' | 'danger' | 'warning' | 'ok'
  /** Orden en la lista "Atención primero". */
  rank: number
}

export function productState(p: ProductStateInput): ProductStateView {
  if (!p.belief.anchored) return { state: 'no_data', label: 'Sin conteo inicial', tone: 'neutral', rank: 3 }
  if (p.belief.mu < 0 || p.belief.flags.includes('negative_estimate')) {
    return { state: 'negative', label: 'Revisar: se vendió más de lo registrado', tone: 'danger', rank: 0 }
  }
  if (p.stockAlert === 'out') return { state: 'out', label: 'Sin stock', tone: 'danger', rank: 1 }
  if (p.stockAlert === 'low') return { state: 'low', label: 'Por acabarse', tone: 'warning', rank: 2 }
  if (p.confidence === 'low' || p.confidence === 'critical') return { state: 'uncertain', label: 'Conviene contar', tone: 'warning', rank: 4 }
  return { state: 'ok', label: 'Disponible', tone: 'ok', rank: 5 }
}

/** ¿Necesita atención? (filtro "Atención" de Productos) */
export function needsAttention(v: ProductStateView): boolean {
  return v.state !== 'ok'
}
