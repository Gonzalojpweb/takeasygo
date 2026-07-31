import mongoose from 'mongoose'
import ImpactEvent from '@/models/ImpactEvent'
import LoyaltyMember from '@/models/LoyaltyMember'
import Location from '@/models/Location'
import { haversineDistance } from '@/lib/geocode'

// ── Badge Catalog ────────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string
  name: string
  description: string
  icon: string
  category: 'exploration' | 'community' | 'impact' | 'identity'
  condition: (impact: UserImpactSummary) => boolean
}

export interface UserImpactSummary {
  commercesSupported: number
  nearbyPurchases: number
  discoveredBusinesses: number
  discoveredNeighborhoods: string[]
  badges: { id: string; unlockedAt: Date }[]
  totalOrders: number
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: 'primer_impacto',
    name: 'Primer Impacto',
    description: 'Completaste tu primera orden en la red TGO',
    icon: '🌱',
    category: 'impact',
    condition: (impact) => impact.totalOrders > 0,
  },
  {
    id: 'explorador',
    name: 'Explorador',
    description: 'Descubriste 5 comercios diferentes',
    icon: '🧭',
    category: 'exploration',
    condition: (impact) => impact.discoveredBusinesses >= 5,
  },
  {
    id: 'constructor',
    name: 'Constructor',
    description: 'Apoyaste 10 comercios locales',
    icon: '🏗️',
    category: 'community',
    condition: (impact) => impact.discoveredBusinesses >= 10,
  },
  {
    id: 'local',
    name: 'Local',
    description: 'Realizaste 10 órdenes en la red',
    icon: '🏠',
    category: 'community',
    condition: (impact) => impact.totalOrders >= 10,
  },
]

// ── Impact Calculation ───────────────────────────────────────────────────────
// These values are INTERNAL — used only for badge condition logic.
// They are NEVER exposed to the user.

const BASE_IMPACT_PER_ORDER = 10
const FIRST_VISIT_BONUS = 15
const NEARBY_THRESHOLD_KM = 1.5

/**
 * Calculate impact value for an order.
 * Returns { impactValue, isFirstVisit }.
 * impactValue is internal — never sent to the client.
 */
export async function calculateImpact(params: {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  phoneHash: string
}): Promise<{ impactValue: number; isFirstVisit: boolean }> {
  const { tenantId, locationId, phoneHash } = params

  const member = await LoyaltyMember.findOne({
    tenantId,
    phoneHash,
  }).select('userImpact').lean() as any

  const discoveredList: mongoose.Types.ObjectId[] =
    member?.userImpact?.discoveredBusinessesList || []

  const isFirstVisit = !discoveredList.some(
    (id: mongoose.Types.ObjectId) => id.toString() === locationId.toString()
  )

  const impactValue = isFirstVisit
    ? BASE_IMPACT_PER_ORDER + FIRST_VISIT_BONUS
    : BASE_IMPACT_PER_ORDER

  return { impactValue, isFirstVisit }
}

/**
 * Register an impact event and update the loyalty member.
 */
