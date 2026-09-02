'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import type { BoardItem } from './types'

interface UseBoardAutoRefreshOptions<T extends BoardItem> {
  items: T[]
  activeStatuses: string[]
  onRefresh: () => void
  activeInterval?: number
  inactiveInterval?: number
}

export function useBoardAutoRefresh<T extends BoardItem>({
  items,
  activeStatuses,
  onRefresh,
  activeInterval = 30_000,
  inactiveInterval = 60_000,
}: UseBoardAutoRefreshOptions<T>) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const isVisibleRef = useRef(true)

  const doRefresh = useCallback(() => {
    onRefresh()
    setLastUpdated(new Date())
  }, [onRefresh])

  // Track visibility changes
  useEffect(() => {
    function onVisibility() {
      isVisibleRef.current = document.visibilityState === 'visible'
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Auto-refresh: dynamic interval based on visibility + active items
  useEffect(() => {
    const hasActive = items.some(o => activeStatuses.includes(o.status))

    function getInterval() {
      if (!isVisibleRef.current) return inactiveInterval
      return hasActive ? activeInterval : inactiveInterval
    }

    const tick = () => {
      doRefresh()
      // Restart with potentially new interval
      clearInterval(id)
      id = setInterval(tick, getInterval())
    }

    let id = setInterval(tick, getInterval())
    return () => clearInterval(id)
  }, [items, activeStatuses, doRefresh, activeInterval, inactiveInterval])

  // Clock for updating time indicators
  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  return { lastUpdated, doRefresh }
}
