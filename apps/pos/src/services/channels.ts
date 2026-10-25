import type { Order } from "@takeasygo/types"

// ============================================================================
// Canales de los pedidos externos (observación 24/10)
// ============================================================================
// El POS separa los pedidos que no se cargaron en el local en dos vistas:
//   · Pedidos App       — la App TakeasyGO (SaaS online). Es lo que llega hoy
//                         por el Sync con `source: "external"` y sin canal.
//   · Delivery externo  — apps de delivery integradas. Cada integración, al
//                         entrar, marca `channel` con su plataforma.
// Hoy no hay integraciones conectadas: la vista de delivery queda lista y
// vacía. Agregar una plataforma = sumarla a DELIVERY_PLATFORMS.
// ============================================================================

export const DELIVERY_PLATFORMS = [
  { id: "pedidosya", label: "PedidosYa" },
  { id: "rappi", label: "Rappi" },
  { id: "uber_eats", label: "Uber Eats" },
  { id: "didi_food", label: "DiDi Food" },
] as const

const DELIVERY_IDS = new Set<string>(DELIVERY_PLATFORMS.map((p) => p.id))

/** Pedido de una app de delivery integrada. */
export function isExternalDeliveryOrder(order: Pick<Order, "source" | "channel">): boolean {
  return order.source === "external" && Boolean(order.channel && DELIVERY_IDS.has(order.channel))
}

/** Pedido de la App TakeasyGO (sin canal o canal «takeasygo»). */
export function isAppOrder(order: Pick<Order, "source" | "channel">): boolean {
  return order.source === "external" && (!order.channel || order.channel === "takeasygo")
}
