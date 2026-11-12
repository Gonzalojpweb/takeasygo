import type { Table, TableStatus } from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi, isPosApiError, PosApiError } from "./pos-api"
import { runMutation, resyncTablesSoon } from "./polling"
import { offlineAware } from "./offline/executor"
import { applyTablePatch, type TablePatch } from "./offline/local-model"

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

/** Texto de la operación en la pantalla de sincronización. */
function describePatch(body: TablePatch): string {
  if (body.status === "free") return "liberar"
  if (body.status === "occupied") return body.guests ? `abrir (${body.guests} comensales)` : "ocupar"
  if (body.status === "reserved") return "reservar"
  if (body.status === "closed") return "cerrar"
  if (body.status === "needs_attention") return "llamar al encargado"
  if (body.needsBill !== undefined) return body.needsBill ? "pidió la cuenta" : "reabrir"
  if (body.currentOrderId) return "vincular ronda"
  if (body.guests !== undefined) return `comensales: ${body.guests}`
  return "cambios"
}

/**
 * POS offline (etapa 2): con red, server-first como siempre; sin red y con el
 * equipo habilitado, el cambio se aplica en la mesa local y se encola.
 */
async function patchTable(
  tenantId: string,
  tableId: string,
  body: TablePatch
): Promise<void> {
  const path = `/tables/${encodeURIComponent(tableId)}`
  const local = await db.diningTable.get(tableId)
  try {
    return await runMutation(() =>
      offlineAware<void>({
        tenantId,
        kind: "table.write",
        label: `Mesa ${local?.number ?? "?"} · ${describePatch(body)}`,
        request: { method: "PATCH", path, body },
        entityKeys: [`table:${tableId}`, ...(body.currentOrderId ? [`order:${body.currentOrderId}`] : [])],
        online: async (headers) => {
          const { table } = await posApi<{ table: WireTable }>(tenantId, path, { method: "PATCH", body, headers })
          await applyServerTable(table)
        },
        applyLocal: async () => {
          const current = await db.diningTable.get(tableId)
          if (!current) throw new PosApiError("Mesa no encontrada en esta sede", "not_found", 404)
          await db.diningTable.put(applyTablePatch(current, body))
        },
      })
    )
  } catch (err) {
    // 30/10: mesa que el server no tiene ⇒ el salón se actualiza solo.
    if (isPosApiError(err) && err.status === 404) resyncTablesSoon(tenantId)
    throw err
  }
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
  const path = `/tables/${encodeURIComponent(fromId)}/move`
  const body = { toTableId: toId, ...(join ? { join: true } : {}) }
  const [from, to] = await Promise.all([db.diningTable.get(fromId), db.diningTable.get(toId)])
  const retarget = () =>
    db.orders
      .where("tableId")
      .equals(fromId)
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .modify({ tableId: toId })
  return runMutation(() =>
    offlineAware({
      tenantId,
      kind: "table.move",
      label: `Mesa ${from?.number ?? "?"} → Mesa ${to?.number ?? "?"}${join ? " (unir)" : ""}`,
      request: { method: "POST", path, body },
      entityKeys: [`table:${fromId}`, `table:${toId}`],
      online: async (headers) => {
        const res = await posApi<{ mode: "move" | "join"; movedOrders: number; from: WireTable; to: WireTable }>(tenantId, path, { method: "POST", body, headers })
        await applyServerTable(res.from)
        await applyServerTable(res.to)
        await retarget()
        return { mode: res.mode, movedOrders: res.movedOrders }
      },
      // Sin red: el destino toma la mesa (o se une) y el origen queda libre.
      applyLocal: async () => {
        const [src, dst] = await Promise.all([db.diningTable.get(fromId), db.diningTable.get(toId)])
        if (!src || !dst) throw new PosApiError("Mesa no encontrada en esta sede", "not_found", 404)
        const joinMode = dst.status === "occupied"
        if (joinMode && !join) throw new PosApiError("La mesa de destino está ocupada", "conflict", 409)
        const moved = await retarget()
        await db.diningTable.put(
          joinMode
            ? { ...dst, guests: (dst.guests ?? 0) + (src.guests ?? 0) || undefined }
            : applyTablePatch(dst, { status: "occupied", serverId: src.serverId, guests: src.guests, ...(src.currentOrderId ? { currentOrderId: src.currentOrderId } : {}) })
        )
        await db.diningTable.put(applyTablePatch(src, { status: "free" }))
        return { mode: joinMode ? ("join" as const) : ("move" as const), movedOrders: moved }
      },
    })
  )
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
