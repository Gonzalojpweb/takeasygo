import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  Clock,
  Flame,
  Coffee,
  Sun,
  AlertCircle,
  MapPin,
  Footprints,
  ArrowUpRight,
  Car,
  Tag,
  Gift,
  Star,
  Sparkles,
} from 'lucide-react'
import type { ComponentType } from 'react'

// ── Operational Status ────────────────────────────────────────────────────────

export type OperationalSignal = {
  icon: ComponentType<{ className?: string }>
  label: string
  variant: 'active' | 'calm' | 'new' | 'closing' | 'preparing' | 'benefit' | 'lowDemand'
}

/**
 * Maps restaurant data to a "lenguaje de ciudad" operational signal.
 *
 * capacityScore null behavior: NO demand signal shown.
 * Falls back to isOpenNow + estimatedPickupTime only.
 * If capacityScore data arrives in the future, the UI is ready to display it.
 */
export function getOperationalStatus(r: RestaurantCardData): OperationalSignal | null {
  if (!r.isOpenNow) return null

  // Capacity-based signals (when data exists)
  if (r.capacityScore !== null && r.capacityScore !== undefined) {
    if (r.capacityScore >= 0.7) {
      return {
        icon: Flame,
        label: 'Con bastante movimiento ahora',
        variant: 'active',
      }
    }
    if (r.capacityScore <= 0.3) {
      return {
        icon: Coffee,
        label: 'Está tranquilo ahora',
        variant: 'calm',
      }
    }
  }

  // New restaurant
  if (r.isNew) {
    return {
      icon: Sparkles,
      label: 'Recién llegó a la red',
      variant: 'new',
    }
  }

  // Has active promo
  if (r.loyaltyInfo?.hasActivePromo) {
    return {
      icon: Tag,
      label: 'Hoy tiene beneficios',
      variant: 'benefit',
    }
  }

  // Default: preparing orders
  if (r.estimatedPickupTime && r.estimatedPickupTime > 0) {
    return {
      icon: Clock,
      label: `Preparando pedidos en ${r.estimatedPickupTime} min`,
      variant: 'preparing',
    }
  }

  return null
}

// ── Proximity ─────────────────────────────────────────────────────────────────

export type ProximitySignal = {
  icon: ComponentType<{ className?: string }>
  label: string
}

export function getProximityLabel(distanceM: number | null, walkingMinutes?: number): ProximitySignal | null {
  if (distanceM === null) return null

  if (walkingMinutes && walkingMinutes <= 5) {
    return {
      icon: Footprints,
      label: `${walkingMinutes} min caminando`,
    }
  }

  if (distanceM < 500) {
    return {
      icon: MapPin,
      label: `A ${distanceM} metros`,
    }
  }

  const km = distanceM / 1000
  if (km < 3) {
    return {
      icon: Car,
      label: `${km.toFixed(1)} km`,
    }
  }

  return {
    icon: ArrowUpRight,
    label: `${km.toFixed(1)} km`,
  }
}

// ── Opportunity / Benefit ─────────────────────────────────────────────────────

export type OpportunitySignal = {
  icon: ComponentType<{ className?: string }>
  label: string
}

export function getOpportunityLabel(loyaltyInfo: RestaurantCardData['loyaltyInfo']): OpportunitySignal | null {
  if (!loyaltyInfo?.hasActivePromo) return null

  const types = loyaltyInfo.promoTypes ?? []

  if (types.includes('sale')) {
    return {
      icon: Tag,
      label: '2x1 hoy',
    }
  }

  if (types.includes('info')) {
    return {
      icon: Gift,
      label: 'Beneficio disponible',
    }
  }

  if (loyaltyInfo.hasClub) {
    return {
      icon: Star,
      label: `10% con ${loyaltyInfo.clubName || 'Club TGO'}`,
    }
  }

  return {
    icon: Sparkles,
    label: 'Hoy podés aprovechar',
  }
}
