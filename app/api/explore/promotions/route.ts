import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'

const SEARCH_RADIUS_M = 20000

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat') ?? '')
    const lng = parseFloat(searchParams.get('lng') ?? '')

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'Ubicación requerida' }, { status: 400 })
    }

    await connectDB()

    const nearbyLocations = await Location.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceM',
          maxDistance: SEARCH_RADIUS_M,
          spherical: true,
          query: { isActive: true, networkVisible: true },
        },
      },
      { $limit: 30 }
    ])

    const tenantIds = nearbyLocations.map(loc => loc.tenantId)

    const tenants = await Tenant.find({
      _id: { $in: tenantIds },
      status: 'active'
    }).select('name slug branding').lean()

    const activeTenantIds = tenants.map(t => t._id)

    const tenantSlugMap = new Map(tenants.map(t => [t._id.toString(), t.slug]))
    const tenantNameMap = new Map(tenants.map(t => [t._id.toString(), t.name]))
    const tenantLogoMap = new Map(tenants.map(t => [t._id.toString(), t.branding?.logoUrl || '']))

    const promotionsRaw = await Promotion.find({
      tenantId: { $in: activeTenantIds },
      isActive: true
    }).sort({ isFeatured: -1, sortOrder: 1 }).lean()

    const promotions = promotionsRaw.map(p => ({
      ...p,
      tenantSlug: tenantSlugMap.get(p.tenantId.toString()) || '',
      tenantLogo: tenantLogoMap.get(p.tenantId.toString()) || '',
      tenantName: tenantNameMap.get(p.tenantId.toString()) || '',
    }))

    return NextResponse.json({ promotions })
  } catch (error) {
    console.error('[GET /api/explore/promotions]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
