import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import Rating from '@/models/Rating'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { checkIsOpenNow } from '@/lib/service-hours'
import { logExploreEvent, generateSessionId } from '@/lib/explore-tracking'
import { rateLimit } from '@/lib/rateLimit'
import type { RestaurantCardData } from '@/types/restaurant-card'

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
  isDeliveryOpen?: boolean | null
  deliveryEnabled?: boolean
  serviceHours?: { takeaway: ServiceSlot[]; delivery?: ServiceSlot[] }
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
  description?: string
  heroImageUrl?: string
  website?: string
  instagram?: string
  facebook?: string
  // Algoritmo de visibilidad (solo network, interno)
  visibilityScore?: number
  // isNew: tenant creado en últimos 30 días
  isNew?: boolean
  // Layer 4 — Loyalty Discovery
  loyaltyInfo?: {
    hasClub: boolean
    clubName?: string
    hasActivePromo: boolean
    promoTypes?: string[]
  }
}

// ── Mapper: NearbyRestaurant → RestaurantCardData ─────────────────────────────

function toRestaurantCardData(r: NearbyRestaurant): RestaurantCardData {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    tenantSlug: r.tenantSlug,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    distanceM: r.distanceM,
    phone: r.phone,
    cuisineTypes: r.cuisineTypes,
    heroImage: r.heroImage ?? r.logoUrl ?? '',
    logoUrl: r.logoUrl,
    primaryColor: r.primaryColor,
    isOpenNow: r.isOpenNow,
    isDeliveryOpen: r.isDeliveryOpen,
    deliveryEnabled: r.deliveryEnabled,
    isOperational: r.isOperational ?? true,
    acceptsOrders: r.acceptsOrders ?? true,
    estimatedPickupTime: r.estimatedPickupTime ?? 20,
    orderModes: r.orderModes ?? ['takeaway'],
    averageRating: r.averageRating,
    ratingCount: r.ratingCount,
    serviceHours: r.serviceHours,
    openingHours: r.openingHours,
    externalMenuUrl: r.externalMenuUrl,
    description: r.description,
    heroImageUrl: r.heroImageUrl,
    website: r.website,
    instagram: r.instagram,
    facebook: r.facebook,
    loyaltyInfo: r.loyaltyInfo ? {
      ...r.loyaltyInfo,
      promoTypes: r.loyaltyInfo.promoTypes ?? [],
    } : undefined,
    isNew: r.isNew ?? false,
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit(`explore-nearby:${ip}`, 30, 60_000)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

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
            timezone: 1,
            'geo.coordinates': 1,
            'settings.acceptsOrders': 1,
            'settings.estimatedPickupTime': 1,
            'settings.orderModes': 1,
            deliveryConfig: 1,
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
            'tenant.createdAt': 1,
          },
        },
      ])
    } catch (e) {
      console.error('[explore/nearby] network query failed:', e)
    }

    // ── AlwaysVisible tenants — their locations regardless of distance ──────
    const alwaysVisibleTenantDocs = await Tenant.find(
      { alwaysVisible: true, status: 'active' }
    ).select('_id').lean()
    const alwaysVisibleTenantIds = alwaysVisibleTenantDocs.map(t => t._id)

    const nearbyLocationIdSet = new Set(networkRaw.map((l: any) => l._id?.toString()))
    let alwaysVisibleRaw: any[] = []
    if (alwaysVisibleTenantIds.length > 0) {
      try {
        alwaysVisibleRaw = await Location.aggregate([
          {
            $match: {
              isActive: true,
              tenantId: { $in: alwaysVisibleTenantIds },
              _id: { $nin: [...nearbyLocationIdSet].map((id: string) => new mongoose.Types.ObjectId(id)) },
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
              distanceM: { $literal: 0 },
              phone: 1,
              cuisineTypes: 1,
              serviceHours: 1,
              timezone: 1,
              'geo.coordinates': 1,
              'settings.acceptsOrders': 1,
              'settings.estimatedPickupTime': 1,
              'settings.orderModes': 1,
              deliveryConfig: 1,
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
              'tenant.createdAt': 1,
            },
          },
        ])
      } catch (e) {
        console.error('[explore/nearby] alwaysVisible query failed:', e)
      }
    }

    // Merge and deduplicate
    const mergedNetworkRaw = [...networkRaw, ...alwaysVisibleRaw]

    // ── Ratings: aggregate average per tenant ────────────────────────────────
    const tenantIdsForRatings = mergedNetworkRaw.map((loc: any) => loc.tenant?._id).filter(Boolean)
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
            serviceHours: 1,
            externalMenuUrl: 1,
            logoUrl: 1,
            heroImageUrl: 1,
            description: 1,
            website: 1,
            instagram: 1,
            facebook: 1,
            status: 1,
            'geo.coordinates': 1,
          },
        },
      ])
    } catch (e) {
      console.error('[explore/nearby] directory query failed:', e)
    }

    // ── Normalizar a NearbyRestaurant ────────────────────────────────────────

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const networkResults: NearbyRestaurant[] = mergedNetworkRaw.map(loc => {
      const distanceM = Math.round(loc.distanceM)
      const estimatedPickupTime: number = loc.settings?.estimatedPickupTime ?? 20
      const acceptsOrders: boolean = loc.settings?.acceptsOrders ?? true
      const tz = loc.timezone || 'America/Argentina/Buenos_Aires'
      const isOpenNow = checkIsOpenNow(loc.serviceHours, 'takeaway', tz)
        ?? checkIsOpenNow(loc.serviceHours, 'dineIn', tz)
        ?? checkIsOpenNow(loc.serviceHours, 'delivery', tz)
        ?? null

      const isDeliveryOpen = checkIsOpenNow(loc.serviceHours, 'delivery', tz)
      const orderModes = loc.settings?.orderModes ?? ['takeaway']
      const deliveryEnabled = loc.deliveryConfig?.enabled === true || orderModes.includes('delivery')

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
        isDeliveryOpen,
        deliveryEnabled,
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
        isNew: loc.tenant?.createdAt ? new Date(loc.tenant.createdAt) >= thirtyDaysAgo : false,
      }
    })

    const directoryResults: NearbyRestaurant[] = directoryRaw.map(entry => {
      const tz = 'America/Argentina/Buenos_Aires'
      const hasStructuredHours = entry.serviceHours && entry.serviceHours.length > 0
      const isOpenNow = hasStructuredHours
        ? checkIsOpenNow({ takeaway: entry.serviceHours }, 'takeaway', tz) ?? null
        : null

      return {
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
        isOpenNow,
        serviceHours: hasStructuredHours ? { takeaway: entry.serviceHours } : undefined,
        externalMenuUrl: entry.externalMenuUrl ?? '',
        logoUrl: entry.logoUrl ?? '',
        heroImage: entry.heroImageUrl ?? entry.logoUrl ?? '',
        heroImageUrl: entry.heroImageUrl ?? '',
        description: entry.description ?? '',
        website: entry.website ?? '',
        instagram: entry.instagram ?? '',
        facebook: entry.facebook ?? '',
        status: entry.status,
      }
    })

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
      restaurants: all.map(toRestaurantCardData),
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
