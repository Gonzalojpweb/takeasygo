import { NextResponse } from 'next/server'
import Location from '@/models/Location'
import { posRoute } from '@/lib/pos-online/route'
import { acknowledgeReservations } from '@/lib/reservations/unseen'

// POST /api/[tenant]/pos/reservations/seen — el POS abrió Reservaciones:
// las reservas nuevas de la sede quedan vistas (badge del POS y del SaaS).
export const POST = posRoute('tables.manage', async (ctx) => {
  const location = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId })
    .select('timezone')
    .lean<{ timezone?: string }>()
  const acknowledged = await acknowledgeReservations(ctx.tenantId, { locationId: ctx.locationId }, location?.timezone)
  return NextResponse.json({ acknowledged })
})
