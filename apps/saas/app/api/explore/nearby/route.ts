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
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'
import { isFullyOperational } from '@/lib/mercadopago'
import type { RestaurantCardData } from '@/types/restaurant-card'
import Table from '@/models/Table'
import Order from '@/models/Order'
import { getNowInTimezone } from '@/lib/restaurant-time'
import { getMpAccountForLocation } from '@/lib/mercadopago'
import { canChargeWithMercadoPago } from '@/lib/mp-split-guard'
import { resolveTransferAccountForLocation } from '@/lib/location-resolvers'
import { resolveCashConfig } from '@/lib/cash'
import { canAccess, type Plan } from '@/lib/plans'
import {
  distanceMeters,
  openWindow,
  paceFromOrders,
  salonFromTables,
  type CitySignals,
  type TableCounts,
} from '@/lib/city/signals'

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
  // Living City System (LCS) fields
  icoScore?: number | null
  icoRing?: 'none' | 'thin' | 'marked' | 'gold'
  hasCrown?: boolean
  hasWinkOffer?: boolean
  // 100% operativo: MP activo + split OAuth vigente (solo type = 'network')
  isFullOperational?: boolean
  /** Señales de la ciudad (solo type = 'network'). Ver lib/city/signals. */
  signals?: CitySignals
}

/** Título de promo listo para mostrar: corto y sin gritar en mayúsculas. */
function tidyPromoTitle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let title = raw.trim().replace(/\s+/g, ' ')
  if (!title) return ''
  const letters = title.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length
  // Mayoría en mayúsculas («2x1 ESTO NO SE REPITE») = está gritando.
  if (letters.length >= 4 && upper / letters.length >= 0.7) {
    const lower = title.toLowerCase()
    title = lower.replace(/(^|[^a-z0-9áéíóúüñ])([a-záéíóúüñ])/, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
  }
  return title.length > 44 ? `${title.slice(0, 43).trimEnd()}…` : title
}

