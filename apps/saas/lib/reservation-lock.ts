// ============================================================================
// reservation-lock.ts — Exclusión mutua por (sede, fecha) para reservas (R-1)
// ============================================================================
// Las reservas ocupan una franja (blockDurationMinutes): horarios distintos se
// solapan, así que no alcanza con un contador por horario exacto. El alta toma
// un lock con lease sobre (tenant, sede, fecha), chequea disponibilidad e
// inserta; recién después libera. Reemplaza el "insertar + sleep(50ms) +
// recontar y borrar al último" que fallaba con latencia alta.
//
// El lease vence solo (LEASE_MS): si el proceso muere con el lock tomado, la
// fecha se libera sin intervención.
// ============================================================================

import crypto from 'node:crypto'
import mongoose, { Schema } from 'mongoose'

const LEASE_MS = 5_000
const MAX_WAIT_MS = 4_000

interface IReservationLock {
  key: string
  owner: string | null
  lockedUntil: Date | null
}

const ReservationLockSchema = new Schema<IReservationLock>(
  {
    key: { type: String, required: true, unique: true },
    owner: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
  },
  { versionKey: false }
)

const ReservationLock =
  (mongoose.models.ReservationLock as mongoose.Model<IReservationLock>) ||
  mongoose.model<IReservationLock>('ReservationLock', ReservationLockSchema, 'reservation_locks')

let lockIndexReady: Promise<unknown> | null = null

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000
}

/**
 * Toma el lock de (tenant, sede, fecha). Devuelve la función de liberación, o
 * null si no se pudo tomar en MAX_WAIT_MS (mucha concurrencia → el caller
 * responde 409 y el cliente reintenta).
 */
export async function acquireReservationLock(
  tenantId: unknown,
  locationId: unknown,
  date: string
): Promise<(() => Promise<void>) | null> {
  // La exclusión depende del índice único de `key`: sin él, dos upserts
  // concurrentes crean dos documentos y ambos "toman" el lock. init() espera
  // a que el índice exista (una vez por proceso).
  await (lockIndexReady ??= ReservationLock.init())

  const key = `${String(tenantId)}:${String(locationId)}:${date}`
  const owner = crypto.randomUUID()
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    const now = new Date()
    try {
      // Libre = no existe (upsert) o su lease venció. Si está tomado y vigente,
      // el upsert choca con el índice único de `key` (E11000).
      const doc = await ReservationLock.findOneAndUpdate(
        { key, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
        { $set: { owner, lockedUntil: new Date(now.getTime() + LEASE_MS) } },
        { upsert: true, new: true }
      ).lean()
      if (doc?.owner === owner) {
        return async () => {
          await ReservationLock.updateOne({ key, owner }, { $set: { owner: null, lockedUntil: null } })
        }
      }
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
    }
    await new Promise(r => setTimeout(r, 20 + Math.random() * 30))
  }
  return null
}
