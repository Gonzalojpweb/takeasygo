'use client'

import { HorizontalScroller } from '@/components/tgo'
import { Sun, Utensils, Coffee, Moon } from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'

function getTimeOfDay(): { label: string; icon: typeof Sun; categories: string[]; color: string } {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 11) {
    return { label: 'Desayuno — Ideal para arrancar el día', icon: Sun, categories: ['Café', 'Bagels', 'Pastelería', 'Panadería'], color: 'var(--tgo-state-discovery)' }
  }
  if (hour >= 11 && hour < 15) {
    return { label: 'Almuerzo — Opciones rápidas cerca', icon: Utensils, categories: ['Pizza', 'Empanadas', 'Ensalada', 'Sandwich', 'Mexicana'], color: 'var(--tgo-state-action)' }
  }
  if (hour >= 15 && hour < 19) {
    return { label: 'Merienda — Cafés y dulces para vos', icon: Coffee, categories: ['Café', 'Heladería', 'Postres', 'Pastelería'], color: 'var(--tgo-state-reward)' }
  }
  return { label: 'Noche — Para esta noche', icon: Moon, categories: ['Parrilla', 'Italiana', 'Japonesa', 'Cervecería'], color: 'var(--tgo-state-trust)' }
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
        <Icon size={14} style={{ color: timeInfo.color }} />
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
      <HorizontalScroller gap="12px" padding="var(--tgo-page-padding)">
        {matching.slice(0, 8).map((r) => (
          <button
            key={r.id}
            onClick={() => onNavigate(r)}
            className="text-left"
            style={{
              width: 140,
              height: 96,
              borderRadius: 'var(--tgo-radius-lg)',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
              cursor: 'pointer',
              backgroundColor: timeInfo.color,
            }}
          >
            {/* Image fallback */}
            {r.heroImage && (
              <img
                src={r.heroImage}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }}
              />
            )}

            {/* Text */}
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 10,
                right: 10,
                color: '#fff',
              }}
            >
              <p
                style={{
                  fontWeight: 700,
                  fontSize: 'var(--tgo-type-body-sm)',
                  lineHeight: 1.2,
                  textShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.name}
              </p>
            </div>
          </button>
        ))}
      </HorizontalScroller>
    </div>
  )
}
