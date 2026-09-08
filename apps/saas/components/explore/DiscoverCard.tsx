'use client'

// ── DiscoverCard ─────────────────────────────────────────────────────────────
//
// Card horizontal para "Recomendados" de Descubrí.
// Ancha (320px) para que el texto respire sin scroll interno.

import PuntoTGO from '@/components/tgo/PuntoTGO'
import { Star, MapPin } from 'lucide-react'

interface Props {
  name: string
  cuisineType?: string[]
  rating?: number
  distanceLabel?: string
  logoUrl?: string | null
  placeholderColor?: string
  isNetwork: boolean
  isOpenNow?: boolean
  promoLabel?: string | null
  expression?: 'happy' | 'sleepy' | 'wink'
  onClick?: () => void
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export default function DiscoverCard({
  name,
  cuisineType,
  rating,
  distanceLabel,
  logoUrl,
  placeholderColor = 'var(--tgo-surface-2)',
  isNetwork,
  isOpenNow,
  promoLabel,
  expression = 'happy',
  onClick,
}: Props) {
  const initials = getInitials(name)
  const hasPromo = promoLabel && promoLabel.length > 0
  const isOpen = isOpenNow === true
  const isClosed = isOpenNow === false

  return (
    <button
      onClick={onClick}
      className="shrink-0 text-left active:scale-[0.97] transition-transform relative"
      style={{
        width: 320,
        padding: '14px 16px',
        borderRadius: 20,
        backgroundColor: 'var(--tgo-surface-1)',
        border: '1px solid var(--tgo-border)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        overflow: 'hidden',
      }}
    >
      {/* Status badge — top right */}
      {isClosed && (
        <span
          className="absolute top-3 right-3 px-2 py-1"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 6,
            backgroundColor: 'var(--tgo-state-inactive-soft)',
            color: 'var(--tgo-state-inactive)',
            zIndex: 2,
          }}
        >
          CERRADO
        </span>
      )}
      {isOpen && !hasPromo && (
        <span
          className="absolute top-3 right-3 px-2 py-1"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 6,
            backgroundColor: 'var(--tgo-state-activity-soft)',
            color: 'var(--tgo-state-activity)',
            zIndex: 2,
          }}
        >
          ABIERTO
        </span>
      )}
      {hasPromo && (
        <span
          className="absolute top-3 right-3 px-2 py-1"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 6,
            backgroundColor: 'var(--tgo-state-reward-soft)',
            color: 'var(--tgo-state-reward)',
            zIndex: 2,
          }}
        >
          PROMO
        </span>
      )}

      {/* Logo */}
      <div className="relative shrink-0">
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: logoUrl ? 'transparent' : placeholderColor,
            border: logoUrl ? '1px solid var(--tgo-border)' : 'none',
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--tgo-text-inverse)' }}>
              {initials}
            </span>
          )}
        </div>

        {isNetwork && (
          <div
            className="absolute"
            style={{ bottom: -3, right: -5, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' }}
          >
            <PuntoTGO expression={expression} size="xs" animate={false} />
          </div>
        )}
      </div>

      {/* Content — wraps naturally */}
      <div className="flex-1 min-w-0 flex flex-col pr-6">
        <p className="text-[15px] font-bold leading-snug" style={{ color: 'var(--tgo-text-primary)' }}>
          {name}
        </p>

        {cuisineType && cuisineType.length > 0 && (
          <p className="text-sm mt-1" style={{ color: 'var(--tgo-text-muted)' }}>
            {cuisineType[0]}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {rating != null && rating > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--tgo-text-primary)' }}>
              <Star size={13} fill="var(--tgo-state-discovery)" stroke="var(--tgo-state-discovery)" />
              {rating.toFixed(1)}
            </span>
          )}
          {distanceLabel && (
            <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--tgo-text-muted)' }}>
              <MapPin size={11} />
              {distanceLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
