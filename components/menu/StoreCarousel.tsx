'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, ChevronRight } from 'lucide-react'

interface StoreItem {
  _id: string
  name: string
  imageUrl: string
  pointsCost: number
  isFeatured: boolean
}

interface Props {
  tenantSlug: string
  memberPoints: number
}

export default function StoreCarousel({ tenantSlug, memberPoints }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchItems()
  }, [tenantSlug])

  async function fetchItems() {
    try {
      const res = await fetch(`/api/${tenantSlug}/store/items?isActive=true`)
      const data = await res.json()
      if (res.ok) {
        setItems(data.items || [])
      }
    } catch {
      // Silently fail - store is optional
    } finally {
      setLoading(false)
    }
  }

  if (loading || items.length === 0) return null

  return (
    <div className="px-4 py-6 bg-gradient-to-b from-purple-50/50 to-transparent">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">Canjeá tus puntos</h2>
        <button 
          onClick={() => router.push(`/app/profile/club/${tenantSlug}?tab=store`)}
          className="flex items-center gap-1 text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
        >
          Ver más
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Points Badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full text-sm font-bold">
          <Flame size={14} className="fill-orange-500 text-orange-500" />
          {memberPoints.toLocaleString()} pts
        </div>
      </div>

      {/* Horizontal Carousel */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide snap-x snap-mandatory">
        {items.map((item) => (
          <button
            key={item._id}
          onClick={() => router.push(`/app/profile/club/${tenantSlug}?tab=store`)}
            className="flex-shrink-0 w-28 snap-start text-left group"
          >
            {/* Product Image */}
            <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-gray-100 mb-2 shadow-sm group-hover:shadow-md transition-shadow">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                  <span className="text-2xl">🎁</span>
                </div>
              )}
              
              {/* Points Badge on Image */}
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs font-bold text-orange-600">
                <Flame size={10} className="fill-orange-500" />
                {item.pointsCost.toLocaleString()}
              </div>
            </div>

            {/* Product Name */}
            <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
              {item.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
