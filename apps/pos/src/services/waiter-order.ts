import type { Order, OrderItem } from "@takeasygo/types"

// ============================================================================
// Waiter — flujo real "Enviar a cocina" (P0-3)
// ============================================================================
// Antes el Waiter solo mostraba un toast: no creaba orden ni comanda.
// Este orquestador replica el flujo del Counter:
//   1. createOrder (server + Dexie)
//   2. occupy/bind de la mesa en server si está libre o sin orden vigente
//      (misma guarda que CounterDashboard.handlePay)
//   3. confirmOrder (transición → confirmed)
//   4. confirmAndSendToKitchen (comanda local; exige status confirmed)
// Dependencias inyectables: la línea de negocio no toca React ni Dexie.

export interface WaiterTableSnapshot {
  status: string
  currentOrderId?: string | undefined
}

export interface WaiterKitchenDeps {
  createOrder(tableId: string, items: OrderItem[]): Promise<Order>
  readTable(tableId: string): Promise<WaiterTableSnapshot | undefined>
  occupyTable(tableId: string, serverId: string, orderId: string): Promise<void>
  bindTableOrder(tableId: string, serverId: string, orderId: string): Promise<void>
  confirmOrder(orderId: string): Promise<void>
  sendToKitchen(orderId: string): Promise<unknown>
}

export interface SendWaiterOrderInput {
  tableId: string
  items: OrderItem[]
  /** Quién ocupa la mesa: "waiter" (default) o "counter" (cajero en Salón). */
  serverId?: string
}

/** Identificación del servidor en la mesa (equivalente a "counter"). */
export const WAITER_SERVER_ID = "waiter"

export async function sendWaiterOrderToKitchen(
  deps: WaiterKitchenDeps,
  input: SendWaiterOrderInput
): Promise<Order> {
  const { tableId, items } = input
  const serverId = input.serverId ?? WAITER_SERVER_ID
  if (!tableId) throw new Error("[waiter] tableId is required")
  if (items.length === 0) throw new Error("[waiter] items are required")

  const order = await deps.createOrder(tableId, items)

  const fresh = await deps.readTable(tableId)
  if (fresh?.status === "free") {
    await deps.occupyTable(tableId, serverId, order.id)
  } else if (fresh?.status === "occupied" && !fresh.currentOrderId) {
    await deps.bindTableOrder(tableId, serverId, order.id)
  }

  await deps.confirmOrder(order.id)
  await deps.sendToKitchen(order.id)

  return order
}
