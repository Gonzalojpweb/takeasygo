'use client'

// ── TGO RestaurantCard ────────────────────────────────────────────────────────
//
// Componente de negocio versátil.
// Un solo componente, múltiples layouts:
//   layout="hero"   → card horizontal con foto grande (280×200)
//   layout="list"   → card vertical compacta (lista de resultados)
//   layout="grid"   → card para grilla
//   layout="map"    → pin/mini card para mapa
//
// NO usar variantes separadas. Un componente, layout prop.
//
// Todos los colores vía --tgo-* tokens.

import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { MapPin, Clock, Utensils, Star } from 'lucide-react'
import Link from 'next/link'

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

function StatusDot({ isOpen }: { isOpen: boolean | null }) {
  if (isOpen === null) return null
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full"
      style={{
        backgroundColor: isOpen
          ? 'var(--tgo-state-success)'
          : 'var(--tgo-state-danger)',
      }}
    />
  )
}

function StatusText({ isOpen }: { isOpen: boolean | null }) {
  if (isOpen === null) return null
  return (
    <span
      style={{
        color: isOpen
          ? 'var(--tgo-state-success)'
          : 'var(--tgo-state-danger)',
      }}
    >
      {isOpen ? 'Abierto' : 'Cerrado'}
    </span>
  )
}

interface RestaurantCardProps {
  restaurant: NearbyRestaurant
  layout?: 'hero' | 'list' | 'grid' | 'map'
  onNavigate?: () => void
  index?: number
}

export default function RestaurantCard({
  restaurant: r,
  layout = 'list',
  onNavigate,
  index = 0,
}: RestaurantCardProps) {
  const isNetwork = r.type === 'network'

  if (layout === 'hero') return <HeroLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} index={index} />
  if (layout === 'grid') return <GridLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} index={index} />
  if (layout === 'map') return <MapLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} />
  return <ListLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} />
}

// ── HERO (horizontal scroll, large) ──────────────────────────────────────────

