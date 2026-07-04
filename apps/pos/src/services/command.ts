import type { KitchenCommand, KitchenCommandItem, Order } from "@takeasygo/types"
import { db } from "../db/dexie"
import { enqueue } from "./event-queue"

// ============================================================================
// Helpers
// ============================================================================

function orderToKitchenCommand(order: Order): KitchenCommand {
  const items: KitchenCommandItem[] = order.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    modifiers: item.modifiers?.map((m) => `${m.name}: +$${m.price}`),
    notes: item.notes,
    category: "general",
  }))

  return {
    id: order.id,
    tenantId: order.tenantId,
    orderId: order.id,
    tableNumber: 0,
    items,
    status: "pending",
    notes: order.notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// ============================================================================
// Mutaciones
// ============================================================================

export async function confirmAndSendToKitchen(
  tenantId: string,
  orderId: string
): Promise<KitchenCommand> {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error(`[command] Order ${orderId} not found`)
  if (order.tenantId !== tenantId) throw new Error("[command] Tenant mismatch")
  if (order.status !== "confirmed") {
    throw new Error(`[command] Order ${orderId} must be confirmed first, got ${order.status}`)
  }

  const table = order.tableId ? await db.diningTable.get(order.tableId) : undefined

  const command: KitchenCommand = {
    ...orderToKitchenCommand(order),
    tableNumber: table?.number ?? 0,
  }

  await db.commands.add(command)

  await db.orders.update(orderId, { updatedAt: new Date() })

  return command
}

export async function startPreparing(
  tenantId: string,
  orderId: string
): Promise<void> {
  const command = await db.commands.get(orderId)
  if (!command) throw new Error(`[command] Command for order ${orderId} not found`)
  if (command.tenantId !== tenantId) throw new Error("[command] Tenant mismatch")
  if (command.status !== "pending") {
    throw new Error(`[command] Invalid transition: ${command.status} → preparing`)
  }

  await db.commands.update(orderId, {
    status: "preparing",
    startedAt: new Date(),
    updatedAt: new Date(),
  })

  await db.orders.update(orderId, {
    status: "preparing",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.preparing", {
    orderId,
    tableNumber: command.tableNumber,
    startedAt: new Date().toISOString(),
  })
}

export async function markReady(
  tenantId: string,
  orderId: string
): Promise<void> {
  const command = await db.commands.get(orderId)
  if (!command) throw new Error(`[command] Command for order ${orderId} not found`)
  if (command.tenantId !== tenantId) throw new Error("[command] Tenant mismatch")
  if (command.status !== "preparing") {
    throw new Error(`[command] Invalid transition: ${command.status} → ready`)
  }

  await db.commands.update(orderId, {
    status: "ready",
    completedAt: new Date(),
    updatedAt: new Date(),
  })

  await db.orders.update(orderId, {
    status: "ready",
    updatedAt: new Date(),
  })

  await enqueue(tenantId, "order.ready", {
    orderId,
    tableNumber: command.tableNumber,
    completedAt: new Date().toISOString(),
  })
}

// ============================================================================
// Lecturas
// ============================================================================

export async function getCommand(
  orderId: string
): Promise<KitchenCommand | undefined> {
  return db.commands.get(orderId)
}

export async function getPendingCommands(
  tenantId: string
): Promise<KitchenCommand[]> {
  return db.commands
    .where("tenantId")
    .equals(tenantId)
    .and((c) => c.status === "pending" || c.status === "preparing")
    .toArray()
}

export async function getCommandsByStatus(
  tenantId: string,
  status: "pending" | "preparing" | "ready"
): Promise<KitchenCommand[]> {
  return db.commands
    .where("tenantId")
    .equals(tenantId)
    .and((c) => c.status === status)
    .toArray()
}
