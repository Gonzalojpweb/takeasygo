'use client'

// ── TGO RestaurantCard ────────────────────────────────────────────────────────
//
// Sprint 3: "La UI debe desaparecer" — el usuario percibe el estado de la ciudad.
//
// layout="hero"       → imagen izquierda 60-65%, info derecha (Home, Explore destacados)
// layout="list"       → imagen 64x64 + badge + señal operativa (Explore, Search)
// layout="compact"    → imagen 48x48, info mínima (widgets, resultados compactos)
// layout="mapPreview" → info + badge + señal (Mapa)
//
// Todos los colores vía --tgo-* tokens.

import type { RestaurantCardData } from '@/types/restaurant-card'
import { motion } from 'framer-motion'
import {
  MapPin,
  Clock,
  Utensils,
  Star,
  Bookmark,
  Footprints,
} from 'lucide-react'
import Link from 'next/link'
import {
  getOperationalStatus,
  getProximityLabel,
  getOpportunityLabel,
} from '@/lib/restaurant-card-helpers'
import { useHaptic } from '@/components/tgo/useHaptic'

function walkingMinutes(distanceM: number | null): number | null {
  if (distanceM === null) return null
  return Math.max(1, Math.round(distanceM / 80))
}

interface RestaurantCardProps {
  restaurant: RestaurantCardData
  layout?: 'hero' | 'list' | 'compact' | 'mapPreview'
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
  if (layout === 'compact') return <CompactLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} index={index} />
  if (layout === 'mapPreview') return <MapPreviewLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} />
  return <ListLayout r={r} isNetwork={isNetwork} onNavigate={onNavigate} index={index} />
}

// ── Shared: Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ r }: { r: RestaurantCardData }) {
  if (r.isNew) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5"
        style={{
          borderRadius: 'var(--tgo-radius-pill)',
          fontSize: 'var(--tgo-type-tag)',
          fontWeight: 700,
          letterSpacing: 'var(--tgo-tracking-wider)',
          textTransform: 'uppercase',
          color: '#fff',
          backgroundColor: 'var(--tgo-state-info)',
        }}
      >
        NUEVO
      </span>
    )
  }
  if (r.isOpenNow === true) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5"
        style={{
          borderRadius: 'var(--tgo-radius-pill)',
          fontSize: 'var(--tgo-type-tag)',
          fontWeight: 700,
          letterSpacing: 'var(--tgo-tracking-wider)',
          textTransform: 'uppercase',
          color: '#fff',
          backgroundColor: 'var(--tgo-state-success)',
        }}
      >
        ABIERTO
      </span>
    )
  }
  if (r.isOpenNow === false) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5"
        style={{
          borderRadius: 'var(--tgo-radius-pill)',
          fontSize: 'var(--tgo-type-tag)',
          fontWeight: 700,
          letterSpacing: 'var(--tgo-tracking-wider)',
          textTransform: 'uppercase',
          color: 'var(--tgo-text-muted)',
          backgroundColor: 'var(--tgo-surface-2)',
        }}
      >
        CERRADO
      </span>
    )
  }
  return null
}

// ── Shared: Operational Signal Box ────────────────────────────────────────────

function OperationalSignalBox({ r }: { r: RestaurantCardData }) {
  const signal = getOperationalStatus(r)
  if (!signal) return null

  const Icon = signal.icon

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        borderRadius: 'var(--tgo-radius-md)',
        backgroundColor: 'var(--tgo-surface-1)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      <Icon
        size={14}
        style={{
          color:
            signal.variant === 'active'
              ? 'var(--tgo-state-danger)'
              : signal.variant === 'calm'
                ? 'var(--tgo-state-interactive)'
                : signal.variant === 'new'
                  ? 'var(--tgo-state-info)'
                  : signal.variant === 'benefit'
                    ? 'var(--tgo-state-warning)'
                    : 'var(--tgo-state-success)',
        }}
      />
      <span
        style={{
          color: 'var(--tgo-text-primary)',
          fontSize: 'var(--tgo-type-caption)',
          fontWeight: 500,
        }}
      >
        {signal.label}
      </span>
    </div>
  )
}

// ── HERO (imagen izquierda 60-65%, info derecha) ─────────────────────────────

