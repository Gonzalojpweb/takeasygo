export interface WorkspaceOrderFilter {
  status?: string
  payment?: { method?: string }
  source?: string | null
}

// ============================================================================
// Ventas del POS fuera del panel de pedidos del SaaS (19/11/2026)
// ============================================================================
// Las ventas del POS (mesas, Mostrador —también para llevar— y deliverys de
// plataformas que se operan en el POS) se guardan en la misma colección que
// los pedidos online: reportes, inventario, club, facturación y Z dependen de
// eso. Pero se OPERAN en el POS: en el tablero «Pedidos» del SaaS solo
// aparecen los pedidos que entran por el SaaS (app, QR, delivery, retiro).
// En el historial se pueden incluir con un filtro y se muestran por canal
// («POS · Mesa 5», «POS · Mostrador») en lugar de «Consumidor final».
// ============================================================================

export const POS_ORDER_SOURCE = 'pos'

/** Filtro Mongo: pedidos del SaaS (todo lo que NO es una venta del POS). */
export const SAAS_ORDERS_ONLY = { source: { $ne: POS_ORDER_SOURCE } } as const

export function isPosOrder(order: { source?: string | null }): boolean {
  return order.source === POS_ORDER_SOURCE
}

const PLATFORM_LABEL: Record<string, string> = {
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
  uber_eats: 'Uber Eats',
  didi_food: 'DiDi Food',
}

/**
 * Canal de una venta del POS para mostrar en lugar del cliente:
 * «POS · Mesa 5», «POS · Mostrador», «POS · Rappi». null si no es del POS.
 */
export function posChannelLabel(order: {
  source?: string | null
  posTableId?: string | null
  posTableNumber?: number | null
  channel?: string | null
}): string | null {
  if (!isPosOrder(order)) return null
  if (order.channel && Object.prototype.hasOwnProperty.call(PLATFORM_LABEL, order.channel)) {
    return `POS · ${PLATFORM_LABEL[order.channel as keyof typeof PLATFORM_LABEL]}`
  }
  if (typeof order.posTableNumber === 'number') return `POS · Mesa ${order.posTableNumber}`
  if (order.posTableId) return 'POS · Mesa'
  return 'POS · Mostrador'
}

/**
 * Decide si un pedido debe mostrarse en el workspace del admin.
 *
 * Regla de negocio:
 * - Las ventas del POS nunca (se operan en el POS).
 * - Los pagos ONLINE (MercadoPago, Kripton, etc.) en `awaiting_payment` quedan
 *   OCULTOS en el workspace hasta que el webhook de la pasarela confirma el cobro
 *   (→ `confirmed`). No deben sonar ni aparecer hasta entonces.
 * - Las TRANSFERENCIAS en `awaiting_payment` SÍ se muestran: el cajero las ve en
 *   la columna "Transferencias" mientras espera el comprobante del cliente, y
 *   recibe la notificación al crearse el pedido.
 */
export function isOrderVisibleInWorkspace(order: WorkspaceOrderFilter): boolean {
  // Las ventas del POS se operan en el POS (ver arriba).
  if (isPosOrder(order)) return false
  if (order.status === 'awaiting_payment' && order.payment?.method !== 'transfer') {
    return false
  }
  return true
}

export function filterVisibleOrders<T extends { status?: string }>(orders: T[]): T[] {
  return orders.filter((o) => isOrderVisibleInWorkspace(o as WorkspaceOrderFilter))
}
