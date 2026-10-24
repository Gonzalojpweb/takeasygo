import mongoose from 'mongoose'
import Table from '@/models/Table'
import { isValidTableTransition } from '@takeasygo/business'
import type { TableStatus } from '@takeasygo/types'

// ============================================================================
// Reserva ⇄ mesa del POS (observación 24/10)
// ============================================================================
// Una reserva confirmada puede tener una mesa ASIGNADA de antemano: la mesa
// pasa a `reserved` y guarda `reservationId`, así el POS la muestra
// reservada con los datos de la reserva. Al SENTAR, la mesa pasa a
// `occupied` con los comensales de la reserva. Si la reserva se cancela o
// no vino, la mesa reservada por ELLA vuelve a `free`.
// Lo usan el panel de reservas del SaaS (PUT /reservas/[id]) y el POS
// (PATCH /pos/reservations/[id]): una sola regla para los dos.
// Errores: `TableLinkError` con mensaje listo para mostrar.
// ============================================================================

export class TableLinkError extends Error {
  constructor(message: string, readonly status: 404 | 409) {
    super(message)
  }
}

interface ReservationRef {
  _id: mongoose.Types.ObjectId | string
  tenantId: mongoose.Types.ObjectId | string
  locationId: mongoose.Types.ObjectId | string
  partySize: number
  tablePosId?: string | null
}

async function loadTable(reservation: ReservationRef, tablePosId: string) {
  if (typeof tablePosId !== 'string' || !tablePosId || tablePosId.length > 100) {
    throw new TableLinkError('Mesa no encontrada en esta sede', 404)
  }
  const table = await Table.findOne({ tenantId: reservation.tenantId, locationId: reservation.locationId, posId: tablePosId })
  if (!table) throw new TableLinkError('Mesa no encontrada en esta sede', 404)
  return table
}

function heldBy(table: { status: TableStatus; reservationId?: mongoose.Types.ObjectId | null }, reservationId: string): boolean {
  return table.status === 'reserved' && String(table.reservationId ?? '') === reservationId
}

/** Suelta la mesa que la reserva tenía reservada (si sigue reservada por ella). */
export async function releaseReservationTable(reservation: ReservationRef): Promise<void> {
  if (!reservation.tablePosId) return
  await Table.updateOne(
    {
      tenantId: reservation.tenantId,
      locationId: reservation.locationId,
      posId: reservation.tablePosId,
      status: 'reserved',
      reservationId: new mongoose.Types.ObjectId(String(reservation._id)),
    },
    { $set: { status: 'free', reservationId: null } }
  )
}

/**
 * Asigna (o cambia) la mesa de una reserva confirmada: mesa libre →
 * reservada. Devuelve el tablePosId asignado.
 */
export async function assignReservationTable(reservation: ReservationRef, tablePosId: string): Promise<string> {
  const id = String(reservation._id)
  const table = await loadTable(reservation, tablePosId)
  if (!heldBy(table, id)) {
    if (table.status !== 'free') {
      throw new TableLinkError(`La mesa ${table.number} no está libre`, 409)
    }
    // Concurrencia: solo si sigue libre.
    const res = await Table.updateOne(
      { _id: table._id, status: 'free' },
      { $set: { status: 'reserved', reservationId: new mongoose.Types.ObjectId(id) } }
    )
    if (res.modifiedCount === 0) throw new TableLinkError(`La mesa ${table.number} cambió de estado, reintentá`, 409)
  }
  if (reservation.tablePosId && reservation.tablePosId !== tablePosId) {
    await releaseReservationTable(reservation)
  }
  return tablePosId
}

/**
 * Sienta la reserva: la mesa (la asignada o la elegida) pasa a ocupada con
 * los comensales de la reserva. Devuelve el tablePosId.
 */
export async function seatReservationTable(reservation: ReservationRef, tablePosId: string | null): Promise<string> {
  const id = String(reservation._id)
  const target = tablePosId ?? reservation.tablePosId ?? null
  if (!target) throw new TableLinkError('Elegí la mesa donde se sienta la reserva', 409)
  const table = await loadTable(reservation, target)
  if (table.status !== 'occupied') {
    if (!heldBy(table, id) && !isValidTableTransition(table.status as TableStatus, 'occupied')) {
      throw new TableLinkError(`La mesa ${table.number} no está disponible`, 409)
    }
    if (table.status === 'reserved' && !heldBy(table, id)) {
      throw new TableLinkError(`La mesa ${table.number} está reservada para otra reserva`, 409)
    }
    table.status = 'occupied'
    table.guests = Math.min(99, Math.max(1, reservation.partySize))
  }
  table.reservationId = null
  await table.save()
  if (reservation.tablePosId && reservation.tablePosId !== target) {
    await releaseReservationTable(reservation)
  }
  return target
}
