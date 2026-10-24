import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Reservation from '@/models/Reservation'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { loadSectors } from '@/lib/pos-online/sectors'
import { toPosReservation, type ReservationDocLike } from '@/lib/pos-online/reservations'
import {
  TableLinkError,
  assignReservationTable,
  releaseReservationTable,
  seatReservationTable,
} from '@/lib/reservations/tableLink'

// ============================================================================
// PATCH /api/[tenant]/pos/reservations/[id] — operar una reserva desde el POS
// ============================================================================
// Obs. 24/10. Body: { action, tablePosId? }
//   · assign   (confirmada) → la mesa queda RESERVADA en el POS.
//   · unassign (confirmada) → suelta la mesa reservada.
//   · seat     (confirmada) → sentar: la mesa (la elegida o la asignada)
//                             pasa a ocupada con los comensales.
//   · no_show  (confirmada) → no vino: se libera la mesa reservada.
// Confirmar, cancelar o cobrar señas sigue en el panel del SaaS.
// Solo caja/encargado/admin (tables.manage). Misma regla que el panel:
// lib/reservations/tableLink.
// ============================================================================

const ACTIONS = new Set(['assign', 'unassign', 'seat', 'no_show'])

type ReservationDoc = ReservationDocLike & { tenantId: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId }

export const PATCH = posRoute('tables.manage', async (ctx, { id }) => {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw PosError.notFound('Reserva no encontrada')
  const body = await readPosBody(ctx.request)
  requireFields(body, ['action'])
  const action = body.action
  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    throw PosError.validation('action debe ser assign, unassign, seat o no_show')
  }
  const tablePosId = typeof body.tablePosId === 'string' && body.tablePosId ? body.tablePosId : null

  const prev = await Reservation.findOne({ _id: id, tenantId: ctx.tenantId, locationId: ctx.locationId }).lean<ReservationDoc>()
  if (!prev) throw PosError.notFound('Reserva no encontrada')
  if (prev.status !== 'confirmed') {
    throw PosError.conflict('Solo se opera una reserva confirmada (la seña o la confirmación se gestionan en el panel)')
  }

  const set: Record<string, unknown> = {}
  try {
    if (action === 'assign') {
      if (!tablePosId) throw PosError.validation('Elegí la mesa a reservar')
      set.tablePosId = await assignReservationTable(prev, tablePosId)
    } else if (action === 'unassign') {
      await releaseReservationTable(prev)
      set.tablePosId = null
    } else if (action === 'seat') {
      set.tablePosId = await seatReservationTable(prev, tablePosId)
      set.status = 'seated'
    } else {
      await releaseReservationTable(prev)
      set.status = 'no_show'
    }
  } catch (err) {
    if (err instanceof TableLinkError) {
      throw err.status === 404 ? PosError.notFound(err.message) : PosError.conflict(err.message)
    }
    throw err
  }

  const updated = await Reservation.findOneAndUpdate(
    { _id: id, tenantId: ctx.tenantId, status: 'confirmed' },
    { $set: { ...set, acknowledgedAt: new Date() } },
    { new: true }
  ).lean<ReservationDocLike>()
  if (!updated) throw PosError.conflict('La reserva cambió mientras se procesaba la petición')

  await logAudit({
    tenantId: ctx.tenantId,
    action: `pos.reservation.${action}`,
    entity: 'Reservation',
    entityId: id,
    details: { action, tablePosId: set.tablePosId ?? prev.tablePosId ?? null },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ reservation: toPosReservation(updated, await loadSectors(ctx.tenantId, ctx.locationId)) })
})