function HeroLayout({
  r,
  isNetwork,
  onNavigate,
  index,
}: {
  r: RestaurantCardData
  isNetwork: boolean
  onNavigate?: () => void
  index: number
}) {
  const haptic = useHaptic()
  const proximity = getProximityLabel(r.distanceM, walkingMinutes(r.distanceM) ?? undefined)
  const opportunity = getOpportunityLabel(r.loyaltyInfo)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      onClick={() => { haptic.impact('light'); onNavigate?.() }}
      className="relative flex overflow-hidden cursor-pointer group active:scale-[0.98]"
      style={{
        borderRadius: 'var(--tgo-radius-lg)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: '1px solid var(--tgo-border)',
        boxShadow: 'var(--tgo-elevation-card)',
        transition: `transform var(--tgo-duration-base) var(--tgo-ease-standard)`,
        animationDelay: `${index * 80}ms`,
        height: 200,
      }}
    >
      {/* Image — left 60-65% */}
      <div className="relative shrink-0 overflow-hidden" style={{ width: '62%' }}>
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

        {/* Badge overlay — top left */}
        <div className="absolute top-3 left-3">
          <StatusBadge r={r} />
        </div>

        {/* Bookmark — top right */}
        <button
          className="absolute top-3 right-3 flex items-center justify-center opacity-0 group-hover:opacity-100"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--tgo-radius-pill)',
            backgroundColor: 'rgba(255,255,255,0.9)',
            transition: `opacity var(--tgo-duration-fast) var(--tgo-ease-standard)`,
          }}
          onClick={(e) => { haptic.selection(); e.stopPropagation() }}
        >
          <Bookmark size={14} style={{ color: 'var(--tgo-text-primary)' }} />
        </button>
      </div>

      {/* Info — right side */}
      <div className="flex-1 flex flex-col justify-between p-4 min-w-0">
        {/* Top: name + cuisine */}
        <div>
          <h3
            className="leading-tight mb-1"
            style={{
              color: 'var(--tgo-text-primary)',
              fontSize: 'var(--tgo-type-title)',
              fontWeight: 700,
            }}
          >
            {r.name}
          </h3>
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
            <p
              className="truncate"
              style={{
                color: 'var(--tgo-text-secondary)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 500,
              }}
            >
              {r.cuisineTypes.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>

        {/* Middle: operational signal */}
        <OperationalSignalBox r={r} />

        {/* Bottom: proximity + opportunity */}
        <div className="flex items-center gap-2 flex-wrap">
          {proximity && (
            <span
              className="flex items-center gap-1"
              style={{
                color: 'var(--tgo-text-secondary)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 500,
              }}
            >
              <proximity.icon size={10} />
              {proximity.label}
            </span>
          )}
          {opportunity && (
            <span
              className="flex items-center gap-1"
              style={{
                color: 'var(--tgo-state-warning)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 600,
              }}
            >
              <opportunity.icon size={10} />
              {opportunity.label}
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
    </motion.div>
  )
}

// ── LIST (imagen 64x64 + badge + señal operativa) ────────────────────────────

function ListLayout({
  r,
  isNetwork,
  onNavigate,
  index,
}: {
  r: RestaurantCardData
  isNetwork: boolean
  onNavigate?: () => void
  index: number
}) {
  const haptic = useHaptic()
  const proximity = getProximityLabel(r.distanceM, walkingMinutes(r.distanceM) ?? undefined)
  const opportunity = getOpportunityLabel(r.loyaltyInfo)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      onClick={() => { haptic.impact('light'); onNavigate?.() }}
      className="relative flex items-center gap-4 cursor-pointer group active:scale-[0.99]"
      style={{
        padding: 'var(--tgo-card-padding)',
        borderRadius: 'var(--tgo-radius-lg)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: '1px solid var(--tgo-border)',
        boxShadow: 'var(--tgo-elevation-card)',
        transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
        animationDelay: `${index * 80}ms`,
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
          <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : r.heroImage ? (
          <img src={r.heroImage} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <Utensils size={20} style={{ color: 'var(--tgo-text-muted)' }} />
        )}
        {/* Badge overlay */}
        <div className="absolute -bottom-0.5 -right-0.5">
          {r.isNew ? (
            <span
              className="flex items-center justify-center"
              style={{
                width: 18,
                height: 18,
                borderRadius: 'var(--tgo-radius-pill)',
                backgroundColor: 'var(--tgo-state-info)',
                border: '2px solid var(--tgo-surface-card)',
                color: '#fff',
                fontSize: 8,
                fontWeight: 700,
              }}
            >
              N
            </span>
          ) : r.isOpenNow === true ? (
            <span
              className="flex items-center justify-center"
              style={{
                width: 18,
                height: 18,
                borderRadius: 'var(--tgo-radius-pill)',
                backgroundColor: 'var(--tgo-state-success)',
                border: '2px solid var(--tgo-surface-card)',
              }}
            />
          ) : r.isOpenNow === false ? (
            <span
              className="flex items-center justify-center"
              style={{
                width: 18,
                height: 18,
                borderRadius: 'var(--tgo-radius-pill)',
                backgroundColor: 'var(--tgo-state-danger)',
                border: '2px solid var(--tgo-surface-card)',
              }}
            />
          ) : null}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            className="truncate leading-tight"
            style={{
              color: 'var(--tgo-text-primary)',
              fontSize: 'var(--tgo-type-body-sm)',
              fontWeight: 600,
            }}
          >
            {r.name}
          </h3>
          <StatusBadge r={r} />
        </div>

        {/* Operational signal — inline */}
        {r.isOpenNow === true && r.isOperational !== false && (
          <div className="mt-1">
            <OperationalSignalBox r={r} />
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {proximity && (
            <span
              className="flex items-center gap-1"
              style={{
                color: 'var(--tgo-text-secondary)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 500,
              }}
            >
              <proximity.icon size={10} />
              {proximity.label}
            </span>
          )}
          {r.estimatedPickupTime && isNetwork && r.isOperational !== false && (
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
          {opportunity && (
            <>
              <span style={{ color: 'var(--tgo-border)' }}>·</span>
              <span
                className="flex items-center gap-1"
                style={{
                  color: 'var(--tgo-state-warning)',
                  fontSize: 'var(--tgo-type-caption)',
                  fontWeight: 600,
                }}
              >
                <opportunity.icon size={10} />
                {opportunity.label}
              </span>
            </>
          )}
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <>
              <span style={{ color: 'var(--tgo-border)' }}>·</span>
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
            </>
          )}
        </div>
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
          <span
            style={{
              color: r.isOpenNow === true ? 'var(--tgo-state-success)' : 'var(--tgo-text-muted)',
              fontSize: 'var(--tgo-type-caption)',
              fontWeight: 600,
            }}
          >
            {r.isOpenNow === true ? 'Abierto' : r.isOpenNow === false ? 'Cerrado' : ''}
          </span>
        )}
      </div>
    </motion.div>
  )
}

// ── COMPACT (imagen 48x48, info mínima) ───────────────────────────────────────

function CompactLayout({
  r,
  isNetwork,
  onNavigate,
  index,
}: {
  r: RestaurantCardData
  isNetwork: boolean
  onNavigate?: () => void
  index: number
}) {
  const haptic = useHaptic()
  const proximity = getProximityLabel(r.distanceM)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      onClick={() => { haptic.impact('light'); onNavigate?.() }}
      className="flex items-center gap-3 cursor-pointer group active:scale-[0.98]"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--tgo-radius-md)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: '1px solid var(--tgo-border)',
        transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--tgo-border-active)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--tgo-border)'
      }}
    >
      {/* Image */}
      <div
        className="relative shrink-0 overflow-hidden flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--tgo-radius-sm)',
          backgroundColor: 'var(--tgo-surface-1)',
        }}
      >
        {isNetwork && r.logoUrl ? (
          <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : r.heroImage ? (
          <img src={r.heroImage} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <Utensils size={16} style={{ color: 'var(--tgo-text-muted)' }} />
        )}
      </div>

      {/* Info — one line */}
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-body-sm)',
            fontWeight: 600,
          }}
        >
          {r.name}
        </p>
        <div className="flex items-center gap-1.5">
          {r.isOpenNow === true && (
            <span
              style={{
                color: 'var(--tgo-state-success)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Abierto
            </span>
          )}
          {r.estimatedPickupTime && isNetwork && r.isOperational !== false && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-text-secondary)',
                fontSize: 10,
              }}
            >
              <Clock size={8} />
              {r.estimatedPickupTime} min
            </span>
          )}
          {proximity && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 10,
              }}
            >
              <proximity.icon size={8} />
              {proximity.label}
            </span>
          )}
          {r.loyaltyInfo?.hasActivePromo && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-state-warning)',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              Promo
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── MAP PREVIEW (info + badge + señal) ────────────────────────────────────────

