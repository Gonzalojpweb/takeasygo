import { PosError } from './errors'
import type { PosRole } from './permissions'

// ============================================================================
// Quitar platos ya enviados a cocina — motivos (Fase C, 2026-10)
// ============================================================================
// Pedido 24/10: el mozo NO quita platos enviados; cajero, encargado y admin
// sí, con motivo (el cajero además con el PIN de un encargado). El motivo
// decide qué pasa con los insumos:
//   · no se preparó (error de carga, el cliente cambió, agotado) → los
//     insumos vuelven al stock (reversión de la venta).
//   · se preparó y se perdió (demora/reclamo, se cayó/rompió) → MERMA: los
//     insumos no vuelven, se registran como WasteRecorded.
// Cada anulación queda en Order.itemVoids (append-only) para reportes.
// ============================================================================

export const ITEM_VOID_REASONS = {
  load_error: { label: 'Error de carga', wasted: false },
  changed_mind: { label: 'El cliente cambió', wasted: false },
  out_of_stock: { label: 'Producto agotado', wasted: false },
  delay_complaint: { label: 'Demora o reclamo', wasted: true },
  dropped: { label: 'Se cayó / rompió', wasted: true },
} as const

export type ItemVoidReason = keyof typeof ITEM_VOID_REASONS

export function assertItemVoidReason(value: unknown): ItemVoidReason {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(ITEM_VOID_REASONS, value)) {
    throw PosError.validation(
      `Motivo requerido para quitar un plato ya enviado: ${Object.keys(ITEM_VOID_REASONS).join(', ')}`
    )
  }
  return value as ItemVoidReason
}

/** El mozo nunca quita platos enviados (ni con PIN): lo hace la caja. */
export function assertCanVoidSentItems(role: PosRole | null): void {
  if (role === 'waiter' || role === null) {
    throw PosError.forbidden('Solo la caja o un encargado pueden quitar platos ya enviados a cocina')
  }
}
