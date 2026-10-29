import { NextResponse } from 'next/server'
import Reservation from '@/models/Reservation'
import Location from '@/models/Location'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { loadSectors } from '@/lib/pos-online/sectors'
import { toPosReservation, type ReservationDocLike } from '@/lib/pos-online/reservations'
import { applyAutoNoShow } from '@/lib/reservation-no-show'
import { countUnseenReservations } from '@/lib/reservations/unseen'
import { DEFAULT_TIMEZONE, getTodayStrInTimezone, isValidCalendarDate } from '@/lib/restaurant-time'

// ============================================================================
// GET /api/[tenant]/pos/reservations?date=YYYY-MM-DD — reservas de la sede
// ============================================================================
// Obs. 24/10: el POS ve las reservas (por defecto, las de HOY en la zona de
// la sede), ordenadas por horario, con su sector y la mesa asignada. Además
// devuelve `unseen`: reservas nuevas sin ver de hoy en adelante (badge).
// Antes de leer aplica el no-show automático (libera mesas reservadas).
// ============================================================================

const VISIBLE = ['pending_payment', 'confirmed', 'waitlist', 'seated', 'no_show', 'cancelled']

// 29/10: reservas = función compartida (packages/business/surfaces): solo
// admin, encargado y caja. 'tables.manage' excluye al mozo.
export const GET = posRoute('tables.manage', async (ctx) => {
  const location = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId })
    .select('timezone')
    .lean<{ timezone?: string }>()
  const tz = location?.timezone || DEFAULT_TIMEZONE
  const requested = new URL(ctx.request.url).searchParams.get('date')
  if (requested && !isValidCalendarDate(requested)) throw PosError.validation('date debe ser YYYY-MM-DD')
  const date = requested ?? getTodayStrInTimezone(tz)

  await applyAutoNoShow(ctx.tenantId, { _id: ctx.locationId })
  const [docs, sectors, unseen] = await Promise.all([
    Reservation.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, date, status: { $in: VISIBLE } })
      .sort({ time: 1 })
      .lean<ReservationDocLike[]>(),
    loadSectors(ctx.tenantId, ctx.locationId),
    countUnseenReservations(ctx.tenantId, { locationId: ctx.locationId }, tz),
  ])

  return NextResponse.json({ date, reservations: docs.map((d) => toPosReservation(d, sectors)), unseen })
})