export async function registerImpactEvent(params: {
  userId: mongoose.Types.ObjectId | null
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  phoneHash: string
  orderTotal: number
  businessName: string
  cuisineTypes?: string[]
  /** Coordenadas del usuario (solo delivery con dirección geocodificada) */
  userLocation?: { lat: number; lng: number }
}): Promise<{ impactValue: number; isFirstVisit: boolean; newBadges: string[] }> {
  const { userId, tenantId, locationId, orderId, phoneHash, orderTotal, businessName, cuisineTypes, userLocation } = params

  // 1. Calculate impact
  const { impactValue, isFirstVisit } = await calculateImpact({ tenantId, locationId, phoneHash })

  // 2. Create impact event
  await ImpactEvent.create({
    userId,
    tenantId,
    locationId,
    orderId,
    type: isFirstVisit ? 'discovery' : 'purchase',
    impactValue,
    metadata: {
      orderTotal,
      businessName,
      cuisineTypes,
      isFirstVisit,
    },
  })

  // 3. Determine nearbyPurchase — haversine distance < 1.5km
  // Solo se incrementa para delivery con dirección geocodificada.
  // Takeaway/dine-in: nearbyPurchases queda en 0 (pendiente Phase 2)
  let isNearbyPurchase = false
  if (userLocation) {
    const locationDoc = await Location.findById(locationId).select('geo').lean() as any
    if (locationDoc?.geo?.coordinates) {
      // GeoJSON coordinates are [longitude, latitude]
      const businessCoords = {
        lat: locationDoc.geo.coordinates[1],
        lng: locationDoc.geo.coordinates[0],
      }
      const distanceKm = haversineDistance(userLocation, businessCoords)
      isNearbyPurchase = distanceKm < NEARBY_THRESHOLD_KM
    }
  }

  // 4. Update loyalty member — human metrics, no abstract score
  const updateOps: any = {
    $inc: {
      'userImpact.commercesSupported': 1,
      ...(isFirstVisit ? { 'userImpact.discoveredBusinesses': 1 } : {}),
      ...(isNearbyPurchase ? { 'userImpact.nearbyPurchases': 1 } : {}),
    },
    $set: { 'userImpact.lastImpactAt': new Date() },
  }

  if (isFirstVisit) {
    updateOps.$addToSet = {
      'userImpact.discoveredBusinessesList': locationId,
    }
  }

  await LoyaltyMember.updateOne(
    { tenantId, phoneHash },
    updateOps
  )

  // 5. Check for new badges
  const memberAfter = await LoyaltyMember.findOne({
    tenantId,
    phoneHash,
  }).select('userImpact cache.totalOrders').lean() as any

  const currentImpact: UserImpactSummary = {
    commercesSupported: memberAfter?.userImpact?.commercesSupported ?? 1,
    nearbyPurchases: memberAfter?.userImpact?.nearbyPurchases ?? (isNearbyPurchase ? 1 : 0),
    discoveredBusinesses: memberAfter?.userImpact?.discoveredBusinesses ?? (isFirstVisit ? 1 : 0),
    discoveredNeighborhoods: memberAfter?.userImpact?.discoveredNeighborhoods ?? [],
    badges: memberAfter?.userImpact?.badges ?? [],
    totalOrders: memberAfter?.cache?.totalOrders ?? 1,
  }

  const existingBadgeIds = new Set(currentImpact.badges.map((b) => b.id))
  const newBadges: string[] = []

  for (const badge of BADGE_CATALOG) {
    if (!existingBadgeIds.has(badge.id) && badge.condition(currentImpact)) {
      newBadges.push(badge.id)
    }
  }

  // 6. Award new badges
  if (newBadges.length > 0) {
    await LoyaltyMember.updateOne(
      { tenantId, phoneHash },
      {
        $push: {
          'userImpact.badges': {
            $each: newBadges.map((id) => ({ id, unlockedAt: new Date() })),
          },
        },
      }
    )
  }

  return { impactValue, isFirstVisit, newBadges }
}

/**
 * Get impact summary for a user in a specific tenant.
 */
export async function getImpactSummary(params: {
  tenantId: mongoose.Types.ObjectId
  phoneHash: string
}): Promise<{
  commercesSupported: number
  nearbyPurchases: number
  discoveredBusinesses: number
  discoveredNeighborhoods: string[]
  badges: { id: string; unlockedAt: Date }[]
  totalOrders: number
} | null> {
  const { tenantId, phoneHash } = params

  const member = await LoyaltyMember.findOne({
    tenantId,
    phoneHash,
  }).select('userImpact cache.totalOrders').lean() as any

  if (!member) return null

  return {
    commercesSupported: member.userImpact?.commercesSupported ?? 0,
    nearbyPurchases: member.userImpact?.nearbyPurchases ?? 0,
    discoveredBusinesses: member.userImpact?.discoveredBusinesses ?? 0,
    discoveredNeighborhoods: member.userImpact?.discoveredNeighborhoods ?? [],
    badges: member.userImpact?.badges ?? [],
    totalOrders: member.cache?.totalOrders ?? 0,
  }
}

/**
 * Get all available badges with unlock status for a user.
 */
export async function getBadgesWithStatus(params: {
  tenantId: mongoose.Types.ObjectId
  phoneHash: string
}): Promise<{ badge: BadgeDefinition; unlocked: boolean; unlockedAt?: Date }[]> {
  const summary = await getImpactSummary(params)
  if (!summary) {
    return BADGE_CATALOG.map((badge) => ({ badge, unlocked: false }))
  }

  const unlockedMap = new Map(
    summary.badges.map((b) => [b.id, b.unlockedAt])
  )

  return BADGE_CATALOG.map((badge) => ({
    badge,
    unlocked: unlockedMap.has(badge.id),
    unlockedAt: unlockedMap.get(badge.id),
  }))
}
