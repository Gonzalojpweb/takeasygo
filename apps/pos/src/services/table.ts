import type { Table, TableStatus } from "@takeasygo/types"
import { db } from "../db/dexie"
import { enqueue } from "./event-queue"

// ============================================================================
// Transitions permitidas — selladas por Gemini
// ============================================================================

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  free: ["occupied", "reserved"],
  occupied: ["free", "closed", "reserved"],
  reserved: ["free", "occupied"],
  closed: [],
}

function validateTransition(from: TableStatus, to: TableStatus): void {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new Error(
      `[table] Invalid transition: ${from} → ${to}. Allowed: [${allowed.join(", ")}]`
    )
  }
}

// ============================================================================
// Mutaciones
// ============================================================================

export async function openTable(
  tenantId: string,
  number: number,
  capacity: number,
  section?: string
): Promise<void> {
  const table: Table = {
    id: crypto.randomUUID(),
    tenantId,
    number,
    capacity,
    status: "free",
    section,
  }

  await db.diningTable.add(table)

  await enqueue(tenantId, "table.status_changed", {
    tableId: table.id,
    previousStatus: null,
    newStatus: table.status,
    number: table.number,
    section: table.section,
  })
}

export async function occupyTable(
  tenantId: string,
  tableId: string,
  serverId: string,
  orderId: string
): Promise<void> {
  const table = await db.diningTable.get(tableId)
  if (!table) throw new Error(`[table] Table ${tableId} not found`)
  if (table.tenantId !== tenantId) throw new Error("[table] Tenant mismatch")

  validateTransition(table.status, "occupied")

  const previousStatus = table.status

  await db.diningTable.update(tableId, {
    status: "occupied",
    serverId,
    currentOrderId: orderId,
  })

  await enqueue(tenantId, "table.status_changed", {
    tableId,
    previousStatus,
    newStatus: "occupied",
    serverId,
    orderId,
    number: table.number,
  })
}

export async function freeTable(
  tenantId: string,
  tableId: string
): Promise<void> {
  const table = await db.diningTable.get(tableId)
  if (!table) throw new Error(`[table] Table ${tableId} not found`)
  if (table.tenantId !== tenantId) throw new Error("[table] Tenant mismatch")

  if (table.status !== "occupied" && table.status !== "reserved") {
    throw new Error(
      `[table] Cannot free table ${tableId} in status ${table.status}`
    )
  }

  // occupied → free: solo si no hay orden activa
  if (table.status === "occupied" && table.currentOrderId) {
    const order = await db.orders.get(table.currentOrderId)
    if (order && !["delivered", "cancelled"].includes(order.status)) {
      throw new Error(
        `[table] Cannot free table ${tableId}: order ${order.id} is ${order.status}`
      )
    }
  }

  const previousStatus = table.status

  await db.diningTable.update(tableId, {
    status: "free",
    serverId: undefined,
    currentOrderId: undefined,
  })

  await enqueue(tenantId, "table.status_changed", {
    tableId,
    previousStatus,
    newStatus: "free",
    number: table.number,
  })
}

export async function reserveTable(
  tenantId: string,
  tableId: string
): Promise<void> {
  const table = await db.diningTable.get(tableId)
  if (!table) throw new Error(`[table] Table ${tableId} not found`)
  if (table.tenantId !== tenantId) throw new Error("[table] Tenant mismatch")

  validateTransition(table.status, "reserved")

  const previousStatus = table.status

  await db.diningTable.update(tableId, { status: "reserved" })

  await enqueue(tenantId, "table.status_changed", {
    tableId,
    previousStatus,
    newStatus: "reserved",
    number: table.number,
  })
}

export async function closeTable(
  tenantId: string,
  tableId: string
): Promise<void> {
  const table = await db.diningTable.get(tableId)
  if (!table) throw new Error(`[table] Table ${tableId} not found`)
  if (table.tenantId !== tenantId) throw new Error("[table] Tenant mismatch")

  // occupied → closed: solo si orden está delivered o cancelled
  if (table.status === "occupied" && table.currentOrderId) {
    const order = await db.orders.get(table.currentOrderId)
    if (order && !["delivered", "cancelled"].includes(order.status)) {
      throw new Error(
        `[table] Cannot close table ${tableId}: order ${order.id} is ${order.status}`
      )
    }
  }

  validateTransition(table.status, "closed")

  const previousStatus = table.status

  await db.diningTable.update(tableId, {
    status: "closed",
    serverId: undefined,
    currentOrderId: undefined,
  })

  await enqueue(tenantId, "table.status_changed", {
    tableId,
    previousStatus,
    newStatus: "closed",
    number: table.number,
  })
}

// ============================================================================
// Lecturas
// ============================================================================

export async function getTable(
  tenantId: string,
  tableId: string
): Promise<Table | undefined> {
  const table = await db.diningTable.get(tableId)
  if (!table || table.tenantId !== tenantId) return undefined
  return table
}

export async function getTablesBySection(
  tenantId: string,
  section: string
): Promise<Table[]> {
  return db.diningTable
    .where("tenantId")
    .equals(tenantId)
    .and((t) => t.section === section)
    .toArray()
}

export async function getTablesByStatus(
  tenantId: string,
  status: TableStatus
): Promise<Table[]> {
  return db.diningTable
    .where("tenantId")
    .equals(tenantId)
    .and((t) => t.status === status)
    .toArray()
}
