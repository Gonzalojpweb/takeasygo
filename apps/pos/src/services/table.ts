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
    spaceId?: string
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
        ...(draft.spaceId ? { spaceId: draft.spaceId } : {}),
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
  section?: string,
  /** Sector = espacio de la sede definido en el SaaS (obs. 24/10). */
  spaceId?: string
): Promise<void> {
  await createTable(tenantId, {
    id: crypto.randomUUID(),
    number,
    capacity,
    section,
    spaceId,
  })
}

/** Cambia sector, capacidad y/o lugar en el plano de una mesa (caja/encargado). */
export async function updateTableSetup(
  tenantId: string,
  tableId: string,
  changes: { spaceId?: string; capacity?: number; layout?: Table["layout"] | null }
): Promise<void> {
  await patchTable(tenantId, tableId, changes)
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

/**
 * Ocupa la mesa al EMPEZAR a cargar, antes de que exista la orden: el Salón
 * debe mostrarla ocupada mientras el cajero arma el pedido, aunque nunca
 * cobre. Sin currentOrderId: no hay orden todavía que proteger en
 * assertCanRelease, y la server deja el campo libre para el bind del cobro.
 */
export async function occupyTableForLoading(
  tenantId: string,
  tableId: string,
  serverId: string
): Promise<void> {
  await patchTable(tenantId, tableId, {
    status: "occupied",
    serverId,
  })
}

/**
 * Abre la mesa con sus comensales (Fase B, 2026-10): la gente se sentó,
 * la mesa queda ocupada aunque todavía no haya pedido. Sin currentOrderId:
 * la primera ronda la vincula (bindTableOrder).
 */
export async function occupyTableWithGuests(
  tenantId: string,
  tableId: string,
  serverId: string,
  guests: number
): Promise<void> {
  await patchTable(tenantId, tableId, {
    status: "occupied",
    serverId,
    guests,
  })
}

/** Corrige la cantidad de comensales sin tocar el estado de la mesa. */
export async function setTableGuests(
  tenantId: string,
  tableId: string,
  guests: number
): Promise<void> {
  await patchTable(tenantId, tableId, { guests })
}

/**
 * Cambiar de mesa (destino libre) o unir mesas (destino ocupado + join).
 * Fase C (2026-10): el server mueve las rondas abiertas y libera el origen;
 * acá se reflejan las dos mesas y las rondas en la caché local para que el
 * Salón cambie al instante (el polling lo confirma igual).
 */
export async function moveTable(
  tenantId: string,
  fromId: string,
  toId: string,
  join: boolean
): Promise<{ mode: "move" | "join"; movedOrders: number }> {
  return runMutation(async () => {
    const res = await posApi<{ mode: "move" | "join"; movedOrders: number; from: WireTable; to: WireTable }>(
      tenantId,
      `/tables/${encodeURIComponent(fromId)}/move`,
      { method: "POST", body: { toTableId: toId, ...(join ? { join: true } : {}) } }
    )
    await applyServerTable(res.from)
    await applyServerTable(res.to)
    await db.orders
      .where("tableId")
      .equals(fromId)
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .modify({ tableId: toId })
    return { mode: res.mode, movedOrders: res.movedOrders }
  })
}

/**
 * Imprime la precuenta de la mesa en la impresora de caja (Fase E). No toca
 * la mesa ni las órdenes: se puede reimprimir. Lanza PosApiError 409 si no
 * hay impresora de caja; el que llama decide cómo avisar.
 */
export async function printPrecuenta(tenantId: string, tableId: string): Promise<{ printerName: string; total: number }> {
  return posApi<{ printed: true; printerName: string; total: number }>(
    tenantId,
    `/tables/${encodeURIComponent(tableId)}/precuenta`,
    { method: "POST" }
  )
}

/**
 * Vincula la orden real a una mesa que ya está ocupada por la carga en curso.
 * Va SIN status: no hay transición que validar (sigue occupied) y el server
 * guarda currentOrderId para que delivered/cancelled la libere solo.
 */
export async function bindTableOrder(
  tenantId: string,
  tableId: string,
  serverId: string,
  orderId: string
): Promise<void> {
  await patchTable(tenantId, tableId, {
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
