'use client'

// ── NearbyListItem ───────────────────────────────────────────────────────────
//
// Componente de lista para restaurantes cercanos.
// Doc 02 §1.3: Avatar = <PuntoTGO /> en vez de logo crudo.
//
// Dos variantes según status de red:
//   - Punto TGO (live): cara completa + pulse-live
//   - Directorio (dormant): cara apagada y sin animación

import PuntoTGO from '@/components/tgo/PuntoTGO'
import { useHaptic } from '@/components/tgo/useHaptic'

interface Restaurant {
  _id: string
  name: string
  slug: string
  primaryColor?: string
  isOperational?: boolean
  distance?: number | null
  cuisineType?: string[]
  coverImage?: string
}

interface NearbyListItemProps {
  restaurant: Restaurant
  isNetwork: boolean
  onNavigate: (slug: string) => void
}

function distLabel(m: number | null | undefined) {
  if (m === null || m === undefined) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

export default function NearbyListItem({
  restaurant,
  isNetwork,
  onNavigate,
}: NearbyListItemProps) {
  const haptic = useHaptic()

  return (
    <button
      onClick={() => {
        haptic.impact('light')
        onNavigate(restaurant.slug)
      }}
      className="w-full flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition-transform"
      style={{
        backgroundColor: 'var(--tgo-surface-2)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      {/* Avatar: PuntoTGO instead of raw logo */}
      <div className="shrink-0">
        <PuntoTGO
          variant="avatar"
          size="md"
          networkStatus={isNetwork ? 'live' : 'dormant'}
        />
      </div>

      {/* Info */}
      <div className="flex-1 text-left min-w-0">
        <p
          className="font-semibold truncate"
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-body)',
          }}
        >
          {restaurant.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {restaurant.cuisineType && restaurant.cuisineType.length > 0 && (
            <span
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 'var(--tgo-type-caption)',
              }}
            >
              {restaurant.cuisineType[0]}
            </span>
          )}
          {restaurant.distance != null && (
            <>
              <span style={{ color: 'var(--tgo-text-muted)', fontSize: 8 }}>•</span>
              <span
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 'var(--tgo-type-caption)',
                }}
              >
                {distLabel(restaurant.distance)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Action button */}
      <div
        className="shrink-0 px-3 py-1.5 rounded-full font-bold"
        style={{
          backgroundColor: isNetwork ? 'var(--tgo-brand)' : 'var(--tgo-surface-1)',
          color: isNetwork ? 'var(--tgo-text-inverse)' : 'var(--tgo-text-primary)',
          fontSize: 'var(--tgo-type-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {isNetwork ? 'Pedir' : 'Ver carta'}
      </div>
    </button>
  )
}
