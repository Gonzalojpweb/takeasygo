'use client'

import NearbyListItem from '@/components/explore/NearbyListItem'
import { EmptyState } from '@/components/tgo'
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
    <div
      className="flex flex-col gap-2"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {restaurants.slice(0, 6).map((r) => (
        <NearbyListItem
          key={r.id}
          restaurant={{
            _id: r.id,
            name: r.name,
            slug: r.slug || r.id,
            primaryColor: r.primaryColor,
            isOperational: r.isOperational,
            distance: r.distanceM,
            cuisineType: r.cuisineTypes,
          }}
          isNetwork={r.type === 'network'}
          onNavigate={(slug) => onNavigate(r)}
        />
      ))}
    </div>
  )
}
