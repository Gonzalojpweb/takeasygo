import type { CashRegister, Order, OrderStatus, Table } from "@takeasygo/types"
import { db } from "../../db/dexie"
import { rehydrateOrder, rehydrateRegister } from "../pos-wire"
import { registerOfflineOpKind } from "./registry"
import { applyTablePatch, releasesTable } from "./local-model"

// ============================================================================
// Registro de los tipos de operación offline
// ============================================================================
// App.tsx importa este módulo una vez. Cada tipo dice qué hacer con la
// respuesta del server al reenviar la cola (gana el server: su registro
// reemplaza el que armó el equipo sin internet) y qué rechazos significan
// «ya estaba hecho».
//
//   etapa 2 — order.write, order.status, table.write, table.move
//   etapa 3 — cash.register, cash.movement (el cobro es order.write)
// ============================================================================

async function saveServerOrder(response: unknown): Promise<Order | null> {
  const order = (response as { order?: Order } | null)?.order
  if (!order) return null
  const rehydrated = rehydrateOrder(order)
  await db.orders.put(rehydrated)
  return rehydrated
}

async function saveServerTable(table: Table | undefined): Promise<void> {
  if (table) await db.diningTable.put(table)
}

registerOfflineOpKind("order.write", {
  onSuccess: async (response) => {
    await saveServerOrder(response)
  },
})

/** Pasos de servicio hacia adelante: si otra terminal ya lo hizo, está bien. */
const FORWARD_STEPS: OrderStatus[] = ["confirmed", "preparing", "ready"]

registerOfflineOpKind("order.status", {
  onSuccess: async (response, op) => {
    const order = await saveServerOrder(response)
    const status = (op.body as { status?: OrderStatus } | undefined)?.status
    if (order?.tableId && status && releasesTable(status)) {
      const table = await db.diningTable.get(order.tableId)
      if (table && table.currentOrderId === order.id) await db.diningTable.put(applyTablePatch(table, { status: "free" }))
    }
  },
  tolerate: (error, op) => {
    const status = (op.body as { status?: OrderStatus } | undefined)?.status
    return error.code === "transition_invalid" && Boolean(status && FORWARD_STEPS.includes(status))
  },
})

registerOfflineOpKind("table.write", {
  onSuccess: async (response) => {
    await saveServerTable((response as { table?: Table } | null)?.table)
  },
})

registerOfflineOpKind("table.move", {
  onSuccess: async (response) => {
    const res = response as { from?: Table; to?: Table } | null
    await saveServerTable(res?.from)
    await saveServerTable(res?.to)
  },
})

async function saveServerRegister(response: unknown): Promise<void> {
  const register = (response as { register?: CashRegister } | null)?.register
  if (register) await db.cashRegister.put(rehydrateRegister(register))
}

registerOfflineOpKind("cash.register", { onSuccess: saveServerRegister })
registerOfflineOpKind("cash.movement", { onSuccess: saveServerRegister })
