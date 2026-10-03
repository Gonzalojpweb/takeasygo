/**
 * Grafo de transiciones de estado de orden — lado SaaS (admin / SyncLayer).
 *
 * Distinto de `@takeasygo/business` → `ORDER_TRANSITIONS`, que es el grafo del
 * POS y no incluye `awaiting_payment` (el POS nunca crea órdenes sin pagar).
 *
 * ⚠️ Toda clave es obligatoria. Si falta una, el guard de `status/route.ts`
 * recibía `undefined` y hacía `.includes()` sobre eso → TypeError → HTTP 500
 * para cualquier PATCH manual. Fue exactamente lo que pasó con
 * `awaiting_payment` (ausente hasta 2026-10): el admin no podía cancelar a
 * mano un pedido varado en "esperando pago".
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  // Nunca se cobró → única salida posible.
  awaiting_payment: ['cancelled'],
  pending: ['confirmed', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['en_ruta', 'delivered'],
  en_ruta: ['arrived'],
  arrived: ['delivered'],
  delivered: [],
  cancelled: [],
}

/** Destinos permitidos desde `from`. Nunca devuelve `undefined`. */
export function allowedTransitionsFrom(from: string): readonly string[] {
  return VALID_TRANSITIONS[from] ?? []
}
