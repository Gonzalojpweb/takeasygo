export interface WorkspaceOrderFilter {
  status?: string
  payment?: { method?: string }
}

/**
 * Decide si un pedido debe mostrarse en el workspace del admin.
 *
 * Regla de negocimiento:
 * - Los pagos ONLINE (MercadoPago, Kripton, etc.) en `awaiting_payment` quedan
 *   OCULTOS en el workspace hasta que el webhook de la pasarela confirma el cobro
 *   (→ `confirmed`). No deben sonar ni aparecer hasta entonces.
 * - Las TRANSFERENCIAS en `awaiting_payment` SÍ se muestran: el cajero las ve en
 *   la columna "Transferencias" mientras espera el comprobante del cliente, y
 *   recibe la notificación al crearse el pedido.
 */
export function isOrderVisibleInWorkspace(order: WorkspaceOrderFilter): boolean {
  if (order.status === 'awaiting_payment' && order.payment?.method !== 'transfer') {
    return false
  }
  return true
}

export function filterVisibleOrders<T extends { status?: string }>(orders: T[]): T[] {
  return orders.filter((o) => isOrderVisibleInWorkspace(o as WorkspaceOrderFilter))
}
