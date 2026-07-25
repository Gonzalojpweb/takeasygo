'use client'

import { RestaurantCard } from '@/components/tgo-business'
import { HorizontalScroller } from '@/components/tgo'
import type { RestaurantCardData } from '@/types/restaurant-card'

interface Props {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}

export function NewInNetworkModule({ restaurants, onNavigate }: Props) {
  const newRestaurants = restaurants.filter((r) => r.isNew)
  if (newRestaurants.length === 0) return null

  return (
    <HorizontalScroller gap="12px">
      {newRestaurants.slice(0, 6).map((r, i) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          layout="compact"
          onNavigate={() => onNavigate(r)}
          index={i}
        />
      ))}
    </HorizontalScroller>
  )
}
