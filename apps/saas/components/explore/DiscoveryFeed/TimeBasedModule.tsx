'use client'

import { RestaurantCard } from '@/components/tgo-business'
import { HorizontalScroller } from '@/components/tgo'
import { Sun, Utensils, Coffee, Moon } from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'

function getTimeOfDay(): { label: string; icon: typeof Sun; categories: string[] } {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 11) {
    return { label: 'Desayuno — Ideal para arrancar el día', icon: Sun, categories: ['Café', 'Bagels', 'Pastelería', 'Panadería'] }
  }
  if (hour >= 11 && hour < 15) {
    return { label: 'Almuerzo — Opciones rápidas cerca', icon: Utensils, categories: ['Pizza', 'Empanadas', 'Ensalada', ' Sandwich', 'Mexicana'] }
  }
  if (hour >= 15 && hour < 19) {
    return { label: 'Merienda — Cafés y dulces para vos', icon: Coffee, categories: ['Café', 'Heladería', 'Postres', 'Pastelería'] }
  }
  return { label: 'Noche — Para esta noche', icon: Moon, categories: ['Parrilla', 'Italiana', 'Japonesa', 'Cervecería'] }
}

interface Props {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}

export function TimeBasedModule({ restaurants, onNavigate }: Props) {
  const timeInfo = getTimeOfDay()
  const Icon = timeInfo.icon
  const matching = restaurants.filter((r) =>
    r.cuisineTypes.some((c) => timeInfo.categories.some((tc) => c.toLowerCase().includes(tc.toLowerCase())))
  )

  if (matching.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3" style={{ paddingInline: 'var(--tgo-page-padding)' }}>
        <Icon size={14} style={{ color: 'var(--tgo-state-interactive)' }} />
        <span
          style={{
            color: 'var(--tgo-text-secondary)',
            fontSize: 'var(--tgo-type-caption)',
            fontWeight: 500,
          }}
        >
          {timeInfo.label}
        </span>
      </div>
      <HorizontalScroller gap="12px">
        {matching.slice(0, 6).map((r, i) => (
          <RestaurantCard
            key={r.id}
            restaurant={r}
            layout="compact"
            onNavigate={() => onNavigate(r)}
            index={i}
          />
        ))}
      </HorizontalScroller>
    </div>
  )
}
