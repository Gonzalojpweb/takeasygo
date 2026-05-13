import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import StoreItem from '@/models/StoreItem'
import { NextRequest, NextResponse } from 'next/server'

const SEARCH_RADIUS_M = 20000 // 20 km

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat') ?? '')
    const lng = parseFloat(searchParams.get('lng') ?? '')

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'Ubicación requerida' }, { status: 400 })
    }

    await connectDB()

    // 1. Encontrar Tenants cercanos (Network)
    // Primero obtenemos los IDs de las ubicaciones en rango
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

    // 2. Obtener info de los Tenants y sus Marketing QRs
    const tenants = await Tenant.find({
      _id: { $in: tenantIds },
      status: 'active'
    }).select('name slug branding qrPromo loyalty pointsConfig').lean()

    const activeTenantIds = tenants.map(t => t._id)

    // Construir mapa slug para enriquecer datos
    const tenantSlugMap = new Map(tenants.map(t => [t._id.toString(), t.slug]))
    const tenantNameMap = new Map(tenants.map(t => [t._id.toString(), t.name]))

    // 3. Obtener Promociones Activas de estos Tenants
    const promotionsRaw = await Promotion.find({
      tenantId: { $in: activeTenantIds },
      isActive: true
    }).sort({ isFeatured: -1, sortOrder: 1 }).limit(10).lean()

    const promotions = promotionsRaw.map(p => ({
      ...p,
      tenantSlug: tenantSlugMap.get(p.tenantId.toString()) || '',
    }))

    // 4. Obtener Canjes de Fidelización (Store Items)
    const redemptionsRaw = await StoreItem.find({
      tenantId: { $in: activeTenantIds },
      isActive: true
    }).sort({ isFeatured: -1, sortOrder: 1 }).limit(10).lean()

    const redemptions = redemptionsRaw.map(r => ({
      ...r,
      tenantSlug: tenantSlugMap.get(r.tenantId.toString()) || '',
      tenantName: tenantNameMap.get(r.tenantId.toString()) || '',
    }))

    // 5. Extraer Categorías Únicas de los Tenants cercanos
    const categoriesSet = new Set<string>()
    nearbyLocations.forEach(loc => {
      if (loc.cuisineTypes) {
        loc.cuisineTypes.forEach((c: string) => categoriesSet.add(c))
      }
    })
    const categories = Array.from(categoriesSet).slice(0, 12)

    // 6. Estructurar campañas de Marketing QR activas
    const marketingCampaigns = tenants
      .filter(t => t.qrPromo?.isEnabled)
      .map(t => ({
        tenantId: t._id,
        tenantName: t.name,
        tenantSlug: t.slug,
        ...t.qrPromo
      }))
      .slice(0, 8)

    // 7. Enriquecer los resultados de Locales (Network)
    const featuredTenants = tenants.map(t => {
      const loc = nearbyLocations.find(l => l.tenantId.toString() === t._id.toString())
      return {
        id: t._id,
        name: t.name,
        slug: t.slug,
        logoUrl: t.branding?.logoUrl,
        primaryColor: t.branding?.primaryColor,
        distanceM: loc?.distanceM ? Math.round(loc.distanceM) : null,
        cuisineTypes: loc?.cuisineTypes || []
      }
    }).sort((a, b) => (a.distanceM || 99999) - (b.distanceM || 99999))

    return NextResponse.json({
      promotions,
      categories,
      marketingCampaigns,
      redemptions,
      nearbyTenants: featuredTenants.slice(0, 10),
      meta: {
        lat,
        lng,
        radiusM: SEARCH_RADIUS_M
      }
    })
  } catch (error) {
    console.error('[GET /api/explore/home]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
