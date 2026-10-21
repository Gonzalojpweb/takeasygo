// ============================================================================
// location-switch.ts — Cambio de sede del POS (multisede)
// ============================================================================
// Las cachés locales (mesas, pedidos, comandas, caja, menú) son de UNA sede.
// Si el dispositivo pasa a otra sede, se limpian para no mostrar ni operar
// datos de la anterior. Lo que NO se borra nunca: eventos offline sin
// sincronizar (serían ventas perdidas). Si hay alguno, el cambio se bloquea
// hasta sincronizar.
//
// Trabaja sobre una interfaz mínima de la base (no sobre Dexie directo) para
// poder testearla sin IndexedDB.
// ============================================================================

import type { EventStatus } from "@takeasygo/types"

/** Estados de evento offline que todavía no llegaron al servidor. */
const UNSYNCED: EventStatus[] = ["pending", "failed", "conflict", "requires_manual_attention"]

interface TenantScopedTable {
  where(index: "tenantId"): { equals(value: string): { delete(): Promise<number> } }
}

export interface LocationSwitchDb {
  tenantConfig: {
    get(tenantId: string): Promise<{ locationId?: string } | undefined>
    update(tenantId: string, changes: { locationId?: string }): Promise<number>
  }
  pendingEvents: {
    where(index: "tenantId"): { equals(value: string): { toArray(): Promise<Array<{ status: EventStatus }>> } }
  }
  diningTable: TenantScopedTable
  orders: TenantScopedTable
  commands: TenantScopedTable
  cashRegister: TenantScopedTable
  pendingMovements: TenantScopedTable
  pendingStatusUpdates: TenantScopedTable
  menuSnapshot: { delete(tenantId: string): Promise<void> }
}

export class LocationSwitchBlockedError extends Error {
  constructor(public readonly unsyncedCount: number) {
    super(
      `Hay ${unsyncedCount} operación(es) sin sincronizar de la sede anterior. ` +
      "Conectate y esperá a que se sincronicen antes de cambiar de sede."
    )
    this.name = "LocationSwitchBlockedError"
  }
}

/**
 * Fija la sede del dispositivo. Si cambia respecto de la guardada, limpia las
 * cachés de la sede anterior (o lanza LocationSwitchBlockedError si hay
 * eventos sin sincronizar). Devuelve si hubo cambio de sede.
 */
export async function applyPosLocation(
  db: LocationSwitchDb,
  tenantId: string,
  locationId: string | undefined
): Promise<boolean> {
  const current = await db.tenantConfig.get(tenantId)
  const previous = current?.locationId
  const changed = !!previous && !!locationId && previous !== locationId

  if (changed) {
    const events = await db.pendingEvents.where("tenantId").equals(tenantId).toArray()
    const unsynced = events.filter(e => UNSYNCED.includes(e.status)).length
    if (unsynced > 0) throw new LocationSwitchBlockedError(unsynced)

    await Promise.all([
      db.diningTable.where("tenantId").equals(tenantId).delete(),
      db.orders.where("tenantId").equals(tenantId).delete(),
      db.commands.where("tenantId").equals(tenantId).delete(),
      db.cashRegister.where("tenantId").equals(tenantId).delete(),
      db.pendingMovements.where("tenantId").equals(tenantId).delete(),
      db.pendingStatusUpdates.where("tenantId").equals(tenantId).delete(),
      db.menuSnapshot.delete(tenantId),
    ])
  }

  if (current) await db.tenantConfig.update(tenantId, { locationId })
  return changed
}
