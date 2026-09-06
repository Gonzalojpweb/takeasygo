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

    // 1. Nearby locations (normal geo query)
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

    // 2. AlwaysVisible tenants — their locations regardless of distance
    const alwaysVisibleTenants = await Tenant.find(
      { alwaysVisible: true, status: 'active' }
    ).select('_id').lean()
    const alwaysVisibleTenantIds = alwaysVisibleTenants.map(t => t._id)

    const nearbyLocationIds = new Set(nearbyLocations.map(l => l._id.toString()))
    const alwaysVisibleLocations = alwaysVisibleTenantIds.length > 0
      ? await Location.find({
          isActive: true,
          tenantId: { $in: alwaysVisibleTenantIds },
          _id: { $nin: [...nearbyLocationIds] },
        }).limit(30).lean()
      : []

    // 3. Merge and deduplicate
    const allLocations = [...nearbyLocations, ...alwaysVisibleLocations]
    const tenantIds = [...new Set(allLocations.map(l => l.tenantId?.toString()))].filter(Boolean)

    const tenants = await Tenant.find({
      _id: { $in: tenantIds },
      status: 'active'
    }).select('name slug branding').lean()

    const activeTenantIds = tenants.map(t => t._id)

    const tenantSlugMap = new Map(tenants.map(t => [t._id.toString(), t.slug]))
    const tenantNameMap = new Map(tenants.map(t => [t._id.toString(), t.name]))
    const tenantLogoMap = new Map(tenants.map(t => [t._id.toString(), t.branding?.logoUrl || '']))

    const now = new Date()
    const locationIds = allLocations.map(l => l._id)

    const promotionsRaw = await Promotion.find({
      $or: [
        {
          scope: 'tenant',
          tenantId: { $in: activeTenantIds },
          $or: [
            { locationId: null },
            { locationId: { $in: locationIds } },
          ],
        },
        {
          scope: 'global',
          $or: [
            { targetTenants: { $in: activeTenantIds } },
            { targetTenants: { $size: 0 } },
          ],
        },
      ],
      isActive: true,
      $and: [
        {
          $or: [
            { scheduledStart: { $exists: false } },
            { scheduledStart: null },
            { scheduledStart: { $lte: now } },
          ],
        },
        {
          $or: [
            { scheduledEnd: { $exists: false } },
            { scheduledEnd: null },
            { scheduledEnd: { $gte: now } },
          ],
        },
        { $or: [{ maxRedemptions: null }, { maxRedemptions: { $exists: false } }, { $expr: { $lt: ['$redemptionsCount', '$maxRedemptions'] } }] },
      ],
    }).sort({ isFeatured: -1, sortOrder: 1 }).lean()

    const seenGlobalIds = new Set<string>()
    const promotions = promotionsRaw.flatMap(p => {
      if (p.scope === 'global') {
        if (seenGlobalIds.has(p._id.toString())) return []
        seenGlobalIds.add(p._id.toString())

        const applicableTenantIds = p.targetTenants && p.targetTenants.length > 0
          ? p.targetTenants.filter((tid: any) => activeTenantIds.some((atid: any) => atid.equals(tid)))
          : activeTenantIds

        const primaryTenantId = applicableTenantIds[0]
        if (!primaryTenantId) return []

        return [{
          ...p,
          _id: `${p._id}-${primaryTenantId}`,
          originalPromoId: p._id,
          tenantId: primaryTenantId,
          tenantSlug: tenantSlugMap.get(primaryTenantId.toString()) || '',
          tenantLogo: tenantLogoMap.get(primaryTenantId.toString()) || '',
          tenantName: tenantNameMap.get(primaryTenantId.toString()) || '',
        }]
      }
      return [{
        ...p,
        tenantSlug: tenantSlugMap.get(p.tenantId?.toString() || '') || '',
        tenantLogo: tenantLogoMap.get(p.tenantId?.toString() || '') || '',
        tenantName: tenantNameMap.get(p.tenantId?.toString() || '') || '',
      }]
    })

    return NextResponse.json({ promotions }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240' },
    })
  } catch (error) {
    console.error('[GET /api/explore/promotions]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
