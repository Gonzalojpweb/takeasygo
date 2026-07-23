import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import StoreItem from '@/models/StoreItem'
import { NextRequest, NextResponse } from 'next/server'
import { logExploreEvent, generateSessionId } from '@/lib/explore-tracking'
import { checkIsOpenNow } from '@/lib/service-hours'
import { getNowInTimezone } from '@/lib/restaurant-time'

const SEARCH_RADIUS_M = 20000 // 20 km

// ── Tipo del response público (consistente con nearby) ────────────────────────

export interface HomeNearbyTenant {
  id: string
  type: 'network'
  name: string
  slug: string
  tenantSlug: string
  address: string
  lat: number | null
  lng: number | null
  distanceM: number | null
  phone: string
  cuisineTypes: string[]
  openingHours: string
  isOpenNow: boolean | null
  logoUrl?: string
  heroImage: string
  primaryColor?: string
  acceptsOrders: boolean
  estimatedPickupTime: number
  orderModes: string[]
  isOperational: boolean
  // Nuevos campos para Sprint 3
  capacityScore: number | null
  isNew: boolean
  createdAt: string | null
  loyaltyInfo?: {
    hasClub: boolean
    clubName?: string
    hasActivePromo: boolean
    promoTypes: string[]
  }
}

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
      { $limit: 30 },
      {
        $project: {
          _id: 1,
          tenantId: 1,
          name: 1,
          address: 1,
          phone: 1,
          cuisineTypes: 1,
          distanceM: 1,
          geo: 1,
          serviceHours: 1,
          timezone: 1,
          createdAt: 1,
          'settings.acceptsOrders': 1,
          'settings.estimatedPickupTime': 1,
          'settings.orderModes': 1,
        },
      },
    ])

    const tenantIds = nearbyLocations.map(loc => loc.tenantId)

    // 2. Obtener info de los Tenants y sus Marketing QRs
    const tenants = await Tenant.find({
      _id: { $in: tenantIds },
      status: 'active'
    }).select('name slug branding qrPromo loyalty pointsConfig cachedScores isOperational createdAt').lean()

    const activeTenantIds = tenants.map(t => t._id)

    // Construir mapas para enriquecer datos
    const tenantSlugMap = new Map(tenants.map(t => [t._id.toString(), t.slug]))
    const tenantNameMap = new Map(tenants.map(t => [t._id.toString(), t.name]))
    const tenantLogoMap = new Map(tenants.map(t => [t._id.toString(), t.branding?.logoUrl || '']))

    // 3. Obtener Promociones Activas de estos Tenants
    const now = new Date()
    const promotionsRaw = await Promotion.find({
      $or: [
        { scope: 'tenant', tenantId: { $in: activeTenantIds } },
        {
          scope: 'global',
          $or: [
            { targetTenants: { $in: activeTenantIds } },
            { targetTenants: { $size: 0 } },
          ],
        },
      ],
      isActive: true,
      // Filtrar por fechas programadas
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
      ],
    }).sort({ isFeatured: -1, sortOrder: 1 }).limit(10).lean()

    const promotions = promotionsRaw.flatMap(p => {
      if (p.scope === 'global') {
        const applicableTenantIds = p.targetTenants && p.targetTenants.length > 0
          ? p.targetTenants.filter((tid: any) => activeTenantIds.some((atid: any) => atid.equals(tid)))
          : activeTenantIds
        return applicableTenantIds.map((tid: any) => ({
          ...p,
          tenantId: tid,
          tenantSlug: tenantSlugMap.get(tid.toString()) || '',
          tenantLogo: tenantLogoMap.get(tid.toString()) || '',
          tenantName: tenantNameMap.get(tid.toString()) || '',
        }))
      }
      return [{
        ...p,
        tenantSlug: tenantSlugMap.get(p.tenantId?.toString() || '') || '',
        tenantLogo: tenantLogoMap.get(p.tenantId?.toString() || '') || '',
        tenantName: tenantNameMap.get(p.tenantId?.toString() || '') || '',
      }]
    })

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

    // 6. Mapa de promos por tenant (para loyaltyInfo)
    //    Incluir filtro de franja horaria (activeTimeStart/End) con timezone real

    // 6a. Mapa de tenantId → timezone (desde nearbyLocations)
    const tenantTimezoneMap = new Map<string, string>()
    nearbyLocations.forEach(loc => {
      if (loc.tenantId && loc.timezone) {
        tenantTimezoneMap.set(loc.tenantId.toString(), loc.timezone)
      }
    })

    // 6b. Construir promosByTenantMap con filtro de franja horaria
    const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'
    const promosByTenantMap = new Map<string, string[]>()
    let tzFallbackCount = 0
    let tzMatchCount = 0
    let filteredByTimeWindow = 0

    promotions.forEach(p => {
      const tid = p.tenantId?.toString()
      if (!tid) return

      // Filtro de franja horaria: si activeTimeStart/End existen,
      // verificar que la hora actual del restaurante esté dentro
      if (p.activeTimeStart && p.activeTimeEnd) {
        const tz = tenantTimezoneMap.get(tid)
        if (tz) {
          tzMatchCount++
        } else {
          tzFallbackCount++
        }
        const { minutes: nowMinutes } = getNowInTimezone(tz || DEFAULT_TZ)
        const [startH, startM] = p.activeTimeStart.split(':').map(Number)
        const [endH, endM] = p.activeTimeEnd.split(':').map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM
        if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
          filteredByTimeWindow++
          return // promo fuera de la franja horaria
        }
      }

      const types = promosByTenantMap.get(tid) || []
      if (!types.includes(p.type)) types.push(p.type)
      promosByTenantMap.set(tid, types)
    })

    // TODO: Temporal — eliminar después de validar en producción
    if (promotions.some(p => p.activeTimeStart || p.activeTimeEnd)) {
      console.log('[home/timezone-validation]', {
        totalPromosWithTimeWindow: promotions.filter(p => p.activeTimeStart || p.activeTimeEnd).length,
        tzMatchCount,
        tzFallbackCount,
        filteredByTimeWindow,
        promosByTenantMapSize: promosByTenantMap.size,
      })
    }

    // 7. Estructurar campañas de Marketing QR activas
    const marketingCampaigns = tenants
      .filter(t => t.qrPromo?.isEnabled)
      .map(t => ({
        tenantId: t._id,
        tenantName: t.name,
        tenantSlug: t.slug,
        ...t.qrPromo
      }))
      .slice(0, 8)

    // 8. Enriquecer los resultados de Locales (Network)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const featuredTenants = tenants.map(t => {
      const loc = nearbyLocations.find(l => l.tenantId.toString() === t._id.toString())
      if (!loc) return null

      // isOpenNow: calcular desde serviceHours
      const tz = loc.timezone || 'America/Argentina/Buenos_Aires'
      const isOpenNow = checkIsOpenNow(loc.serviceHours, 'takeaway', tz)
        ?? checkIsOpenNow(loc.serviceHours, 'dineIn', tz)
        ?? checkIsOpenNow(loc.serviceHours, 'delivery', tz)
        ?? null

      // capacityScore: desde cachedScores del tenant
      const capacityScore = t.cachedScores?.capacityScore ?? null

      // loyaltyInfo: club + promos activas
      const hasClub = t.loyalty?.enabled === true
      const tenantIdStr = t._id.toString()
      const promoTypes = promosByTenantMap.get(tenantIdStr)
      const hasActivePromo = !!promoTypes && promoTypes.length > 0

      // isNew: creado en los últimos 30 días (usar Tenant.createdAt, no Location)
      const createdAt = t.createdAt ? new Date(t.createdAt) : null
      const isNew = createdAt ? createdAt >= thirtyDaysAgo : false

      return {
        id: loc._id.toString(),
        type: 'network',
        name: t.name,
        slug: t.slug,
        tenantSlug: t.slug,
        address: loc.address,
        lat: loc.geo?.coordinates?.[1] ?? null,
        lng: loc.geo?.coordinates?.[0] ?? null,
        distanceM: loc.distanceM ? Math.round(loc.distanceM) : null,
        phone: loc.phone ?? '',
        cuisineTypes: loc.cuisineTypes || [],
        openingHours: '',
        isOpenNow,
        logoUrl: t.branding?.logoUrl,
        heroImage: t.branding?.logoUrl ?? '',
        primaryColor: t.branding?.primaryColor,
        acceptsOrders: loc.settings?.acceptsOrders ?? true,
        estimatedPickupTime: loc.settings?.estimatedPickupTime ?? 20,
        orderModes: loc.settings?.orderModes ?? ['takeaway'],
        isOperational: t.isOperational ?? true,
        capacityScore,
        isNew,
        createdAt: createdAt?.toISOString() ?? null,
        ...(hasClub || hasActivePromo ? {
          loyaltyInfo: {
            hasClub,
            clubName: t.loyalty?.clubName || null,
            hasActivePromo,
            promoTypes: promoTypes || [],
          },
        } : {}),
      }
    }).filter(Boolean)
      .sort((a, b) => ((a as any).distanceM || 99999) - ((b as any).distanceM || 99999)) as any[]

    logExploreEvent({
      sessionId: request.headers.get('x-session-id') || generateSessionId(),
      eventType: 'pageview',
      view: 'home',
      coordinates: { lat, lng },
      request,
    })

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
