import type { Table, TableStatus } from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi } from "./pos-api"
import { runMutation } from "./polling"

// ============================================================================
// Server-first (V1 POS Online)
// ============================================================================
// Toda mutación va contra /api/[tenant]/pos/tables y recién con la respuesta
// del server se escribe Dexie. El server es la única fuente de verdad para:
//   - transición de estado (@takeasygo/business, misma regla que acá)
//   - liberar una mesa con la orden todavía activa
//   - pertenencia a la sede del token
// Si no hay red la acción falla visible y NO se toca Dexie. El outbox
// (event-queue) ya no se usa para estas escrituras: el hecho quedó
// persistido en el server, reencolarlo duplicaría la aplicación por un
// camino sin guard de idempotencia por posId.
//
// `runMutation` marca el ciclo servidor+Dexie para que el polling (M6) no
// escriba por encima con una respuesta traída antes de esta confirmación.
// ============================================================================

/** Contrato de /pos/tables: la mesa tal como la devolvió el server. */
type WireTable = Table

function applyServerTable(table: WireTable): Promise<string> {
  return db.diningTable.put(table)
}

async function createTable(
  tenantId: string,
  draft: {
    id: string
    number: number
    capacity: number
    section?: string
  }
): Promise<void> {
  return runMutation(async () => {
    const { table } = await posApi<{ table: WireTable }>(tenantId, "/tables", {
      method: "POST",
      body: {
        id: draft.id,
        number: draft.number,
        capacity: draft.capacity,
        ...(draft.section ? { section: draft.section } : {}),
      },
    })
    await applyServerTable(table)
  })
}

async function patchTable(
  tenantId: string,
  tableId: string,
  body: Record<string, unknown>
): Promise<void> {
  return runMutation(async () => {
    const { table } = await posApi<{ table: WireTable }>(
      tenantId,
      `/tables/${encodeURIComponent(tableId)}`,
      { method: "PATCH", body }
    )
    await applyServerTable(table)
  })
}

// ============================================================================
// Mutaciones — firmas estables: las consumen useTables y WaiterDashboard
// ============================================================================

export async function openTable(
  tenantId: string,
  number: number,
  capacity: number,
  section?: string
): Promise<void> {
  await createTable(tenantId, {
    id: crypto.randomUUID(),
    number,
    capacity,
    section,
  })
}

export async function occupyTable(
  tenantId: string,
  tableId: string,
  serverId: string,
  orderId: string
): Promise<void> {
  await patchTable(tenantId, tableId, {
    status: "occupied",
    serverId,
    currentOrderId: orderId,
  })
}

export async function freeTable(
  tenantId: string,
  tableId: string
): Promise<void> {
  await patchTable(tenantId, tableId, { status: "free" })
}

export async function reserveTable(
  tenantId: string,
  tableId: string
): Promise<void> {
  await patchTable(tenantId, tableId, { status: "reserved" })
}

export async function closeTable(
  tenantId: string,
  tableId: string
): Promise<void> {
  await patchTable(tenantId, tableId, { status: "closed" })
}

export async function markNeedsAttention(
  tenantId: string,
  tableId: string
): Promise<void> {
  await patchTable(tenantId, tableId, { status: "needs_attention" })
}

export async function markNeedsBill(
  tenantId: string,
  tableId: string,
  needsBill: boolean
): Promise<void> {
  await patchTable(tenantId, tableId, { needsBill })
}

// ============================================================================
// Lecturas — siguen locales: Dexie es el read model y `services/polling.ts`
// lo refresca contra GET /pos/tables sin borrar nada.
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
