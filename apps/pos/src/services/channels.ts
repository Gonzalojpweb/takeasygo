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

// ============================================================================
// Canal de una VENTA (contexto Ventas, obs. 24/10)
// ============================================================================
// Cada venta dice de dónde vino: Salón (mesa), Mostrador (venta rápida sin
// mesa), App TakeasyGO o Delivery externo. Para la App también el modo
// (retiro, envío, en el local).

export type SaleChannel = "salon" | "mostrador" | "app" | "delivery"

export const SALE_CHANNEL_LABEL: Record<SaleChannel, string> = {
  salon: "Salón",
  mostrador: "Mostrador",
  app: "App TakeasyGO",
  delivery: "Delivery externo",
}

export function saleChannelOf(order: Pick<Order, "source" | "channel" | "tableId">): SaleChannel {
  if (isExternalDeliveryOrder(order)) return "delivery"
  if (order.source === "external" || order.source === "takeasygo") return "app"
  return order.tableId ? "salon" : "mostrador"
}

const ORDER_MODE_LABEL: Record<string, string> = {
  "dine-in": "En el local",
  takeaway: "Para retirar",
  delivery: "Envío a domicilio",
  business: "Empresas",
}

export function orderModeLabel(mode: string | undefined): string | null {
  return mode ? ORDER_MODE_LABEL[mode] ?? mode : null
}

export function deliveryPlatformLabel(channel: string | undefined): string | null {
  return DELIVERY_PLATFORMS.find((p) => p.id === channel)?.label ?? null
}
