'use client'

// ── DiscoverCard ─────────────────────────────────────────────────────────────
//
// Card vertical para secciones "Recomendados" y "Hoy podés aprovechar" de Descubrí.
// 132px ancho, avatar 52×52, PuntoTGO badge, tag de estado, info centrada.
// TGO Foundations: tokens para todo, sin colores hardcodeados.

import PuntoTGO from '@/components/tgo/PuntoTGO'
import { Star } from 'lucide-react'

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

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center shrink-0 active:scale-[0.97] transition-transform"
      style={{
        width: 132,
        padding: '14px 12px',
        borderRadius: 18,
        backgroundColor: 'var(--tgo-surface-2)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      {/* Avatar container */}
      <div className="relative mb-2">
        {/* Avatar */}
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: placeholderColor,
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
              bottom: -4,
              right: -6,
              filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))',
            }}
          >
            <PuntoTGO expression={expression} size="xs" animate={false} />
          </div>
        )}
      </div>

      {/* Tag */}
      {hasPromo ? (
        <span
          className="mb-1.5"
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--tgo-radius-pill)',
            fontSize: 9,
            fontWeight: 700,
            backgroundColor: 'var(--tgo-state-discovery-soft)',
            color: 'var(--tgo-state-discovery)',
          }}
        >
          {promoLabel}
        </span>
      ) : isOpenNow ? (
        <span
          className="mb-1.5"
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--tgo-radius-pill)',
            fontSize: 9,
            fontWeight: 700,
            backgroundColor: 'var(--tgo-state-activity-soft)',
            color: 'var(--tgo-state-activity)',
          }}
        >
          ABIERTO
        </span>
      ) : (
        <div className="mb-1.5" />
      )}

      {/* Name */}
      <p
        className="text-center truncate w-full"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--tgo-text-primary)',
          lineHeight: 1.2,
        }}
      >
        {name}
      </p>

      {/* Category + stars */}
      <div
        className="flex items-center gap-1 mt-0.5"
        style={{
          fontSize: 10,
          color: 'var(--tgo-text-muted)',
        }}
      >
        {cuisineType && cuisineType.length > 0 && (
          <span>{cuisineType[0]}</span>
        )}
        {rating != null && rating > 0 && (
          <>
            <span>·</span>
            <Star size={9} fill="var(--tgo-state-warning)" stroke="none" />
            <span>{rating.toFixed(1)}</span>
          </>
        )}
      </div>

      {/* Distance */}
      {distanceLabel && (
        <p
          className="mt-0.5"
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--tgo-text-muted)',
          }}
        >
          {distanceLabel}
        </p>
      )}
    </button>
  )
}
