'use client'

// ── TGO MapPin ───────────────────────────────────────────────────────────────
//
// Pin vivo en el mapa. No un marker genérico de Google Maps.
// Cada restaurante se siente vivo.
// Tiene: logo, color propio, estado, hover elegante.

import type { RestaurantCardData } from '@/types/restaurant-card'

interface Props {
  restaurant: RestaurantCardData
  isActive?: boolean
  onClick?: () => void
}

export default function MapPin({
  restaurant: r,
  isActive = false,
  onClick,
}: Props) {
  const isNetwork = r.type === 'network'
  const isOpen = r.isOpenNow === true
  const isClosed = r.isOpenNow === false

  const pinColor = isNetwork
    ? isClosed
      ? 'var(--tgo-state-inactive)'
      : isActive
        ? 'var(--tgo-brand-primary)'
        : 'var(--tgo-state-activity)'
    : 'var(--tgo-text-muted)'

  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center group"
      style={{
        transform: `scale(${isActive ? 1.2 : 1})`,
        transition: `transform var(--tgo-duration-base) var(--tgo-ease-standard)`,
      }}
    >
      {/* Pin body */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: isActive ? 44 : 36,
          height: isActive ? 44 : 36,
          borderRadius: 'var(--tgo-radius-pill)',
          backgroundColor: pinColor,
          boxShadow: isActive
            ? `0 0 0 3px var(--tgo-surface-0), 0 0 0 5px ${pinColor}, var(--tgo-elevation-floating)`
            : 'var(--tgo-elevation-floating)',
          transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
        }}
      >
        {isNetwork && r.logoUrl ? (
          <img
            src={r.logoUrl}
            alt={r.name}
            className="object-cover"
            style={{
              width: isActive ? 28 : 22,
              height: isActive ? 28 : 22,
              borderRadius: 'var(--tgo-radius-sm)',
            }}
          />
        ) : (
          <span
            style={{
              color: 'var(--tgo-text-inverse)',
              fontSize: isActive ? 14 : 11,
              fontWeight: 700,
            }}
          >
            {r.name.charAt(0)}
          </span>
        )}

        {/* Status dot */}
        {isNetwork && (
          <div
            className="absolute -bottom-0.5 -right-0.5"
            style={{
              width: 12,
              height: 12,
              borderRadius: 'var(--tgo-radius-pill)',
              backgroundColor: isOpen
                ? 'var(--tgo-state-activity)'
                : isClosed
                  ? 'var(--tgo-state-inactive)'
                  : 'var(--tgo-state-discovery)',
              border: '2px solid var(--tgo-surface-0)',
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <div
        className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--tgo-radius-sm)',
          backgroundColor: 'var(--tgo-text-primary)',
          color: 'var(--tgo-text-inverse)',
          fontSize: 'var(--tgo-type-caption)',
          fontWeight: 600,
          boxShadow: 'var(--tgo-elevation-floating)',
          transition: `opacity var(--tgo-duration-fast) var(--tgo-ease-standard)`,
          zIndex: 'var(--tgo-z-tooltip)',
        }}
      >
        {r.name}
      </div>

      {/* Pin triangle */}
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `6px solid ${pinColor}`,
          marginTop: -1,
        }}
      />
    </button>
  )
}
