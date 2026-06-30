import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { deliveryQuoteSchema } from '@/lib/schemas'
import { rateLimit } from '@/lib/rateLimit'
import { calculateDeliveryCost } from '@/lib/geocode'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    // ── Rate limiting (protege Nominatim de abuso) ─────────────────────────
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const { success } = await rateLimit(`delivery-quote:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Esperá un momento.' }, { status: 429 })
    }

    const { tenant: tenantSlug } = await params
    await connectDB()

    // ── Validar tenant ─────────────────────────────────────────────────────
    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // ── Validar que el plan incluye delivery ───────────────────────────────
    if (!canAccess(tenant.plan as Plan, 'delivery')) {
      return NextResponse.json({ error: 'Delivery no disponible en tu plan actual.' }, { status: 403 })
    }

    // ── Validar body ───────────────────────────────────────────────────────
    const parsed = deliveryQuoteSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dirección inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { locationId, address } = parsed.data

    // ── Validar que la sede existe y tiene delivery habilitado ─────────────
    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true }).lean() as any
    if (!location) {
      return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    }

    const deliveryConfig = location.deliveryConfig || { enabled: false, ranges: [], maxRangeKm: 0 }
    if (!deliveryConfig.enabled) {
      return NextResponse.json({ error: 'El delivery no está habilitado para esta sede.' }, { status: 400 })
    }

    // ── Calcular costo de delivery ─────────────────────────────────────────
    const result = await calculateDeliveryCost(
      tenant._id.toString(),
      locationId,
      address,
    )

    if (result.error && !result.withinRange) {
      return NextResponse.json({
        withinRange: false,
        distance: result.distance,
        cost: 0,
        maxRangeKm: result.maxRangeKm,
        error: result.error,
      })
    }

    return NextResponse.json({
      withinRange: true,
      distance: result.distance,
      cost: result.cost,
      maxRangeKm: result.maxRangeKm,
    })
  } catch (error: any) {
    console.error('[delivery/quote] error:', error)
    return NextResponse.json({ error: 'Error al calcular el costo de envío.' }, { status: 500 })
  }
}
