import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { isFlagEnabled, FLAGS } from '@/lib/feature-flags'
import { obtenerEvidencias } from '@/lib/rapiboy/client'
import { rapiboyConfigFromLocation, syncRapiboyTrip } from '@/lib/rapiboy/trips'

/**
 * GET /api/[tenant]/orders/[orderId]/rapiboy-evidence
 *
 * Evidencias de entrega de Rapiboy (quién recibió, foto) para reclamos, más
 * el estado del viaje recién consultado. Solo admin/encargado: las fotos y
 * los datos de quien recibe son personales; no se guardan, se consultan.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('locationId deliveryProvider status')
      .lean() as any
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    if (isFlagEnabled(tenant, FLAGS.RBAC_SEDE_SCOPE)) {
      const user = await getSessionUser(request)
      const userLocs = (user?.assignedLocations ?? []).map(l => String(l))
      if (userLocs.length > 0 && order.locationId && !userLocs.includes(String(order.locationId))) {
        return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
      }
    }

    const tripId = order.deliveryProvider?.type === 'rapiboy' ? order.deliveryProvider?.rapiboy?.tripId : null
    if (!tripId) return NextResponse.json({ error: 'El pedido no tiene viaje de Rapiboy' }, { status: 404 })

    const location = await Location.findOne({ _id: order.locationId, tenantId: tenant._id }).select('rapiboyConfig').lean() as any
    const cfg = location ? rapiboyConfigFromLocation(location) : null
    if (!cfg) return NextResponse.json({ error: 'Rapiboy no está configurado en la sede' }, { status: 409 })

    const synced = await syncRapiboyTrip(order._id, tenant._id).catch(() => null)
    const r = (synced?.deliveryProvider?.rapiboy ?? order.deliveryProvider.rapiboy) as any

    let evidencias: Awaited<ReturnType<typeof obtenerEvidencias>> = []
    try {
      evidencias = await obtenerEvidencias(tripId, cfg)
    } catch (e: any) {
      // Rapiboy responde 400 si todavía no hay evidencias: no es un error del panel.
      console.warn(`[rapiboy-evidence] ${e?.message}`)
    }

    return NextResponse.json({
      tripId,
      estado: r?.estado ?? null,
      estadoNombre: r?.estadoNombre ?? '',
      phase: r?.phase ?? null,
      driverName: r?.driverName ?? '',
      trackingUrl: r?.trackingUrl ?? '',
      evidencias,
    })
  } catch (error) {
    console.error('[rapiboy-evidence]', (error as Error)?.message)
    return NextResponse.json({ error: 'Error al consultar Rapiboy' }, { status: 500 })
  }
}
