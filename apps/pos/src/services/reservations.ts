import { posApi } from "./pos-api"
import { runMutation } from "./polling"
import { db } from "../db/dexie"
import type { Table } from "@takeasygo/types"

// ============================================================================
// Reservas y sectores en el POS (observación 24/10)
// ============================================================================
// · Sectores: los espacios de la sede definidos en el SaaS (fuente única).
//   El POS los lista para ubicar mesas; no los crea.
// · Reservas: las del día de la sede, con su sector y mesa. Asignar mesa
//   (queda reservada), sentar (pasa a ocupada con los comensales), no vino
//   (libera). Confirmar / cancelar / señas siguen en el panel del SaaS.
// · `unseen` = reservas nuevas sin ver (badge, compartido con el SaaS).
// ============================================================================

export interface PosSector {
  id: string
  name: string
  capacity: number
  enabled: boolean
  order: number
}

export interface PosReservation {
  id: string
  number: string
  date: string
  time: string
  partySize: number
  name: string
  phoneTail: string
  notes: string
  status: "pending_payment" | "confirmed" | "waitlist" | "seated" | "no_show" | "cancelled"
  spaceId: string | null
  spaceName: string | null
  tablePosId: string | null
  isNew: boolean
}

export type ReservationAction = "assign" | "unassign" | "seat" | "no_show"

export async function listSectors(tenantId: string): Promise<PosSector[]> {
  const { sectors } = await posApi<{ sectors: PosSector[] }>(tenantId, "/sectors")
  return sectors
}

export async function listReservations(
  tenantId: string,
  date?: string
): Promise<{ date: string; reservations: PosReservation[]; unseen: number }> {
  return posApi(tenantId, `/reservations${date ? `?date=${encodeURIComponent(date)}` : ""}`)
}

export async function markReservationsSeen(tenantId: string): Promise<void> {
  await posApi(tenantId, "/reservations/seen", { method: "POST" })
}

/**
 * Opera una reserva. Después refresca las mesas de la caché local: asignar
 * o sentar cambia el estado de una mesa en el server (el polling lo
 * confirmaría igual, esto lo hace instantáneo).
 */
export async function actOnReservation(
  tenantId: string,
  reservationId: string,
  action: ReservationAction,
  tablePosId?: string
): Promise<PosReservation> {
  return runMutation(async () => {
    const { reservation } = await posApi<{ reservation: PosReservation }>(
      tenantId,
      `/reservations/${encodeURIComponent(reservationId)}`,
      { method: "PATCH", body: { action, ...(tablePosId ? { tablePosId } : {}) } }
    )
    const { tables } = await posApi<{ tables: Table[] }>(tenantId, "/tables")
    await db.diningTable.bulkPut(tables)
    return reservation
  })
}
