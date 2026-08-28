'use client'

import { useState, useEffect } from 'react'
import { Flame, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface StoreItem {
  _id: string
  name: string
  pointsCost: number
}

interface Props {
  tenantSlug: string
  memberPoints: number
  locationId?: string
  zIndex?: number
}

// Heights in px — sync with actual banner padding
const ACTIVE_ORDER_HEIGHT = 48
const RETURNING_BANNER_HEIGHT = 52

export default function PointsStickyBar({
  tenantSlug,
  memberPoints,
  locationId,
  zIndex = 30,
}: Props) {
  const router = useRouter()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [topOffset, setTopOffset] = useState(0)

  // Detect which banners are visible above this bar
  useEffect(() => {
    // ActiveOrderBanner stores its presence in localStorage
    const hasActiveOrder = (() => {
      try {
        const raw = localStorage.getItem('tgo-pending-order')
        if (!raw) return false
        const data = JSON.parse(raw)
        return !!data.orderNumber && !!data.tenantSlug
      } catch { return false }
    })()

    if (hasActiveOrder) {
      setTopOffset(ACTIVE_ORDER_HEIGHT)
    } else {
      // ReturningCustomerBanner — detect via customer identity storage
      const hasReturning = (() => {
        try {
          const key = `tgo-customer-${tenantSlug}`
          const raw = localStorage.getItem(key)
          if (!raw) return false
          const data = JSON.parse(raw)
          // Check if not dismissed
          const dismissed = localStorage.getItem(`tgo-customer-banner-dismissed-${tenantSlug}`)
          return !!data.name && !dismissed
        } catch { return false }
      })()
      setTopOffset(hasReturning ? RETURNING_BANNER_HEIGHT : 0)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetch(`/api/${tenantSlug}/store/items?isActive=true`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setItems(data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantSlug])

  const storeUrl = `/app/profile/club/${tenantSlug}?tab=store&origin=menu${locationId ? `&locationId=${locationId}` : ''}`

  // Find the nearest affordable reward
  const redeemableItems = items
    .filter(i => i.pointsCost > memberPoints)
    .sort((a, b) => a.pointsCost - b.pointsCost)

  const nextReward = redeemableItems[0] ?? null
  const progress = nextReward
    ? Math.min((memberPoints / nextReward.pointsCost) * 100, 100)
    : 100
  const pointsNeeded = nextReward ? nextReward.pointsCost - memberPoints : 0

  let progressLabel: string
  if (!nextReward) {
    const minCost = items.length > 0 ? Math.min(...items.map(i => i.pointsCost)) : 0
    if (items.length === 0 || memberPoints >= minCost) {
      progressLabel = '¡Canjeá tus puntos!'
    } else {
      progressLabel = ''
    }
  } else {
    progressLabel = `Te faltan ${pointsNeeded.toLocaleString()} pts para "${nextReward.name}"`
  }

  if (loading || items.length === 0 || memberPoints <= 0) return null

  return (
    <div
      className="sticky w-full backdrop-blur-md border-b"
      style={{
        top: `${topOffset}px`,
        zIndex,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderColor: 'rgba(0,0,0,0.06)',
      }}
    >
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => router.push(storeUrl)}
          className="flex items-center gap-1.5 bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 active:scale-95 transition-transform"
        >
          <Flame size={12} className="fill-orange-500 text-orange-500" />
          {memberPoints.toLocaleString()} pts
          <ChevronRight size={12} className="opacity-50" />
        </button>

        {progressLabel && (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-orange-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress >= 100 ? '#22c55e' : '#f97316',
                }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 font-medium whitespace-nowrap truncate">
              {progressLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
