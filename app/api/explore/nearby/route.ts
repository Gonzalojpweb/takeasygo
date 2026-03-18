import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { NextRequest, NextResponse } from 'next/server'
import { checkIsOpenNow } from '@/lib/service-hours'

const DEFAULT_RADIUS_M = 5000  // 5 km
const MAX_RADIUS_M     = 20000 // 20 km — techo de seguridad
const MAX_RESULTS      = 20    // por colección

// ── Tipos del response público ───────────────────────────────────────────────

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
  // Solo en type = 'network'
  tenantSlug?: string
  tenantName?: string
  logoUrl?: string
  primaryColor?: string
  acceptsOrders?: boolean
  estimatedPickupTime?: number
  orderModes?: string[]
  // Solo en type = 'listed'
  externalMenuUrl?: string
  status?: string
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
            query: { networkVisible: true, isActive: true },
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
        { $match: { 'tenant.isActive': true } },
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
          },
        },
      ])
    } catch (e) {
      console.error('[explore/nearby] network query failed:', e)
    }

    // ── Directorio: RestaurantDirectory listados o reclamados ────────────────
    let directoryRaw: any[] = []
    try {
      directoryRaw = await RestaurantDirectory.aggregate([
        {
          $geoNear: {
            ...geoNearStage.$geoNear,
            query: { status: { $in: ['listed', 'claimed'] } },
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

    const networkResults: NearbyRestaurant[] = networkRaw.map(loc => ({
      id: loc._id.toString(),
      type: 'network',
      name: loc.tenant?.name ?? loc.name,
      address: loc.address,
      lat: loc.geo?.coordinates?.[1] ?? lat,
      lng: loc.geo?.coordinates?.[0] ?? lng,
      distanceM: Math.round(loc.distanceM),
      phone: loc.phone ?? '',
      cuisineTypes: loc.cuisineTypes ?? [],
      openingHours: '',
      isOpenNow: checkIsOpenNow(loc.serviceHours),
      tenantSlug: loc.tenant?.slug,
      tenantName: loc.tenant?.name,
      logoUrl: loc.tenant?.branding?.logoUrl ?? '',
      primaryColor: loc.tenant?.branding?.primaryColor ?? '#000000',
      acceptsOrders: loc.settings?.acceptsOrders ?? true,
      estimatedPickupTime: loc.settings?.estimatedPickupTime ?? 20,
      orderModes: loc.settings?.orderModes ?? ['takeaway'],
    }))

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

    // ── Merge + ordenar por distancia ────────────────────────────────────────
    // Red siempre primero dentro del mismo rango, luego directorio
    const all = [
      ...networkResults,
      ...directoryResults,
    ].sort((a, b) => {
      // In-network tiene prioridad sobre listed a igual distancia (±200m)
      const distDiff = a.distanceM - b.distanceM
      if (Math.abs(distDiff) > 200) return distDiff
      if (a.type === 'network' && b.type === 'listed') return -1
      if (a.type === 'listed' && b.type === 'network') return 1
      return distDiff
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
