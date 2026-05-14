'use client'

import { useEffect, useRef } from 'react'
import { haversineDistance } from '@/lib/geofencing'

interface WatchedLocation {
  tenantSlug: string
  lat: number
  lng: number
  name: string
  radius: number
}

interface Props {
  locations: WatchedLocation[]
  enabled: boolean
  intervalMs?: number
  onEnter?: (location: WatchedLocation) => void
}

/**
 * Hook que observa la posición del usuario y dispara un callback
 * cuando entra al radio de alguna locación vigilada.
 *
 * Usa watchPosition con high accuracy y verifica cada N ms.
 */
export default function useGeofencingWatcher({
  locations,
  enabled,
  intervalMs = 30000,
  onEnter,
}: Props) {
  const prevInsideRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!enabled || locations.length === 0) return

    if (!('geolocation' in navigator)) return

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPosRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    )

    // Periodic check
    intervalRef.current = setInterval(() => {
      const userPos = lastPosRef.current
      if (!userPos) return

      const inside = new Set<string>()

      for (const loc of locations) {
        const dist = haversineDistance(userPos, { lat: loc.lat, lng: loc.lng })
        if (dist <= loc.radius) {
          inside.add(loc.tenantSlug)
          if (!prevInsideRef.current.has(loc.tenantSlug)) {
            onEnter?.(loc)
          }
        }
      }

      prevInsideRef.current = inside
    }, intervalMs)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [locations, enabled, intervalMs, onEnter])
}
