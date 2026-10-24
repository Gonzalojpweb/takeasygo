import mongoose from 'mongoose'
import Reservation from '@/models/Reservation'
import { DEFAULT_TIMEZONE, getTodayStrInTimezone } from '@/lib/restaurant-time'

// ============================================================================
// Reservas nuevas sin ver (observación 24/10)
// ============================================================================
// Badge del SaaS (menú «Reservaciones») y del POS (vista Reservaciones):
// reservas de hoy en adelante, activas (seña pendiente, confirmada o lista
// de espera) que nadie del local vio todavía (`acknowledgedAt` null).
// Verlas en cualquiera de los dos lados las marca vistas para ambos.
// `scope` es el filtro de sede ya resuelto por quien llama (scopeLocationFilter
// en el SaaS, la sede del token en el POS): esta función no decide alcance.
// ============================================================================

export const UNSEEN_STATUSES = ['pending_payment', 'confirmed', 'waitlist'] as const

type Id = mongoose.Types.ObjectId | string

function filter(tenantId: Id, scope: { locationId?: unknown }, timezone?: string): Record<string, unknown> {
  return {
    tenantId: new mongoose.Types.ObjectId(String(tenantId)),
    ...scope,
    acknowledgedAt: null,
    status: { $in: UNSEEN_STATUSES },
    date: { $gte: getTodayStrInTimezone(timezone || DEFAULT_TIMEZONE) },
  }
}

export async function countUnseenReservations(tenantId: Id, scope: { locationId?: unknown }, timezone?: string): Promise<number> {
  return Reservation.countDocuments(filter(tenantId, scope, timezone) as never)
}

/** Marca como vistas las reservas nuevas del alcance. Devuelve cuántas. */
export async function acknowledgeReservations(tenantId: Id, scope: { locationId?: unknown }, timezone?: string): Promise<number> {
  const res = await Reservation.updateMany(filter(tenantId, scope, timezone) as never, { $set: { acknowledgedAt: new Date() } })
  return res.modifiedCount
}
