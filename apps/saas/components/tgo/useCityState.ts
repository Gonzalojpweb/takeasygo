'use client'

// ── useCityState ──────────────────────────────────────────────────────────────
//
// Hook para datos de "ciudad viva" con polling automático.
//
// Responsabilidades:
//   1. Fetchear datos del home (nearbyTenants, promotions)
//   2. Calcular métricas derivadas (abiertos, promos, nuevos, espera promedio)
//   3. Refrescar periódicamente (polling cada 60s)
//   4. Detectar cambios y exponer delta para animaciones
//
// Dependencias:
//   - API /api/explore/home
//   - LocationContext (coordenadas del usuario)
//
// Uso:
//   const { metrics, nearby, promotions, refresh, isLoading } = useCityState()

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation } from '@/components/explore/LocationContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CityMetrics {
  openCount: number
  promoCount: number
  newCount: number
  avgPickup: number | null
}

export interface CityState {
  /** Métricas animables */
  metrics: CityMetrics
  /** Restaurantes cercanos (crudos) */
  nearby: any[]
  /** Promociones (crudas) */
  promotions: any[]
  /** Redemptions (crudos) */
  redemptions: any[]
  /** Categorías disponibles */
  categories: string[]
  /** Si está cargando por primera vez */
  isLoading: boolean
  /** Si está refrescando (polling) */
  isRefreshing: boolean
  /** Forzar refresh manual */
  refresh: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 60_000 // 60 segundos

export function useCityState(): CityState {
  const { currentAddress } = useLocation()

  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(
    async (isPoll = false) => {
      if (!currentAddress) return

      if (isPoll) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }

      try {
        const res = await fetch(
          `/api/explore/home?lat=${currentAddress.coordinates.lat}&lng=${currentAddress.coordinates.lng}`
        )
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error('[useCityState] Error fetching:', err)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [currentAddress]
  )

  // Fetch inicial + polling
  useEffect(() => {
    fetchData()

    intervalRef.current = setInterval(() => {
      fetchData(true)
    }, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  // Métricas derivadas
  const metrics = useMemo<CityMetrics>(() => {
    if (!data) {
      return { openCount: 0, promoCount: 0, newCount: 0, avgPickup: null }
    }

    const nearby: any[] = data.nearbyTenants ?? []
    const promotions: any[] = data.promotions ?? []

    const openCount = nearby.filter((r: any) => r.isOpenNow === true).length
    const promoCount = promotions.length
    const newCount = nearby.filter((r: any) => r.isNew).length

    const openWithPickup = nearby.filter(
      (r: any) => r.isOpenNow === true && r.estimatedPickupTime
    )
    const avgPickup =
      openWithPickup.length > 0
        ? Math.round(
            openWithPickup.reduce(
              (sum: number, r: any) => sum + (r.estimatedPickupTime ?? 0),
              0
            ) / openWithPickup.length
          )
        : null

    return { openCount, promoCount, newCount, avgPickup }
  }, [data])

  return {
    metrics,
    nearby: data?.nearbyTenants ?? [],
    promotions: data?.promotions ?? [],
    redemptions: data?.redemptions ?? [],
    categories: data?.categories ?? [],
    isLoading,
    isRefreshing,
    refresh: () => fetchData(),
  }
}
