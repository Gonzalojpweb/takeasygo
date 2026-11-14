import { posApi } from "./pos-api"
import { runMutation } from "./polling"
import { db } from "../db/dexie"
import type { Table } from "@takeasygo/types"

// ============================================================================
// Reservas y sectores en el POS (observación 24/10)
// ============================================================================
// · Sectores = espacios de la sede (Location.spaces, fuente única con el
//   panel). Desde el 14/11/2026 el POS también los crea y edita (admin y
//   encargado): un local sin reservas necesita dividir el salón, y en un
//   finde lleno se pausan las reservas sin salir del POS.
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
  /** Acepta reservas (14/11/2026). */
  reservable?: boolean
  tables?: number
  upcomingReservations?: number
  blockedDates?: string[]
}

/** Recepción de reservas de la sede: available = el comercio tiene el módulo. */
export interface PosReservationIntake {
  available: boolean
  enabled: boolean
}

export interface SectorInput {
  name?: string
  capacity?: number
  enabled?: boolean
  reservable?: boolean
  blockedDates?: string[]
  order?: number
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

/** Espacios + estado de la recepción de reservas (pantalla Configurar salón). */
export async function loadSalon(tenantId: string): Promise<{ sectors: PosSector[]; reservations: PosReservationIntake }> {
  const res = await posApi<{ sectors: PosSector[]; reservations?: PosReservationIntake }>(tenantId, "/sectors")
  return { sectors: res.sectors, reservations: res.reservations ?? { available: false, enabled: false } }
}

export async function createSector(tenantId: string, input: SectorInput): Promise<void> {
  await posApi(tenantId, "/sectors", { method: "POST", body: input as Record<string, unknown> })
}

export async function updateSector(tenantId: string, id: string, input: SectorInput): Promise<void> {
  await posApi(tenantId, `/sectors/${encodeURIComponent(id)}`, { method: "PATCH", body: input as Record<string, unknown> })
}

export async function deleteSector(tenantId: string, id: string): Promise<void> {
  await posApi(tenantId, `/sectors/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/** Abrir / cerrar la recepción de reservas online de la sede. */
export async function setReservationIntake(tenantId: string, enabled: boolean): Promise<boolean> {
  const res = await posApi<{ enabled: boolean }>(tenantId, "/reservations/intake", { method: "PUT", body: { enabled } })
  return res.enabled
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