function MapPreviewLayout({
  r,
  isNetwork,
  onNavigate,
}: {
  r: RestaurantCardData
  isNetwork: boolean
  onNavigate?: () => void
}) {
  const haptic = useHaptic()
  const proximity = getProximityLabel(r.distanceM)
  const opportunity = getOpportunityLabel(r.loyaltyInfo)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      onClick={() => { haptic.impact('light'); onNavigate?.() }}
      className="flex items-center gap-3 cursor-pointer"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--tgo-radius-md)',
        backgroundColor: 'var(--tgo-surface-card)',
        boxShadow: 'var(--tgo-elevation-floating)',
        border: '1px solid var(--tgo-border)',
        maxWidth: 240,
      }}
    >
      {/* Image */}
      <div
        className="relative shrink-0 overflow-hidden flex items-center justify-center"
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--tgo-radius-sm)',
          backgroundColor: 'var(--tgo-surface-1)',
        }}
      >
        {isNetwork && r.logoUrl ? (
          <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : r.heroImage ? (
          <img src={r.heroImage} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <Utensils size={14} style={{ color: 'var(--tgo-text-muted)' }} />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
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
          <StatusBadge r={r} />
        </div>
        {r.cuisineTypes && r.cuisineTypes.length > 0 && (
          <p
            className="truncate"
            style={{
              color: 'var(--tgo-text-muted)',
              fontSize: 10,
            }}
          >
            {r.cuisineTypes.slice(0, 1).join('')}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {r.estimatedPickupTime && isNetwork && r.isOperational !== false && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-state-success)',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <Clock size={8} />
              {r.estimatedPickupTime} min
            </span>
          )}
          {proximity && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 10,
              }}
            >
              <proximity.icon size={8} />
              {proximity.label}
            </span>
          )}
          {opportunity && (
            <span
              className="flex items-center gap-0.5"
              style={{
                color: 'var(--tgo-state-warning)',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <opportunity.icon size={8} />
              {opportunity.label}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
