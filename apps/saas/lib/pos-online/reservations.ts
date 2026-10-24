import mongoose from 'mongoose'
import { safeDecrypt } from '@/lib/crypto'
import type { PosSector } from './sectors'

// ============================================================================
// Reservas en el POS (observación 24/10) — contrato
// ============================================================================
// El POS ve las reservas del día de su sede para recibir a los clientes y
// ubicarlos. Seguridad: el nombre se descifra (lo necesita el personal) pero
// el teléfono viaja solo con los últimos 4 dígitos; el email no viaja.
// ============================================================================

export interface PosReservation {
  id: string
  number: string
  date: string
  time: string
  partySize: number
  name: string
  phoneTail: string
  notes: string
  status: string
  spaceId: string | null
  spaceName: string | null
  tablePosId: string | null
  /** Nueva: nadie del local la vio todavía (badge). */
  isNew: boolean
}

export interface ReservationDocLike {
  _id: mongoose.Types.ObjectId
  reservationNumber: string
  date: string
  time: string
  partySize: number
  name: string
  phone: string
  notes?: string
  status: string
  spaceId?: mongoose.Types.ObjectId | null
  tablePosId?: string | null
  acknowledgedAt?: Date | null
}

export function toPosReservation(doc: ReservationDocLike, sectors: PosSector[]): PosReservation {
  const phone = safeDecrypt(doc.phone)
  const digits = phone.replace(/\D/g, '')
  const spaceId = doc.spaceId ? String(doc.spaceId) : null
  return {
    id: String(doc._id),
    number: doc.reservationNumber,
    date: doc.date,
    time: doc.time,
    partySize: doc.partySize,
    name: safeDecrypt(doc.name),
    phoneTail: digits.slice(-4),
    notes: doc.notes ?? '',
    status: doc.status,
    spaceId,
    spaceName: spaceId ? sectors.find((s) => s.id === spaceId)?.name ?? null : null,
    tablePosId: doc.tablePosId ?? null,
    isNew: !doc.acknowledgedAt,
  }
}
