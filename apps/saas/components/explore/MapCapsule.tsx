'use client'

import { useMemo } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'

interface Props {
  restaurants: RestaurantCardData[]
  userLat: number
  userLng: number
}

interface Capsule {
  icon: string
  text: string
  color: string
  bgColor: string
}

/**
 * MapCapsule — contextual info bar at the top of the map.
 *
 * Shows dynamic capsules based on what's around the user:
 * - New restaurants nearby
 * - Active promotions
 * - Open restaurants
 * - Time-of-day context
 *
 * The map should talk. This component makes it speak.
 */
export default function MapCapsule({ restaurants, userLat, userLng }: Props) {
  const capsule = useMemo((): Capsule | null => {
    const valid = restaurants.filter(r => r.lat !== null && r.lng !== null)
    if (valid.length === 0) return null

    // Count new restaurants within 500m
    const NEW_RADIUS_M = 500
    const newNearby = valid.filter(r => {
      if (!r.isNew) return false
      return (r.distanceM ?? Infinity) < NEW_RADIUS_M
    })

    if (newNearby.length > 0) {
      return {
        icon: '📍',
        text: newNearby.length === 1
          ? 'Hay 1 lugar nuevo cerca tuyo'
          : `Hay ${newNearby.length} lugares nuevos cerca tuyo`,
        color: 'var(--tgo-state-discovery)',
        bgColor: 'var(--tgo-state-discovery-soft)',
      }
    }

    // Count active promotions
    const withPromos = valid.filter(r => r.loyaltyInfo?.hasActivePromo)
    if (withPromos.length > 0) {
      return {
        icon: '🎯',
        text: withPromos.length === 1
          ? '1 promoción activa cerca'
          : `${withPromos.length} promociones activas cerca`,
        color: 'var(--tgo-state-reward)',
        bgColor: 'var(--tgo-state-reward-soft)',
      }
    }

    // Time-of-day context
    const hour = new Date().getHours()
    const openNow = valid.filter(r => r.isOpenNow === true)
    if (hour >= 6 && hour < 11) {
      return {
        icon: '☀️',
        text: openNow.length > 0
          ? `${openNow.length} lugares abiertos para desayunar`
          : 'Momento ideal para un café',
        color: 'var(--tgo-state-warning)',
        bgColor: 'var(--tgo-state-warning-soft)',
      }
    }
    if (hour >= 11 && hour < 15) {
      return {
        icon: '🍽️',
        text: openNow.length > 0
          ? `${openNow.length} lugares abiertos para almorzar`
          : 'Hora del almuerzo',
        color: 'var(--tgo-state-success)',
        bgColor: 'var(--tgo-state-success-soft)',
      }
    }
    if (hour >= 19 && hour < 23) {
      return {
        icon: '🌙',
        text: openNow.length > 0
          ? `${openNow.length} lugares abiertos esta noche`
          : 'Noche de explorar',
        color: 'var(--tgo-state-trust)',
        bgColor: 'var(--tgo-state-trust-soft)',
      }
    }

    // Default: open count
    if (openNow.length > 0) {
      return {
        icon: '🟢',
        text: `${openNow.length} lugares abiertos ahora`,
        color: 'var(--tgo-state-success)',
        bgColor: 'var(--tgo-state-success-soft)',
      }
    }

    return null
  }, [restaurants])

  if (!capsule) return null

  return (
    <div
      className="absolute top-4 left-4 right-16 z-[400] animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl shadow-lg"
        style={{
          backgroundColor: capsule.bgColor,
          border: `1px solid ${capsule.color}`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <span className="text-sm">{capsule.icon}</span>
        <span
          className="text-xs font-semibold"
          style={{ color: capsule.color }}
        >
          {capsule.text}
        </span>
      </div>
    </div>
  )
}