function getIcoRing(icoScore: number | null | undefined): 'none' | 'thin' | 'marked' | 'gold' {
  if (icoScore == null) return 'none'
  if (icoScore >= 85) return 'gold'
  if (icoScore >= 70) return 'marked'
  if (icoScore >= 50) return 'thin'
  return 'none'
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
    icoScore: r.icoScore,
    icoRing: r.icoRing,
    hasCrown: r.hasCrown,
    hasWinkOffer: r.hasWinkOffer,
    isFullOperational: r.isFullOperational,
    signals: r.signals,
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
            'settings.cash': 1,
            'settings.mpAccountId': 1,
            'settings.transferAccountId': 1,
            'settings.delayAnnouncement': 1,
            'reservationConfig.enabled': 1,
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
            'tenant.isActive': 1,
            'tenant.status': 1,
            'tenant.onboarding.status': 1,
            'tenant.createdAt': 1,
          },
        },
      ])
    } catch (e) {
      console.error('[explore/nearby] network query failed:', e)
    }

    // ── AlwaysVisible tenants — their locations regardless of distance ──────
    // `status: 'active'` se mantiene como pre-filtro (Explore nunca mostró
    // tenants pausados); la decisión de visibilidad la da el gate centralizado.
    const alwaysVisibleTenantDocs = await Tenant.find(
      { alwaysVisible: true, status: 'active' }
    ).select('_id isActive status onboarding').lean()
    const alwaysVisibleTenantIds = alwaysVisibleTenantDocs
      .filter(isTenantPubliclyOperational)
      .map(t => t._id)

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
              'settings.cash': 1,
              'settings.mpAccountId': 1,
              'settings.transferAccountId': 1,
              'settings.delayAnnouncement': 1,
              'reservationConfig.enabled': 1,
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
              'tenant.isActive': 1,
              'tenant.status': 1,
              'tenant.onboarding.status': 1,
              'tenant.createdAt': 1,
            },
          },
        ])
      } catch (e) {
        console.error('[explore/nearby] alwaysVisible query failed:', e)
      }
    }

    // Merge and deduplicate — gate centralizado: única decisión de visibilidad
    const mergedNetworkRaw = [...networkRaw, ...alwaysVisibleRaw]
      .filter(loc => isTenantPubliclyOperational(loc.tenant))

    // ── Estado de cobro: MP activo + split OAuth vigente (100% operativo) ────
    // Los tokens cifrados se leen server-side solo para derivar el boolean;
    // jamás salen en la respuesta.
    const payMap = new Map<string, boolean>()
    // Medios de pago por comercio (para las señales de la ciudad). Mismo
    // criterio: se lee el documento server-side y solo salen booleanos.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payTenantMap = new Map<string, any>()
    {
      const payTenantIds = mergedNetworkRaw
        .map((loc: { tenant?: { _id?: mongoose.Types.ObjectId } }) => loc.tenant?._id)
        .filter((id): id is mongoose.Types.ObjectId => !!id)
      if (payTenantIds.length > 0) {
        try {
          const payDocs = await Tenant.find({ _id: { $in: payTenantIds } })
            .select('mercadopago mpOAuth mpAccounts mpSplitGuard mpMode flags plan features.cashPaymentEnabledBySuperadmin cash transfer transferAccounts paymentMethodsVisibility')
            .lean()
          for (const doc of payDocs) {
            payMap.set(doc._id.toString(), isFullyOperational(doc))
            payTenantMap.set(doc._id.toString(), doc)
          }
        } catch (e) {
          console.error('[explore/nearby] mp status query failed:', e)
        }
      }
    }

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

    // ── Promotions: active promos per tenant (filtered by locationId, scope, redemptions) ─
    const promosMap: Record<string, { hasPromo: boolean; types: string[]; titles: string[] }> = {}
    try {
      const now = new Date()
      const locationIds = mergedNetworkRaw.map((l: any) => l._id).filter(Boolean)
      const tenantIds = mergedNetworkRaw.map((l: any) => l.tenant?._id).filter(Boolean)

      // Tenant-scoped promos: applies to specific location or all locations of the tenant
      const tenantPromos = await Promotion.find({
        scope: 'tenant',
        tenantId: { $in: tenantIds },
        isActive: true,
        $or: [
          { locationId: null },
          { locationId: { $in: locationIds } },
        ],
        $and: [
          { $or: [{ scheduledStart: { $exists: false } }, { scheduledStart: null }, { scheduledStart: { $lte: now } }] },
          { $or: [{ scheduledEnd: { $exists: false } }, { scheduledEnd: null }, { scheduledEnd: { $gte: now } }] },
          { $or: [{ maxRedemptions: null }, { maxRedemptions: { $exists: false } }, { $expr: { $lt: ['$redemptionsCount', '$maxRedemptions'] } }] },
        ],
      }).lean()

      // Global promos: applies to all active tenants or specific targetTenants
      const globalPromos = await Promotion.find({
        scope: 'global',
        isActive: true,
        $or: [
          { targetTenants: { $size: 0 } },
          { targetTenants: { $in: tenantIds } },
        ],
        $and: [
          { $or: [{ scheduledStart: { $exists: false } }, { scheduledStart: null }, { scheduledStart: { $lte: now } }] },
          { $or: [{ scheduledEnd: { $exists: false } }, { scheduledEnd: null }, { scheduledEnd: { $gte: now } }] },
          { $or: [{ maxRedemptions: null }, { maxRedemptions: { $exists: false } }, { $expr: { $lt: ['$redemptionsCount', '$maxRedemptions'] } }] },
        ],
      }).lean()

      // Build promosMap: group by tenantId → { hasPromo, types }
      const allPromos = [...tenantPromos, ...globalPromos]
      for (const promo of allPromos) {
        const tid = promo.tenantId?.toString()
        if (!tid) continue

        // For global promos, determine which tenantId to use
        const effectiveTenantId = promo.scope === 'global'
          ? (promo.targetTenants && promo.targetTenants.length > 0
              ? promo.targetTenants.find((t: any) => tenantIds.some((tid: any) => tid.toString() === t.toString()))?.toString()
              : tid)
          : tid

        if (!effectiveTenantId) continue

        // Solo las promos de venta cuentan como oferta para la ciudad; los
        // anuncios y mensajes del club no son una oportunidad de compra.
        const promoTitle = promo.type === 'sale' ? tidyPromoTitle(promo.title) : ''
        if (!promosMap[effectiveTenantId]) {
          promosMap[effectiveTenantId] = { hasPromo: true, types: [promo.type], titles: promoTitle ? [promoTitle] : [] }
        } else {
          if (promoTitle && !promosMap[effectiveTenantId].titles.includes(promoTitle)) {
            promosMap[effectiveTenantId].titles.push(promoTitle)
          }
          promosMap[effectiveTenantId].hasPromo = true
          if (!promosMap[effectiveTenantId].types.includes(promo.type)) {
            promosMap[effectiveTenantId].types.push(promo.type)
          }
        }
      }
    } catch (e) {
      console.error('[explore/nearby] promos aggregation failed:', e)
    }

    // ── Señales vivas: salón (mesas del POS) y ritmo de pedidos ─────────────
    // Solo salen niveles agregados por sede; nunca pedidos ni clientes.
    const signalLocationIds = mergedNetworkRaw.map((l: any) => l._id).filter(Boolean)
    const signalTenantIds = mergedNetworkRaw.map((l: any) => l.tenant?._id).filter(Boolean)
    const tablesMap = new Map<string, TableCounts>()
    const paceMap = new Map<string, number>()
    if (signalLocationIds.length > 0) {
      try {
        const tableAggs = await Table.aggregate([
          { $match: { tenantId: { $in: signalTenantIds }, locationId: { $in: signalLocationIds }, status: { $ne: 'closed' } } },
          {
            $group: {
              _id: '$locationId',
              free: { $sum: { $cond: [{ $eq: ['$status', 'free'] }, 1, 0] } },
              occupied: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] } },
              reserved: { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, 1, 0] } },
              needsAttention: { $sum: { $cond: [{ $eq: ['$status', 'needs_attention'] }, 1, 0] } },
              lastUpdate: { $max: '$updatedAt' },
            },
          },
        ])
        for (const t of tableAggs) {
          tablesMap.set(String(t._id), {
            free: t.free, occupied: t.occupied, reserved: t.reserved,
            needsAttention: t.needsAttention, lastUpdate: t.lastUpdate ?? null,
          })
        }
      } catch (e) {
        console.error('[explore/nearby] tables aggregation failed:', e)
      }
      try {
        const sinceHour = new Date(Date.now() - 60 * 60 * 1000)
        const paceAggs = await Order.aggregate([
          {
            $match: {
              tenantId: { $in: signalTenantIds },
              locationId: { $in: signalLocationIds },
              createdAt: { $gte: sinceHour },
              status: { $ne: 'cancelled' },
            },
          },
          { $group: { _id: '$locationId', count: { $sum: 1 } } },
        ])
        for (const o of paceAggs) paceMap.set(String(o._id), o.count)
      } catch (e) {
        console.error('[explore/nearby] pace aggregation failed:', e)
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

    const maxIcoScore = mergedNetworkRaw.reduce((max: number, loc: any) => {
      const score = loc.tenant?.cachedScores?.icoScore
      return typeof score === 'number' ? Math.max(max, score) : max
    }, 0)

    const signalsNow = new Date()

    const networkResults: NearbyRestaurant[] = mergedNetworkRaw.map(loc => {
      const distanceM = Math.round(loc.distanceM)
      // Los comercios «siempre visibles» entran con distancia 0 para el orden;
      // al usuario se le muestra la distancia real.
      const locLat: number | null = loc.geo?.coordinates?.[1] ?? null
      const locLng: number | null = loc.geo?.coordinates?.[0] ?? null
      const displayDistanceM =
        distanceM === 0 && locLat != null && locLng != null
          ? distanceMeters({ lat, lng }, { lat: locLat, lng: locLng })
          : distanceM
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

      const rawIcoScore: number | null = loc.tenant?.cachedScores?.icoScore ?? null
      const icoRing = getIcoRing(rawIcoScore)
      const hasWinkOffer = tenantPromo?.hasPromo === true
      const hasCrown = rawIcoScore !== null && rawIcoScore >= 85 && (rawIcoScore === maxIcoScore || rawIcoScore >= 95)

      // ── Señales de la ciudad ────────────────────────────────────────────
      const locIdStr = loc._id.toString()
      const payTenant = tenantIdStr ? payTenantMap.get(tenantIdStr) : null
      let payments: CitySignals['payments'] = { mp: false, cash: false, transfer: false }
      if (payTenant) {
        const mpAccount = getMpAccountForLocation(payTenant, loc.settings?.mpAccountId ?? null)
        const transferAccount = resolveTransferAccountForLocation(payTenant, loc.settings?.transferAccountId ?? null)
        payments = {
          mp: !!mpAccount
            && canChargeWithMercadoPago(payTenant, mpAccount)
            && payTenant.paymentMethodsVisibility?.mercadopago !== false,
          cash: canAccess(payTenant.plan as Plan, 'cashPayment')
            && !!payTenant.features?.cashPaymentEnabledBySuperadmin
            && resolveCashConfig(payTenant.cash, loc.settings?.cash ?? null).enabled,
          transfer: !!payTenant.transfer?.enabled && !!transferAccount?.alias,
        }
      }
      const dineIn = orderModes.includes('dine-in')
      const isOpenForSalon = checkIsOpenNow(loc.serviceHours, 'dineIn', tz) ?? isOpenNow
      const hoursSlots =
        (loc.serviceHours?.takeaway?.length ? loc.serviceHours.takeaway : null)
        ?? (loc.serviceHours?.dineIn?.length ? loc.serviceHours.dineIn : null)
        ?? (loc.serviceHours?.delivery?.length ? loc.serviceHours.delivery : null)
      const hoursWindow = openWindow(hoursSlots, getNowInTimezone(tz))
      const delay = loc.settings?.delayAnnouncement?.takeaway
      const signals: CitySignals = {
        payments,
        modes: {
          takeaway: orderModes.includes('takeaway'),
          delivery: deliveryEnabled,
          dineIn,
        },
        salon: isOpenForSalon ? salonFromTables(tablesMap.get(locIdStr), signalsNow) : null,
        pace: isOpenNow && acceptsOrders ? paceFromOrders(paceMap.get(locIdStr) ?? 0) : null,
        delayMinutes: delay?.enabled && delay.extraMinutes > 0 ? Math.round(delay.extraMinutes) : null,
        minutesToClose: isOpenNow ? hoursWindow.minutesToClose : null,
        minutesSinceOpen: isOpenNow ? hoursWindow.minutesSinceOpen : null,
        opensAt: isOpenNow === false ? hoursWindow.opensAt : null,
        reservations: loc.reservationConfig?.enabled === true,
        club: hasClub ? { name: loc.tenant?.loyalty?.clubName ?? null } : null,
        promo: tenantPromo && tenantPromo.titles.length > 0
          ? { title: tenantPromo.titles[0], count: tenantPromo.titles.length }
          : null,
      }

      return {
        id: loc._id.toString(),
        type: 'network',
        name: loc.tenant?.name ?? loc.name,
        address: loc.address,
        lat: locLat as number,
        lng: locLng as number,
        distanceM: displayDistanceM,
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
        icoScore: rawIcoScore,
        icoRing,
        hasCrown,
        hasWinkOffer,
        isFullOperational: tenantIdStr ? (payMap.get(tenantIdStr) ?? false) : false,
        signals,
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
        lat: entry.geo?.coordinates?.[1] ?? null,
        lng: entry.geo?.coordinates?.[0] ?? null,
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
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch (error) {
    console.error('[explore/nearby]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
