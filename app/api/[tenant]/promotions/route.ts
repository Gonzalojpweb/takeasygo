import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const isActive = searchParams.get('isActive')
    const visibility = searchParams.get('visibility')

    const tenantId = tenant._id

    // Tenant-specific promotions
    const tenantPromos: any = { scope: 'tenant', tenantId }

    // Legacy promotions without scope field
    const legacyPromos: any = { scope: { $exists: false }, tenantId }

    // Global promotions targeting this tenant (or all tenants)
    const globalPromos: any = {
      scope: 'global',
      $or: [
        { targetTenants: tenantId },
        { targetTenants: { $size: 0 } },
      ],
    }

    if (locationId) {
      tenantPromos.$or = [
        { locationId: null },
        { locationId },
      ]
    }

    if (isActive !== null) {
      tenantPromos.isActive = isActive === 'true'
      globalPromos.isActive = isActive === 'true'
    }

    if (visibility) {
      tenantPromos.visibility = visibility
      globalPromos.visibility = visibility
    }

    const promotions = await Promotion.find({
      $or: [tenantPromos, legacyPromos, globalPromos],
    }).sort({ sortOrder: 1, createdAt: -1 })

    return NextResponse.json({ promotions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()

    // Validar precio requerido solo para tipo sale
    if (body.type === 'sale') {
      if (body.price === undefined || body.price === null || body.price < 0) {
        return NextResponse.json({ error: 'El precio es obligatorio para promociones de venta' }, { status: 400 })
      }
    }

    const promotion = await Promotion.create({
      ...body,
      tenantId: tenant._id,
    })

    logAudit({ 
      tenantId: tenant._id.toString(), 
      action: 'promotion.created', 
      entity: 'promotion', 
      details: { promotionId: promotion._id, title: promotion.title }, 
      request 
    })

    return NextResponse.json({ promotion }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}