function HeroLayout({
  r,
  isNetwork,
  onNavigate,
  index,
}: {
  r: NearbyRestaurant
  isNetwork: boolean
  onNavigate?: () => void
  index: number
}) {
  return (
    <div
      onClick={onNavigate}
      className="relative shrink-0 w-[260px] h-[180px] overflow-hidden cursor-pointer group active:scale-[0.98]"
      style={{
        borderRadius: 'var(--tgo-radius-lg)',
        transition: `transform var(--tgo-duration-base) var(--tgo-ease-standard)`,
        animationDelay: `${index * 80}ms`,
      }}
    >
      {r.heroImage ? (
        <img
          src={r.heroImage}
          alt={r.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: isNetwork
              ? `linear-gradient(135deg, var(--tgo-surface-0) 0%, ${r.primaryColor || 'var(--tgo-surface-2)'} 50%, var(--tgo-surface-0) 100%)`
              : `linear-gradient(135deg, var(--tgo-surface-1) 0%, var(--tgo-surface-2) 100%)`,
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.40) 40%, rgba(0,0,0,0.08) 70%, transparent 100%)',
        }}
      />

      {/* Top badges — max 2 */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
        {isNetwork && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5"
            style={{
              borderRadius: 'var(--tgo-radius-pill)',
              fontSize: 'var(--tgo-type-tag)',
              fontWeight: 700,
              letterSpacing: 'var(--tgo-tracking-wider)',
              textTransform: 'uppercase',
              color: r.isOperational === false
                ? 'var(--tgo-state-warning)'
                : 'var(--tgo-state-success)',
              backgroundColor: r.isOperational === false
                ? 'var(--tgo-state-warning-soft)'
                : 'var(--tgo-state-success-soft)',
            }}
          >
            {r.isOperational === false ? 'Próximamente' : 'Red TGO'}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5"
          style={{
            borderRadius: 'var(--tgo-radius-pill)',
            fontSize: 'var(--tgo-type-caption)',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: 'rgba(0,0,0,0.48)',
            marginLeft: 'auto',
          }}
        >
          <MapPin size={10} />
          {distLabel(r.distanceM)}
        </span>
      </div>

      {/* Bottom info — clean hierarchy */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3
          className="leading-tight mb-1"
          style={{
            color: '#fff',
            fontSize: 'var(--tgo-type-title)',
            fontWeight: 700,
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          {r.name}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
            <span
              className="flex items-center gap-1"
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 500,
              }}
            >
              {r.cuisineTypes.slice(0, 2).join(' · ')}
            </span>
          )}
          {isNetwork && r.isOperational !== false && r.estimatedPickupTime && (
            <span
              className="flex items-center gap-1"
              style={{
                color: 'var(--tgo-state-success)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 600,
              }}
            >
              <Clock size={10} />~{r.estimatedPickupTime} min
            </span>
          )}
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-state-warning)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 700,
              }}
            >
              <Star size={10} className="fill-current" />
              {r.averageRating.toFixed(1)}
            </span>
          )}
        </div>

        {r.loyaltyInfo &&
          (r.loyaltyInfo.hasClub || r.loyaltyInfo.hasActivePromo) && (
            <div className="flex items-center gap-1.5 mt-2">
              {r.loyaltyInfo.hasClub && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-[2px]"
                  style={{
                    borderRadius: 'var(--tgo-radius-pill)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    backgroundColor: 'var(--tgo-state-success)',
                  }}
                >
                  Club
                </span>
              )}
              {r.loyaltyInfo.hasActivePromo && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-[2px]"
                  style={{
                    borderRadius: 'var(--tgo-radius-pill)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    backgroundColor: 'var(--tgo-state-warning)',
                  }}
                >
                  Promo
                </span>
              )}
            </div>
          )}
      </div>

      {/* Hover CTA */}
      {isNetwork && r.isOperational !== false && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
          style={{
            backgroundColor: 'rgba(26,26,26,0.32)',
            transition: `opacity var(--tgo-duration-fast) var(--tgo-ease-standard)`,
          }}
        >
          <span
            className="px-5 py-2.5"
            style={{
              borderRadius: 'var(--tgo-radius-pill)',
              backgroundColor: 'var(--tgo-surface-0)',
              color: 'var(--tgo-text-primary)',
              fontSize: 'var(--tgo-type-body-sm)',
              fontWeight: 600,
            }}
          >
            Ver carta
          </span>
        </div>
      )}
    </div>
  )
}

// ── LIST (vertical compact) ──────────────────────────────────────────────────

