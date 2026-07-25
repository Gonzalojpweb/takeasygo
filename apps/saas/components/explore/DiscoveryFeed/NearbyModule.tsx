'use client'

import { RestaurantCard } from '@/components/tgo-business'
import { DiscoveryContinuo, EmptyState } from '@/components/tgo'
import type { RestaurantCardData } from '@/types/restaurant-card'

interface Props {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}

export function NearbyModule({ restaurants, onNavigate }: Props) {
  if (restaurants.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 24 }}>📍</span>}
        title="No encontramos nada cerca"
        subtitle="¿Querés ampliar la zona de búsqueda?"
        action={{ label: 'Ampliar zona', onClick: () => {} }}
        variant="search"
      />
    )
  }

  return (
    <DiscoveryContinuo
      items={restaurants.slice(0, 6)}
      keyExtractor={(r) => r.id}
      gap={12}
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {(r) => (
        <RestaurantCard
          restaurant={r}
          layout="list"
          onNavigate={() => onNavigate(r)}
        />
      )}
    </DiscoveryContinuo>
  )
}
