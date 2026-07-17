'use client'

import { useEffect, useCallback, useState } from 'react'
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
  activeInterval = 10_000,
  inactiveInterval = 30_000,
}: UseBoardAutoRefreshOptions<T>) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const doRefresh = useCallback(() => {
    onRefresh()
    setLastUpdated(new Date())
  }, [onRefresh])

  // Auto-refresh: faster when there are active items
  useEffect(() => {
    const hasActive = items.some(o => activeStatuses.includes(o.status))
    const interval = setInterval(doRefresh, hasActive ? activeInterval : inactiveInterval)
    return () => clearInterval(interval)
  }, [items, activeStatuses, doRefresh, activeInterval, inactiveInterval])

  // Refresh when tab becomes visible
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') doRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [doRefresh])

  // Clock for updating time indicators
  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  return { lastUpdated, doRefresh }
}
