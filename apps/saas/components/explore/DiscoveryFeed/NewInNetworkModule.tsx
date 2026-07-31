'use client'

import { HorizontalScroller } from '@/components/tgo'
import { MapPin } from 'lucide-react'
import type { RestaurantCardData } from '@/types/restaurant-card'

const PLACEHOLDER_COLORS = ['#2D2A4B', '#0F6E56', '#B03A2E', '#5A3A26', '#262625']

interface Props {
  restaurants: RestaurantCardData[]
  onNavigate: (r: RestaurantCardData) => void
}

function distLabel(m: number | null) {
  if (m === null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

export function NewInNetworkModule({ restaurants, onNavigate }: Props) {
  const newRestaurants = restaurants.filter((r) => r.isNew)
  if (newRestaurants.length === 0) return null

  return (
    <HorizontalScroller gap="12px" padding="var(--tgo-page-padding)">
      {newRestaurants.slice(0, 6).map((r, i) => (
        <button
          key={r.id}
          onClick={() => onNavigate(r)}
          className="text-left"
          style={{
            width: 270,
            height: 150,
            borderRadius: 'var(--tgo-radius-xl)',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          {/* Image */}
          {r.heroImage ? (
            <img
              src={r.heroImage}
              alt={r.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: PLACEHOLDER_COLORS[i % 5],
              }}
            />
          )}

          {/* Gradient overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
            }}
          />

          {/* Badge NUEVO */}
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '2px 8px',
              borderRadius: 'var(--tgo-radius-pill)',
              fontSize: '0.5625rem',
              fontWeight: 700,
              letterSpacing: 'var(--tgo-tracking-wider)',
              textTransform: 'uppercase',
              color: '#fff',
              backgroundColor: 'var(--tgo-state-discovery)',
            }}
          >
            NUEVO
          </span>

          {/* Text overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 14,
              right: 14,
              color: '#fff',
            }}
          >
            <p
              style={{
                fontWeight: 700,
                fontSize: 'var(--tgo-type-subtitle)',
                lineHeight: 1.2,
                marginBottom: 4,
                textShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            >
              {r.name}
            </p>
            <div className="flex items-center gap-2">
              {r.isOpenNow === true && (
                <span
                  style={{
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                    color: 'var(--tgo-state-activity)',
                  }}
                >
                  Abierto
                </span>
              )}
              {r.isOpenNow === false && (
                <span
                  style={{
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                    color: 'var(--tgo-state-inactive)',
                  }}
                >
                  Cerrado
                </span>
              )}
              <span
                className="flex items-center gap-0.5"
                style={{
                  fontSize: '0.5625rem',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                <MapPin size={9} />
                {distLabel(r.distanceM)}
              </span>
            </div>
          </div>
        </button>
      ))}
    </HorizontalScroller>
  )
}
