import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import Rating from '@/models/Rating'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { checkIsOpenNow } from '@/lib/service-hours'
import { logExploreEvent, generateSessionId } from '@/lib/explore-tracking'

const DEFAULT_RADIUS_M = 20000 // 20 km
const MAX_RADIUS_M     = 50000 // 50 km — techo de seguridad
const MAX_RESULTS      = 20    // por colección

// ── Tipos del response público ───────────────────────────────────────────────

export type ServiceSlot = { days: number[]; open: string; close: string }

export interface NearbyRestaurant {
  id: string
  type: 'network' | 'listed'
  name: string
  address: string
  lat: number
  lng: number
  distanceM: number
  phone: string
  cuisineTypes: string[]
  openingHours: string
  isOpenNow: boolean | null    // null = sin horarios estructurados (directorio)
  serviceHours?: { takeaway: ServiceSlot[] }
  // Solo en type = 'network'
  tenantSlug?: string
  tenantName?: string
  logoUrl?: string
  heroImage?: string
  primaryColor?: string
  acceptsOrders?: boolean
  estimatedPickupTime?: number
  orderModes?: string[]
  isOperational?: boolean
  // Ratings
  averageRating?: number | null
  ratingCount?: number
  // Solo en type = 'listed'
  externalMenuUrl?: string
  status?: string
  // Algoritmo de visibilidad (solo network, interno)
  visibilityScore?: number
  // Layer 4 — Loyalty Discovery
  loyaltyInfo?: {
    hasClub: boolean
    clubName?: string
    hasActivePromo: boolean
    promoTypes?: string[]
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const lat    = parseFloat(searchParams.get('lat') ?? '')
    const lng    = parseFloat(searchParams.get('lng') ?? '')
    const radius = Math.min(
      parseInt(searchParams.get('radius') ?? String(DEFAULT_RADIUS_M), 10),
      MAX_RADIUS_M
    )

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Se requieren parámetros lat y lng válidos' },
        { status: 400 }
      )
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Coordenadas fuera de rango' },
        { status: 400 }
      )
    }

    await connectDB()
    // Garantiza que los índices 2dsphere existan antes de ejecutar $geoNear
    await Promise.all([
      Location.createIndexes(),
      RestaurantDirectory.createIndexes(),
    ])

    const geoNearStage = {
      $geoNear: {
        near: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] },
        distanceField: 'distanceM',
        maxDistance: radius,
        spherical: true,
        query: {},
      },
    }

    // ── In-network: Location con networkVisible=true ─────────────────────────
    let networkRaw: any[] = []
    try {
      networkRaw = await Location.aggregate([
        {
          $geoNear: {
            ...geoNearStage.$geoNear,
            query: { isActive: true, networkVisible: true },
          },
        },
        { $limit: MAX_RESULTS },
        {
          $lookup: {
            from: 'tenants',
            localField: 'tenantId',
            foreignField: '_id',
            as: 'tenant',
          },
        },
        { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: false } },
        { $match: { 'tenant.status': 'active' } },
        {
          $project: {
            _id: 1,
            name: 1,
            address: 1,
            distanceM: 1,
            phone: 1,
            cuisineTypes: 1,
            serviceHours: 1,
            'geo.coordinates': 1,
            'settings.acceptsOrders': 1,
            'settings.estimatedPickupTime': 1,
            'settings.orderModes': 1,
            'tenant._id': 1,
            'tenant.name': 1,
            'tenant.slug': 1,
            'tenant.branding.logoUrl': 1,
            'tenant.branding.primaryColor': 1,
            'tenant.loyalty.enabled': 1,
            'tenant.loyalty.clubName': 1,
            'tenant.cachedScores.icoScore': 1,
            'tenant.cachedScores.capacityScore': 1,
            'tenant.isOperational': 1,
          },
        },
      ])
    } catch (e) {
      console.error('[explore/nearby] network query failed:', e)
    }

    // ── Ratings: aggregate average per tenant ────────────────────────────────
    const tenantIdsForRatings = networkRaw.map((loc: any) => loc.tenant?._id).filter(Boolean)
    let ratingsMap: Record<string, { avg: number; count: number }> = {}
    if (tenantIdsForRatings.length > 0) {
      try {
        const ratingAggs = await Rating.aggregate([
          { $match: { tenantId: { $in: tenantIdsForRatings } } },
          { $group: { _id: '$tenantId', avg: { $avg: '$stars' }, count: { $sum: 1 } } },
        ])
        ratingAggs.forEach((r: any) => {
          ratingsMap[r._id.toString()] = { avg: Math.round(r.avg * 10) / 10, count: r.count }
        })
      } catch (e) {
        console.error('[explore/nearby] ratings aggregation failed:', e)
      }
    }

    // ── Promotions: active promos per tenant ────────────────────────────────
    const promosMap: Record<string, { hasPromo: boolean; types: string[] }> = {}
    if (tenantIdsForRatings.length > 0) {
      try {
        const promoAggs = await Promotion.aggregate([
          { $match: { tenantId: { $in: tenantIdsForRatings }, isActive: true } },
          { $group: { _id: '$tenantId', types: { $addToSet: '$type' } } },
        ])
        promoAggs.forEach((p: any) => {
          promosMap[p._id.toString()] = { hasPromo: true, types: p.types }
        })
      } catch (e) {
        console.error('[explore/nearby] promos aggregation failed:', e)
      }
    }

    // ── Directorio: RestaurantDirectory listados o reclamados ────────────────
    let directoryRaw: any[] = []
    try {
      directoryRaw = await RestaurantDirectory.aggregate([
        {
          $geoNear: {
            ...geoNearStage.$geoNear,
            query: { status: { $in: ['listed', 'claimed', 'converted'] } },
          },
        },
        { $limit: MAX_RESULTS },
        {
          $project: {
            _id: 1,
            name: 1,
            address: 1,
            distanceM: 1,
            phone: 1,
            cuisineTypes: 1,
            openingHours: 1,
            externalMenuUrl: 1,
            status: 1,
            'geo.coordinates': 1,
          },
        },
      ])
    } catch (e) {
      console.error('[explore/nearby] directory query failed:', e)
    }

    // ── Normalizar a NearbyRestaurant ────────────────────────────────────────

    const networkResults: NearbyRestaurant[] = networkRaw.map(loc => {
      const distanceM = Math.round(loc.distanceM)
      const estimatedPickupTime: number = loc.settings?.estimatedPickupTime ?? 20
      const acceptsOrders: boolean = loc.settings?.acceptsOrders ?? true
      const isOpenNow = checkIsOpenNow(loc.serviceHours)

      // ── Visibility Algorithm (Etapa 17) ──────────────────────────────────────
      // Score ∈ [0, 1], higher = shown first
      // Weights: distance 0.35 | prep_time 0.30 | capacity 0.20 | ICO 0.15
      const distScore     = 1 - Math.min(distanceM, radius) / radius
      const prepScore     = Math.max(0, 1 - Math.max(0, estimatedPickupTime - 5) / 55)
      const capacityScore: number = loc.tenant?.cachedScores?.capacityScore ?? 0.5  // neutral default
      const icoNorm: number       = loc.tenant?.cachedScores?.icoScore != null
        ? (loc.tenant.cachedScores.icoScore as number) / 100
        : 0.5  // neutral default
      // Penalizar si no acepta pedidos o está cerrado
      const penalty = (!acceptsOrders ? -0.15 : 0) + (isOpenNow === false ? -0.10 : 0)
      const visibilityScore = Math.max(0,
        distScore * 0.35 + prepScore * 0.30 + capacityScore * 0.20 + icoNorm * 0.15 + penalty
      )

      const tenantRatings = ratingsMap[loc.tenant?._id?.toString()] ?? null
      const tenantIdStr = loc.tenant?._id?.toString()
      const tenantPromo = tenantIdStr ? promosMap[tenantIdStr] : undefined
      const hasClub = loc.tenant?.loyalty?.enabled === true

      return {
        id: loc._id.toString(),
        type: 'network',
        name: loc.tenant?.name ?? loc.name,
        address: loc.address,
        lat: loc.geo?.coordinates?.[1] ?? lat,
        lng: loc.geo?.coordinates?.[0] ?? lng,
        distanceM,
        phone: loc.phone ?? '',
        cuisineTypes: loc.cuisineTypes ?? [],
        openingHours: '',
        isOpenNow,
        serviceHours: loc.serviceHours,
        tenantSlug: loc.tenant?.slug,
        tenantName: loc.tenant?.name,
        logoUrl: loc.tenant?.branding?.logoUrl ?? '',
        heroImage: loc.tenant?.branding?.logoUrl ?? '',
        primaryColor: loc.tenant?.branding?.primaryColor || '#f74211',
        acceptsOrders,
        estimatedPickupTime,
        orderModes: loc.settings?.orderModes ?? ['takeaway'],
        isOperational: loc.tenant?.isOperational ?? true,
        averageRating: tenantRatings ? tenantRatings.avg : null,
        ratingCount: tenantRatings ? tenantRatings.count : 0,
        visibilityScore,
        loyaltyInfo: hasClub || tenantPromo?.hasPromo ? {
          hasClub,
          clubName: loc.tenant?.loyalty?.clubName,
          hasActivePromo: tenantPromo?.hasPromo ?? false,
          promoTypes: tenantPromo?.types,
        } : undefined,
      }
    })

    const directoryResults: NearbyRestaurant[] = directoryRaw.map(entry => ({
      id: entry._id.toString(),
      type: 'listed',
      name: entry.name,
      address: entry.address,
      lat: entry.geo?.coordinates?.[1] ?? lat,
      lng: entry.geo?.coordinates?.[0] ?? lng,
      distanceM: Math.round(entry.distanceM),
      phone: entry.phone ?? '',
      cuisineTypes: entry.cuisineTypes ?? [],
      openingHours: entry.openingHours ?? '',
      isOpenNow: null, // horarios en texto libre, no parseable
      externalMenuUrl: entry.externalMenuUrl ?? '',
      status: entry.status,
    }))

    // ── Merge + ordenar por Visibility Algorithm ─────────────────────────────
    // Network: ordenado por visibilityScore (desc), directorio: por distancia (asc)
    // Red siempre antes que directorio salvo que la distancia sea > 3× la del red más lejano
    const networkSorted = [...networkResults].sort(
      (a, b) => (b.visibilityScore ?? 0) - (a.visibilityScore ?? 0)
    )
    const directorySorted = [...directoryResults].sort(
      (a, b) => a.distanceM - b.distanceM
    )
    const all = [...networkSorted, ...directorySorted]

    const searchQuery = request.nextUrl.searchParams.get('q') || undefined

    logExploreEvent({
      sessionId: request.headers.get('x-session-id') || generateSessionId(),
      eventType: 'search',
      view: 'list',
      searchQuery: searchQuery ?? null,
      filters: { cuisine: null, openNow: null, radius },
      coordinates: { lat, lng },
      request,
      metadata: { totalResults: all.length, networkCount: networkResults.length },
    })

    return NextResponse.json({
      restaurants: all,
      meta: {
        lat,
        lng,
        radiusM: radius,
        total: all.length,
        network: networkResults.length,
        listed: directoryResults.length,
      },
    })
  } catch (error) {
    console.error('[explore/nearby]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
