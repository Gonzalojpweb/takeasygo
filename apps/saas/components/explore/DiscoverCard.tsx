'use client'

// ── DiscoverCard ─────────────────────────────────────────────────────────────
//
// Card horizontal para secciones "Recomendados" de Descubrí.
// Layout: logo izquierda + contenido derecha, badge status top-right.
// Estilo similar a Farmacity/ON FIT del referente visual.

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
        width: 220,
        height: 100,
        padding: '12px 14px',
        borderRadius: 18,
        backgroundColor: 'var(--tgo-surface-1)',
        border: '1px solid var(--tgo-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Status badge — top right */}
      {isClosed && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5"
          style={{
            fontSize: 8,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 4,
            backgroundColor: 'var(--tgo-state-inactive-soft)',
            color: 'var(--tgo-state-inactive)',
          }}
        >
          CERRADO
        </span>
      )}
      {isOpen && !hasPromo && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5"
          style={{
            fontSize: 8,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 4,
            backgroundColor: 'var(--tgo-state-activity-soft)',
            color: 'var(--tgo-state-activity)',
          }}
        >
          ABIERTO
        </span>
      )}
      {hasPromo && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5"
          style={{
            fontSize: 8,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 4,
            backgroundColor: 'var(--tgo-state-reward-soft)',
            color: 'var(--tgo-state-reward)',
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
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: logoUrl ? 'transparent' : placeholderColor,
            border: logoUrl ? '1px solid var(--tgo-border)' : 'none',
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--tgo-text-inverse)',
              }}
            >
              {initials}
            </span>
          )}
        </div>

        {/* PuntoTGO badge */}
        {isNetwork && (
          <div
            className="absolute"
            style={{
              bottom: -3,
              right: -5,
              filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))',
            }}
          >
            <PuntoTGO expression={expression} size="xs" animate={false} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Name */}
        <p
          className="font-bold text-[14px] leading-tight truncate"
          style={{ color: 'var(--tgo-text-primary)' }}
        >
          {name}
        </p>

        {/* Category */}
        {cuisineType && cuisineType.length > 0 && (
          <p
            className="text-[11px] truncate mt-0.5"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            {cuisineType[0]}
          </p>
        )}

        {/* Meta: rating + distance */}
        <div className="flex items-center gap-1.5 mt-1">
          {rating != null && rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: 'var(--tgo-text-primary)' }}>
              <Star size={10} fill="var(--tgo-state-discovery)" stroke="var(--tgo-state-discovery)" />
              {rating.toFixed(1)}
            </span>
          )}
          {distanceLabel && (
            <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--tgo-text-muted)' }}>
              <MapPin size={9} />
              {distanceLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
