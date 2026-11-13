import { bytesToBase64, linesToEscPosBytes, precuentaLines, type PrecuentaItem } from "@takeasygo/business/browser"
import type { Order } from "@takeasygo/types"
import { db } from "../../db/dexie"
import { PosApiError } from "../pos-api"
import { offlineStore } from "./store"
import { getCachedPrinters, getPrintAgent, sendToAgent } from "./local-print"

// ============================================================================
// Precuenta sin internet (POS offline V2 — etapa 5, 12/11/2026)
// ============================================================================
// Mismo ticket que arma el server (lines-ticket.ts): rondas sin cobrar de la
// mesa, descuentos, total y por persona. Sale por la impresora que tiene
// «Precuenta» a través del agente de la red local. No es una operación: no
// cambia nada, así que no se encola ni se manda al server.
// ============================================================================

const locationKey = (tenantId: string) => `location:${tenantId}`

export interface CachedLocation {
  name: string
  timezone?: string | null
}

export async function cacheLocation(tenantId: string, location: CachedLocation): Promise<void> {
  await offlineStore().setMeta(locationKey(tenantId), location)
}

/** Rondas sin cobrar de la mesa → líneas de la precuenta (como la ruta del server). */
export function precuentaItems(orders: Order[]): PrecuentaItem[] {
  return orders
    .filter((o) => o.status !== "delivered" && o.status !== "cancelled" && !o.voided && !(o.payments?.length))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .flatMap((o) => o.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.total, discountCents: i.discount?.amount ?? 0 })))
}

export async function printPrecuentaLocally(tenantId: string, tableId: string): Promise<{ printerName: string; total: number }> {
  const table = await db.diningTable.get(tableId)
  if (!table) throw new PosApiError("Mesa no encontrada en este equipo", "not_found", 404)
  const orders = (await db.orders.where("tableId").equals(tableId).toArray()) as Order[]
  const items = precuentaItems(orders.filter((o) => o.tenantId === tenantId))
  if (items.length === 0) throw new PosApiError("La mesa no tiene nada para cobrar", "conflict", 409)

  const [printers, config, location] = await Promise.all([
    getCachedPrinters(tenantId),
    getPrintAgent(tenantId),
    offlineStore().getMeta<CachedLocation>(locationKey(tenantId)),
  ])
  const printer = printers.find((p) => (p.documents ?? []).includes("precuenta"))
  if (!printer) throw new PosApiError("No hay impresora de precuenta en este equipo", "conflict", 409)
  if (!config) throw new PosApiError("Sin internet: falta vincular el agente de impresión (Configuración › Sin internet)", "network", 0)

  const bytes = linesToEscPosBytes(
    precuentaLines({
      locationName: location?.name ?? "",
      tableNumber: table.number,
      guests: table.guests ?? null,
      items,
      at: new Date(),
      timezone: location?.timezone ?? undefined,
      columns: printer.paperWidth === 80 ? 48 : 32,
    })
  )
  const [result] = await sendToAgent(config, [
    { id: `precuenta:${tableId}:${Date.now()}`, printerId: printer.id, printerName: printer.name, role: "cashier", payload: bytesToBase64(bytes) },
  ])
  if (!result?.ok) throw new PosApiError(`No se pudo imprimir la precuenta: ${result?.error ?? "error"}`, "network", 0)
  return { printerName: printer.name, total: items.reduce((s, i) => s + i.subtotal, 0) }
}
