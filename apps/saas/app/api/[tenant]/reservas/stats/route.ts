import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Reservation from '@/models/Reservation'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { scopeLocationFilter } from '@/lib/location-scope'
import { DEFAULT_TIMEZONE, addDaysToDateStr, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { applyAutoNoShow } from '@/lib/reservation-no-show'

/**
 * GET /api/[tenant]/reservas/stats?locationId=&days=30
 *
 * Ocupación, no-show y cancelaciones de reservas por sede en una ventana de
 * días hacia atrás (incluye hoy). Alcance: ?locationId= validado o las sedes
 * del usuario; un usuario de tenant ve el consolidado + desglose por sede.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id flags timezone')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const requestedLocationId = request.nextUrl.searchParams.get('locationId')
    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      locationId: requestedLocationId,
      permission: 'reservations.read',
    })
    if (permError) return permError

    const sedeScope = await scopeLocationFilter(request, requestedLocationId)
    if ('error' in sedeScope) return sedeScope.error

    const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 30))
    const today = getTodayStrInTimezone((tenant as { timezone?: string }).timezone || DEFAULT_TIMEZONE)
    const from = addDaysToDateStr(today, -(days - 1))

    // No-show automático (perezoso) antes de calcular.
    await applyAutoNoShow(tenant._id, requestedLocationId ? { _id: requestedLocationId } : {})

    const rows = await Reservation.aggregate<{
      _id: { locationId: unknown; status: string }
      count: number
      covers: number
    }>([
      { $match: { tenantId: tenant._id, ...sedeScope.filter, date: { $gte: from, $lte: today } } },
      {
        $group: {
          _id: { locationId: '$locationId', status: '$status' },
          count: { $sum: 1 },
          covers: { $sum: '$partySize' },
        },
      },
    ])

    type Totals = {
      total: number
      byStatus: Record<string, number>
      /** Comensales que efectivamente vinieron o tienen reserva vigente. */
      covers: number
      noShowRate: number
      cancelRate: number
    }
    const empty = (): Totals => ({ total: 0, byStatus: {}, covers: 0, noShowRate: 0, cancelRate: 0 })
    const finish = (t: Totals) => {
      const seated = t.byStatus.seated ?? 0
      const noShow = t.byStatus.no_show ?? 0
      t.noShowRate = seated + noShow > 0 ? Math.round((noShow / (seated + noShow)) * 1000) / 10 : 0
      t.cancelRate = t.total > 0 ? Math.round(((t.byStatus.cancelled ?? 0) / t.total) * 1000) / 10 : 0
      return t
    }

    const overall = empty()
    const bySede = new Map<string, Totals>()
    for (const row of rows) {
      const key = String(row._id.locationId)
      const sede = bySede.get(key) ?? empty()
      for (const t of [overall, sede]) {
        t.total += row.count
        t.byStatus[row._id.status] = (t.byStatus[row._id.status] ?? 0) + row.count
        if (row._id.status === 'seated' || row._id.status === 'confirmed') t.covers += row.covers
      }
      bySede.set(key, sede)
    }

    return NextResponse.json({
      from,
      to: today,
      days,
      ...finish(overall),
      bySede: [...bySede.entries()].map(([locationId, t]) => ({ locationId, ...finish(t) })),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