function ListLayout({
  r,
  isNetwork,
  onNavigate,
}: {
  r: NearbyRestaurant
  isNetwork: boolean
  onNavigate?: () => void
}) {
  return (
    <div
      onClick={onNavigate}
      className="relative flex items-center gap-4 cursor-pointer group active:scale-[0.99]"
      style={{
        padding: 'var(--tgo-card-padding)',
        borderRadius: 'var(--tgo-radius-lg)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: '1px solid var(--tgo-border)',
        boxShadow: 'var(--tgo-elevation-card)',
        transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--tgo-border-active)'
        e.currentTarget.style.boxShadow = 'var(--tgo-elevation-floating)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--tgo-border)'
        e.currentTarget.style.boxShadow = 'var(--tgo-elevation-card)'
      }}
    >
      {/* Image */}
      <div
        className="relative shrink-0 overflow-hidden flex items-center justify-center"
        style={{
          width: 64,
          height: 64,
          borderRadius: 'var(--tgo-radius-md)',
          backgroundColor: 'var(--tgo-surface-1)',
        }}
      >
        {isNetwork && r.logoUrl ? (
          <img
            src={r.logoUrl}
            alt={r.name}
            className="w-full h-full object-cover"
          />
        ) : r.heroImage ? (
          <img
            src={r.heroImage}
            alt={r.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Utensils size={20} style={{ color: 'var(--tgo-text-muted)' }} />
        )}
        {isNetwork && (
          <div
            className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center"
            style={{
              width: 18,
              height: 18,
              borderRadius: 'var(--tgo-radius-pill)',
              backgroundColor:
                r.isOperational === false
                  ? 'var(--tgo-state-warning)'
                  : 'var(--tgo-state-success)',
              border: '2px solid var(--tgo-surface-card)',
            }}
          >
            <span
              style={{
                color: 'var(--tgo-text-inverse)',
                fontSize: 8,
                fontWeight: 700,
              }}
            >
              {r.isOperational === false ? '★' : '✓'}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3
          className="truncate leading-tight mb-0.5"
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-body-sm)',
            fontWeight: 600,
          }}
        >
          {r.name}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="flex items-center gap-1"
            style={{
              color: 'var(--tgo-text-secondary)',
              fontSize: 'var(--tgo-type-caption)',
              fontWeight: 600,
            }}
          >
            <MapPin
              size={10}
              style={{ color: 'var(--tgo-state-interactive)' }}
            />
            {distLabel(r.distanceM)}
          </span>
          {isNetwork &&
            r.isOperational !== false &&
            r.estimatedPickupTime && (
              <>
                <span style={{ color: 'var(--tgo-border)' }}>·</span>
                <span
                  className="flex items-center gap-1"
                  style={{
                    color: 'var(--tgo-state-success)',
                    fontSize: 'var(--tgo-type-caption)',
                    fontWeight: 600,
                  }}
                >
                  <Clock size={10} />
                  {r.estimatedPickupTime} min
                </span>
              </>
            )}
          {isNetwork && r.isOperational === false && (
            <span
              style={{
                color: 'var(--tgo-state-warning)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tgo-tracking-widest)',
              }}
            >
              Catálogo
            </span>
          )}
        </div>
        {r.cuisineTypes && r.cuisineTypes.length > 0 && (
          <p
            className="truncate mt-0.5"
            style={{
              color: 'var(--tgo-text-muted)',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tgo-tracking-tight)',
            }}
          >
            {r.cuisineTypes.join(' · ')}
          </p>
        )}
        {isNetwork &&
          r.averageRating != null &&
          r.ratingCount != null &&
          r.ratingCount > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Star
                size={10}
                className="fill-current"
                style={{ color: 'var(--tgo-state-warning)' }}
              />
              <span
                style={{
                  color: 'var(--tgo-state-warning)',
                  fontSize: 'var(--tgo-type-caption)',
                  fontWeight: 700,
                }}
              >
                {r.averageRating.toFixed(1)}
              </span>
              <span
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 'var(--tgo-type-caption)',
                }}
              >
                ({r.ratingCount})
              </span>
            </div>
          )}
        {r.loyaltyInfo &&
          (r.loyaltyInfo.hasClub || r.loyaltyInfo.hasActivePromo) && (
            <div className="flex items-center gap-1 mt-1">
              {r.loyaltyInfo.hasClub && (
                <span
                  className="inline-flex items-center gap-0.5 px-1 py-[1px]"
                  style={{
                    borderRadius: 'var(--tgo-radius-pill)',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--tgo-state-success)',
                    backgroundColor: 'var(--tgo-state-success-soft)',
                  }}
                >
                  Club
                </span>
              )}
              {r.loyaltyInfo.hasActivePromo && (
                <span
                  className="inline-flex items-center gap-0.5 px-1 py-[1px]"
                  style={{
                    borderRadius: 'var(--tgo-radius-pill)',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--tgo-state-warning)',
                    backgroundColor: 'var(--tgo-state-warning-soft)',
                  }}
                >
                  Promo
                </span>
              )}
            </div>
          )}
      </div>

      {/* CTA */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {isNetwork ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center gap-1.5"
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--tgo-radius-md)',
              fontSize: 'var(--tgo-type-caption)',
              fontWeight: 600,
              backgroundColor:
                r.isOperational === false
                  ? 'var(--tgo-surface-2)'
                  : 'var(--tgo-state-interactive)',
              color:
                r.isOperational === false
                  ? 'var(--tgo-text-muted)'
                  : 'var(--tgo-text-inverse)',
              transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
            }}
          >
            {r.isOperational === false ? 'Ver carta' : 'Pedir'}
          </Link>
        ) : (
          <StatusText isOpen={r.isOpenNow} />
        )}
      </div>
    </div>
  )
}

