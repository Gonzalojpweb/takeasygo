// ============================================================================
// printTiming — Lógica pura de cuándo un pedido programado puede imprimirse
// ============================================================================
// Un pedido programado para las 20:00 NO debe entregar su print job al agente
// antes de T-lead (default 30 min → 19:30). Los pedidos inmediatos imprimen
// siempre.
//
// Esta función es el truth source compartido por:
//   - GET /api/[tenant]/print-jobs (gate server-side, poll del agente cada 5s)
//   - el board admin (serializa printNotBefore por orden para el detector)
// ============================================================================

export const DEFAULT_PRINT_BEFORE_PICKUP_MINUTES = 30

export interface PrintTimingOrder {
  orderTiming?: string | null
  scheduledPickupAt?: Date | string | null
}

/**
 * Minutos de anticipación con los que una sede imprime el pedido programado.
 * Cualquier valor no-numérico o negativo cae al default.
 */
export function resolvePrintLeadMinutes(config?: {
  printBeforePickupMinutes?: number | null
} | null): number {
  const lead = config?.printBeforePickupMinutes
  if (typeof lead !== 'number' || !Number.isFinite(lead) || lead < 0) {
    return DEFAULT_PRINT_BEFORE_PICKUP_MINUTES
  }
  return lead
}

/**
 * Momento en el que el pedido pasa a ser imprimible.
 * - Inmediato (o sin hora programada): null → imprimible ya.
 * - Programado: scheduledPickupAt − lead.
 */
export function getPrintNotBefore(
  order: PrintTimingOrder,
  leadMinutes: number = DEFAULT_PRINT_BEFORE_PICKUP_MINUTES
): Date | null {
  if (order.orderTiming !== 'scheduled' || !order.scheduledPickupAt) return null
  const pickup = new Date(order.scheduledPickupAt)
  if (Number.isNaN(pickup.getTime())) return null
  return new Date(pickup.getTime() - leadMinutes * 60_000)
}

/**
 * ¿Es momento de entregar el print job al agente?
 * Inmediato → sí. Programado → solo si ya pasó el T-lead (o si la hora
 * programada ya venció, caso borde de confirmación tardía).
 */
export function isPrintDue(order: PrintTimingOrder, now: Date, leadMinutes: number): boolean {
  const notBefore = getPrintNotBefore(order, leadMinutes)
  if (notBefore === null) return true
  return notBefore.getTime() <= now.getTime()
}
