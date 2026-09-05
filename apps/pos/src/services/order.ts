import type { Order, OrderItem, OrderStatus } from "@takeasygo/types"
import { calculateOrderTotal, calculateItemTotal, validateOrderItems } from "@takeasygo/business/browser"
import { db } from "../db/dexie"
import { enqueue } from "./event-queue"
import { notifyStatusToSyncLayer } from "./sync-api"

// ============================================================================
// Transitions permitidas — selladas por Gemini
// ============================================================================

const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "preparing", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["en_ruta", "delivered", "cancelled"],
  en_ruta: ["arrived", "cancelled"],
  arrived: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  requires_manual_attention: ["confirmed", "preparing", "ready", "en_ruta", "arrived", "delivered", "cancelled"],
}

function validateOrderTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed = VALID_ORDER_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new Error(
      `[order] Invalid transition: ${from} → ${to}. Allowed: [${allowed.join(", ")}]`
    )
  }
}

// ============================================================================
// Mutaciones
// ============================================================================

export async function createOrder(
  tenantId: string,
  tableId: string,
  items: OrderItem[],
  notes?: string,
  serverId?: string,
  customerId?: string
): Promise<Order> {
  const validation = validateOrderItems(items)
  if (!validation.valid) {
    throw new Error(`[order] Invalid items: ${validation.errors.join("; ")}`)
  }

  const total = calculateOrderTotal(items)

  const order: Order = {
    id: crypto.randomUUID(),
    tenantId,
    source: "pos",
    status: "pending",
    tableId,
    customerId,
    items,
    total,
    menuVersion: 1,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await db.orders.add(order)

  await enqueue(tenantId, "order.created", {
    orderId: order.id,
    tableId,
    customerId,
    items,
    total,
    notes,
    serverId,
  })

  return order
}

export async function addItem(
  tenantId: string,
  orderId: string,
  item: OrderItem
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  if (!["pending", "confirmed"].includes(order.status)) {
    throw new Error(
      `[order] Cannot add item to order ${orderId} in status ${order.status}`
    )
  }

  const newItems = [...order.items, item]
  const total = calculateOrderTotal(newItems)

  await db.orders.update(orderId, {
    items: newItems,
    total,
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.updated", {
    orderId,
    action: "item_added",
    item,
    total,
  })
}

export async function removeItem(
  tenantId: string,
  orderId: string,
  productId: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  if (!["pending", "confirmed"].includes(order.status)) {
    throw new Error(
      `[order] Cannot remove item from order ${orderId} in status ${order.status}`
    )
  }

  const newItems = order.items.filter((i) => i.productId !== productId)
  if (newItems.length === order.items.length) {
    throw new Error(`[order] Product ${productId} not found in order ${orderId}`)
  }

  const total = calculateOrderTotal(newItems)

  await db.orders.update(orderId, {
    items: newItems,
    total,
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.updated", {
    orderId,
    action: "item_removed",
    productId,
    total,
  })
}

export async function updateItemQuantity(
  tenantId: string,
  orderId: string,
  productId: string,
  quantity: number
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  if (!["pending", "confirmed"].includes(order.status)) {
    throw new Error(
      `[order] Cannot modify items in order ${orderId} in status ${order.status}`
    )
  }

  if (quantity < 0) {
    throw new Error(`[order] Quantity cannot be negative`)
  }

  let newItems: OrderItem[]
  if (quantity === 0) {
    newItems = order.items.filter((i) => i.productId !== productId)
  } else {
    newItems = order.items.map((i) =>
      i.productId === productId ? { ...i, quantity, total: calculateItemTotal({ ...i, quantity }) } : i
    )
  }

  const total = calculateOrderTotal(newItems)

  await db.orders.update(orderId, {
    items: newItems,
    total,
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.updated", {
    orderId,
    action: "quantity_updated",
    productId,
    quantity,
    total,
  })
}

export async function confirmOrder(
  tenantId: string,
  orderId: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "confirmed")

  await db.orders.update(orderId, {
    status: "confirmed",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.confirmed", {
    orderId,
    tableId: order.tableId,
    items: order.items,
    total: order.total,
  })
}

export async function prepareOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "preparing")

  await db.orders.update(orderId, {
    status: "preparing",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.preparing", {
    orderId,
    tableId: order.tableId,
    source: order.source,
  })

  if (jwt) {
    notifyStatusToSyncLayer(orderId, "preparing", jwt).catch(() => {})
  }
}

export async function markReady(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "ready")

  await db.orders.update(orderId, {
    status: "ready",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.ready", {
    orderId,
    tableId: order.tableId,
    source: order.source,
  })

  if (jwt) {
    notifyStatusToSyncLayer(orderId, "ready", jwt).catch(() => {})
  }
}

export async function cancelOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "cancelled")

  await db.orders.update(orderId, {
    status: "cancelled",
    updatedAt: new Date(),
  })

  // Liberar mesa si estaba vinculada
  if (order.tableId) {
    const table = await db.diningTable.get(order.tableId)
    if (table && table.currentOrderId === orderId) {
      await db.diningTable.update(order.tableId, {
        status: "free",
        currentOrderId: undefined,
        serverId: undefined,
      })
    }
  }

  await enqueue(tenantId, "order.cancelled", {
    orderId,
    tableId: order.tableId,
    previousStatus: order.status,
  })

  if (jwt) {
    notifyStatusToSyncLayer(orderId, "cancelled", jwt).catch(() => {})
  }
}

export async function deliverOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "delivered")

  await db.orders.update(orderId, {
    status: "delivered",
    updatedAt: new Date(),
  })

  // Liberar mesa si estaba vinculada
  if (order.tableId) {
    const table = await db.diningTable.get(order.tableId)
    if (table && table.currentOrderId === orderId) {
      await db.diningTable.update(order.tableId, {
        status: "free",
        currentOrderId: undefined,
        serverId: undefined,
      })
    }
  }

  await enqueue(tenantId, "order.delivered", {
    orderId,
    tableId: order.tableId,
    total: order.total,
  })

  if (jwt) {
    notifyStatusToSyncLayer(orderId, "delivered", jwt).catch(() => {})
  }
}

export async function setEnRuta(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "en_ruta")

  await db.orders.update(orderId, {
    status: "en_ruta",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.en_ruta", {
    orderId,
    tableId: order.tableId,
    source: order.source,
  })

  if (jwt) {
    notifyStatusToSyncLayer(orderId, "en_ruta", jwt).catch(() => {})
  }
}

export async function setArrived(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[order] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[order] Tenant mismatch")

  validateOrderTransition(order.status, "arrived")

  await db.orders.update(orderId, {
    status: "arrived",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.arrived", {
    orderId,
    tableId: order.tableId,
    source: order.source,
  })

  if (jwt) {
    notifyStatusToSyncLayer(orderId, "arrived", jwt).catch(() => {})
  }
}

// ============================================================================
// Lecturas
// ============================================================================

export async function getOrder(
  tenantId: string,
  orderId: string
): Promise<Order | undefined> {
  const order = await db.orders.get(orderId)
  if (!order || order.tenantId !== tenantId) return undefined
  return order
}

export async function getOrdersByTable(
  tenantId: string,
  tableId: string
): Promise<Order[]> {
  return db.orders
    .where("tenantId")
    .equals(tenantId)
    .and((o) => o.tableId === tableId)
    .toArray()
}

export async function getActiveOrders(tenantId: string): Promise<Order[]> {
  return db.orders
    .where("tenantId")
    .equals(tenantId)
    .and((o) => !["delivered", "cancelled"].includes(o.status))
    .toArray()
}