// ── GRID ─────────────────────────────────────────────────────────────────────

function GridLayout({
  r,
  isNetwork,
  onNavigate,
  index,
}: {
  r: NearbyRestaurant
  isNetwork: boolean
  onNavigate?: () => void
  index: number
}) {
  return (
    <div
      onClick={onNavigate}
      className="overflow-hidden cursor-pointer group active:scale-[0.98]"
      style={{
        borderRadius: 'var(--tgo-radius-lg)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: '1px solid var(--tgo-border)',
        boxShadow: 'var(--tgo-elevation-card)',
        transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
      }}
    >
      {/* Image */}
      <div className="relative overflow-hidden" style={{ height: 120 }}>
        {r.heroImage ? (
          <img
            src={r.heroImage}
            alt={r.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: isNetwork
                ? `linear-gradient(135deg, var(--tgo-surface-0) 0%, ${r.primaryColor || 'var(--tgo-surface-2)'} 50%, var(--tgo-surface-0) 100%)`
                : `linear-gradient(135deg, var(--tgo-surface-1) 0%, var(--tgo-surface-2) 100%)`,
            }}
          />
        )}
        {/* Status */}
        <div className="absolute top-2 right-2">
          <StatusDot isOpen={isNetwork ? r.isOperational !== false : null} />
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <h3
          className="truncate leading-tight mb-0.5"
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-body-sm)',
            fontWeight: 600,
          }}
        >
          {r.name}
        </h3>
        <div className="flex items-center gap-1">
          <span
            style={{
              color: 'var(--tgo-text-muted)',
              fontSize: 'var(--tgo-type-caption)',
            }}
          >
            {distLabel(r.distanceM)}
          </span>
          {isNetwork &&
            r.isOperational !== false &&
            r.estimatedPickupTime && (
              <span
                className="flex items-center gap-0.5"
                style={{
                  color: 'var(--tgo-state-success)',
                  fontSize: 'var(--tgo-type-caption)',
                  fontWeight: 600,
                }}
              >
                <Clock size={9} />
                {r.estimatedPickupTime} min
              </span>
            )}
        </div>
      </div>
    </div>
  )
}

// ── MAP (mini card for map view) ─────────────────────────────────────────────

function MapLayout({
  r,
  isNetwork,
  onNavigate,
}: {
  r: NearbyRestaurant
  isNetwork: boolean
  onNavigate?: () => void
}) {
  return (
    <div
      onClick={onNavigate}
      className="flex items-center gap-2 cursor-pointer"
      style={{
        padding: '8px 12px',
        borderRadius: 'var(--tgo-radius-md)',
        backgroundColor: 'var(--tgo-surface-card)',
        boxShadow: 'var(--tgo-elevation-floating)',
        border: '1px solid var(--tgo-border)',
        maxWidth: 200,
      }}
    >
      {isNetwork && r.logoUrl ? (
        <img
          src={r.logoUrl}
          alt={r.name}
          className="shrink-0 object-cover"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--tgo-radius-sm)',
          }}
        />
      ) : (
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--tgo-radius-sm)',
            backgroundColor: 'var(--tgo-surface-2)',
          }}
        >
          <Utensils size={12} style={{ color: 'var(--tgo-text-muted)' }} />
        </div>
      )}
      <div className="min-w-0">
        <p
          className="truncate"
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-caption)',
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {r.name}
        </p>
        <p
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 10,
          }}
        >
          {distLabel(r.distanceM)}
        </p>
      </div>
    </div>
  )
}
