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

import { memo } from 'react'
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

const PLACEHOLDER_COLORS = ['#2D2A4B', '#0F6E56', '#B03A2E', '#5A3A26', '#262625']

// ── Static Style Constants ──────────────────────────────────────────────────

// Badge styles
const BADGE_NUEVO: React.CSSProperties = {
  borderRadius: 'var(--tgo-radius-pill)',
  fontSize: '0.5625rem',
  fontWeight: 600,
  letterSpacing: 'var(--tgo-tracking-wider)',
  textTransform: 'uppercase',
  color: '#854F0B',
  backgroundColor: 'var(--tgo-state-discovery-soft)',
  padding: '1px 7px',
  lineHeight: 1.4,
}
const BADGE_ABIERTO: React.CSSProperties = {
  ...BADGE_NUEVO,
  color: '#0F6E56',
  backgroundColor: 'var(--tgo-state-activity-soft)',
}
const BADGE_CERRADO: React.CSSProperties = {
  ...BADGE_NUEVO,
  color: 'var(--tgo-text-muted)',
  backgroundColor: 'transparent',
}

// Small badge (N / open dot / closed dot)
const BADGE_N: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 'var(--tgo-radius-pill)',
  backgroundColor: 'var(--tgo-state-info)',
  border: '2px solid var(--tgo-card)',
  color: '#fff',
  fontSize: 8,
  fontWeight: 700,
}
const DOT_OPEN: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 'var(--tgo-radius-pill)',
  backgroundColor: 'var(--tgo-state-success)',
  border: '2px solid var(--tgo-card)',
}
const DOT_CLOSED: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 'var(--tgo-radius-pill)',
  backgroundColor: 'var(--tgo-state-danger)',
  border: '2px solid var(--tgo-card)',
}

// Image containers
const IMAGE_60: React.CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: 16,
  backgroundColor: 'var(--tgo-surface-1)',
  flexShrink: 0,
}
const IMAGE_48: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 'var(--tgo-radius-sm)',
  backgroundColor: 'var(--tgo-surface-1)',
}
const IMAGE_40: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 'var(--tgo-radius-sm)',
  backgroundColor: 'var(--tgo-surface-1)',
}

// Signal container
const SIGNAL_CONTAINER: React.CSSProperties = {
  borderRadius: 'var(--tgo-radius-md)',
  backgroundColor: 'var(--tgo-surface-1)',
  border: '1px solid var(--tgo-border)',
}
const SIGNAL_LABEL: React.CSSProperties = {
  color: 'var(--tgo-text-primary)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 500,
}

// Text styles (repeated across layouts)
const TEXT_PRIMARY: React.CSSProperties = {
  color: 'var(--tgo-text-primary)',
  fontWeight: 600,
}
const TEXT_SECONDARY: React.CSSProperties = {
  color: 'var(--tgo-text-secondary)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 500,
}
const TEXT_PICKUP: React.CSSProperties = {
  color: 'var(--tgo-state-success)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 600,
}
const TEXT_OPPORTUNITY: React.CSSProperties = {
  color: 'var(--tgo-state-discovery)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 600,
}
const TEXT_RATING: React.CSSProperties = {
  color: 'var(--tgo-state-discovery)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 700,
}
const TEXT_MUTED: React.CSSProperties = {
  color: 'var(--tgo-text-muted)',
  fontSize: 10,
}
const TEXT_PROMO: React.CSSProperties = {
  color: 'var(--tgo-state-discovery)',
  fontSize: 10,
  fontWeight: 600,
}
const DOT_SEPARATOR: React.CSSProperties = { color: 'var(--tgo-border)' }

// Bookmark button
const BOOKMARK_BTN: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--tgo-radius-pill)',
  backgroundColor: 'rgba(255,255,255,0.9)',
}

// Hover overlay (hero)
const HOVER_OVERLAY: React.CSSProperties = {
  backgroundColor: 'rgba(26,26,26,0.32)',
}
const HOVER_CTA_PILL: React.CSSProperties = {
  borderRadius: 'var(--tgo-radius-pill)',
  backgroundColor: 'var(--tgo-surface-0)',
  color: 'var(--tgo-text-primary)',
  fontSize: 'var(--tgo-type-body-sm)',
  fontWeight: 600,
}

// CTA button styles
const CTA_ACTIVE: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--tgo-radius-md)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 600,
  backgroundColor: 'var(--tgo-state-action)',
  color: 'var(--tgo-text-inverse)',
}
const CTA_CATALOG: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 'var(--tgo-radius-md)',
  fontSize: 'var(--tgo-type-caption)',
  fontWeight: 600,
  backgroundColor: 'transparent',
  color: '#854F0B',
  border: '1.5px solid var(--tgo-state-discovery)',
}
const TEXT_OPEN: React.CSSProperties = {
  color: 'var(--tgo-state-success)',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function walkingMinutes(distanceM: number | null): number | null {
  if (distanceM === null) return null
  return Math.max(1, Math.round(distanceM / 80))
}

// ── Props ───────────────────────────────────────────────────────────────────

interface RestaurantCardProps {
  restaurant: RestaurantCardData
  layout?: 'hero' | 'list' | 'compact' | 'mapPreview'
  onNavigate?: () => void
  index?: number
}

// ── Main Component (memoized) ───────────────────────────────────────────────

const RestaurantCard = memo(function RestaurantCard({
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
})

export default RestaurantCard

// ── Shared: Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ r }: { r: RestaurantCardData }) {
  if (r.isNew) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5" style={BADGE_NUEVO}>
        ✦ NUEVO
      </span>
    )
  }
  if (r.isOpenNow === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5" style={BADGE_ABIERTO}>
        ● ABIERTO
      </span>
    )
  }
  if (r.isOpenNow === false) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5" style={BADGE_CERRADO}>
        ● CERRADO
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
    <div className="flex items-center gap-2 px-3 py-2" style={SIGNAL_CONTAINER}>
      <Icon
        size={14}
        style={{
          color:
            signal.variant === 'active'
              ? 'var(--tgo-state-danger)'
              : signal.variant === 'calm'
                ? 'var(--tgo-state-trust)'
                : signal.variant === 'new'
                  ? 'var(--tgo-state-info)'
                  : signal.variant === 'benefit'
                    ? 'var(--tgo-state-discovery)'
                    : 'var(--tgo-state-success)',
        }}
      />
      <span style={SIGNAL_LABEL}>{signal.label}</span>
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
        backgroundColor: 'var(--tgo-card)',
        border: '1px solid var(--tgo-border)',
        borderLeft: `4px solid ${r.isOpenNow ? 'var(--tgo-state-activity)' : 'var(--tgo-state-inactive)'}`,
        boxShadow: 'var(--shadow-card)',
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
              background: PLACEHOLDER_COLORS[index % 5],
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
          style={{ ...BOOKMARK_BTN, transition: `opacity var(--tgo-duration-fast) var(--tgo-ease-standard)` }}
          onClick={(e) => { haptic.selection(); e.stopPropagation() }}
        >
          <Bookmark size={14} style={{ color: 'var(--tgo-text-primary)' }} />
        </button>
      </div>

      {/* Info — right side */}
      <div className="flex-1 flex flex-col justify-between p-4 min-w-0">
        {/* Top: name + cuisine */}
        <div>
          <h3 className="leading-tight mb-1" style={{ ...TEXT_PRIMARY, fontSize: 'var(--tgo-type-title)' }}>
            {r.name}
          </h3>
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
            <p className="truncate" style={TEXT_SECONDARY}>
              {r.cuisineTypes.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>

        {/* Middle: operational signal */}
        <OperationalSignalBox r={r} />

        {/* Bottom: proximity + opportunity */}
        <div className="flex items-center gap-2 flex-wrap">
          {proximity && (
            <span className="flex items-center gap-1" style={TEXT_SECONDARY}>
              <proximity.icon size={10} />
              {proximity.label}
            </span>
          )}
          {opportunity && (
            <span className="flex items-center gap-1" style={TEXT_OPPORTUNITY}>
              <opportunity.icon size={10} />
              {opportunity.label}
            </span>
          )}
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <span className="flex items-center gap-0.5" style={TEXT_RATING}>
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
          style={{ ...HOVER_OVERLAY, transition: `opacity var(--tgo-duration-fast) var(--tgo-ease-standard)` }}
        >
          <span className="px-5 py-2.5 flex items-center gap-1.5" style={HOVER_CTA_PILL}>
            Pedir
          </span>
        </div>
      )}
      {isNetwork && r.isOperational === false && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
          style={{ ...HOVER_OVERLAY, transition: `opacity var(--tgo-duration-fast) var(--tgo-ease-standard)` }}
        >
          <span className="px-5 py-2.5 flex items-center gap-1.5" style={HOVER_CTA_PILL}>
            <span style={{ fontSize: 14 }}>📋</span>
            Ver carta
          </span>
        </div>
      )}
    </motion.div>
  )
}

// ── LIST (accent bar + gradient bg + 60px logo + señal operativa) ─────────────

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

  // Accent bar + gradient by operational status
  const isOperational = r.isOperational !== false
  const accentColor = isOperational ? 'var(--tgo-state-activity)' : 'var(--tgo-state-discovery)'
  const cardBg = isOperational
    ? 'rgba(47,191,113,0.07)'
    : 'rgba(250,179,0,0.09)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      onClick={() => { haptic.impact('light'); onNavigate?.() }}
      className="relative flex items-center cursor-pointer group active:scale-[0.99]"
      style={{
        paddingLeft: 4,
        borderRadius: 'var(--tgo-radius-lg)',
        background: cardBg,
        border: '1px solid var(--tgo-border)',
        borderLeft: `4px solid ${accentColor}`,
        boxShadow: 'var(--shadow-card)',
        transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
        animationDelay: `${index * 80}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--tgo-border-active)'
        e.currentTarget.style.borderLeftColor = accentColor
        e.currentTarget.style.boxShadow = 'var(--tgo-elevation-floating)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--tgo-border)'
        e.currentTarget.style.borderLeftColor = accentColor
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Logo — 60px with gradient placeholder */}
      <div className="relative shrink-0 overflow-hidden flex items-center justify-center" style={IMAGE_60}>
        {isNetwork && r.logoUrl ? (
          <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : r.heroImage ? (
          <img src={r.heroImage} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: r.primaryColor
                ? `${r.primaryColor}22`
                : PLACEHOLDER_COLORS[index % 5],
            }}
          />
        )}
        {/* Badge overlay — bottom right */}
        <div className="absolute -bottom-0.5 -right-0.5">
          {r.isNew ? (
            <span className="flex items-center justify-center" style={BADGE_N}>N</span>
          ) : r.isOpenNow === true ? (
            <span className="flex items-center justify-center" style={DOT_OPEN} />
          ) : r.isOpenNow === false ? (
            <span className="flex items-center justify-center" style={DOT_CLOSED} />
          ) : null}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" style={{ padding: '12px 12px 12px 12px' }}>
        <div className="flex items-center gap-2">
          <h3 className="truncate leading-tight" style={{ ...TEXT_PRIMARY, fontSize: 'var(--tgo-type-body-sm)' }}>
            {r.name}
          </h3>
          <StatusBadge r={r} />
        </div>

        {/* Operational signal — inline */}
        {r.isOpenNow === true && isOperational && (
          <div className="mt-1">
            <OperationalSignalBox r={r} />
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {proximity && (
            <span className="flex items-center gap-1" style={TEXT_SECONDARY}>
              <proximity.icon size={10} />
              {proximity.label}
            </span>
          )}
          {r.estimatedPickupTime && isNetwork && isOperational && (
            <>
              <span style={DOT_SEPARATOR}>·</span>
              <span className="flex items-center gap-1" style={TEXT_PICKUP}>
                <Clock size={10} />
                {r.estimatedPickupTime} min
              </span>
            </>
          )}
          {opportunity && (
            <>
              <span style={DOT_SEPARATOR}>·</span>
              <span className="flex items-center gap-1" style={TEXT_OPPORTUNITY}>
                <opportunity.icon size={10} />
                {opportunity.label}
              </span>
            </>
          )}
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <>
              <span style={DOT_SEPARATOR}>·</span>
              <span className="flex items-center gap-0.5" style={TEXT_RATING}>
                <Star size={10} className="fill-current" />
                {r.averageRating.toFixed(1)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0" style={{ paddingRight: 12 }} onClick={(e) => e.stopPropagation()}>
        {isOperational ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center gap-1.5"
            style={{
              ...CTA_ACTIVE,
              transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
            }}
          >
            Pedir
          </Link>
        ) : (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center gap-1.5"
            style={{
              ...CTA_CATALOG,
              transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
            }}
          >
            <span style={{ fontSize: 12 }}>📋</span>
            Ver carta
          </Link>
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
        backgroundColor: 'var(--tgo-card)',
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
      <div className="relative shrink-0 overflow-hidden flex items-center justify-center" style={IMAGE_48}>
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
        <p className="truncate" style={{ ...TEXT_PRIMARY, fontSize: 'var(--tgo-type-body-sm)' }}>
          {r.name}
        </p>
        <div className="flex items-center gap-1.5">
          {r.isOpenNow === true && (
            <span style={TEXT_OPEN}>Abierto</span>
          )}
          {r.estimatedPickupTime && isNetwork && r.isOperational !== false && (
            <span className="flex items-center gap-0.5" style={TEXT_MUTED}>
              <Clock size={8} />
              {r.estimatedPickupTime} min
            </span>
          )}
          {proximity && (
            <span className="flex items-center gap-0.5" style={TEXT_MUTED}>
              <proximity.icon size={8} />
              {proximity.label}
            </span>
          )}
          {r.loyaltyInfo?.hasActivePromo && (
            <span className="flex items-center gap-0.5" style={TEXT_PROMO}>
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
        backgroundColor: 'var(--tgo-card)',
        boxShadow: 'var(--tgo-elevation-floating)',
        border: '1px solid var(--tgo-border)',
        maxWidth: 240,
      }}
    >
      {/* Image */}
      <div className="relative shrink-0 overflow-hidden flex items-center justify-center" style={IMAGE_40}>
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
          <p className="truncate" style={{ ...TEXT_PRIMARY, fontSize: 'var(--tgo-type-caption)', lineHeight: 1.2 }}>
            {r.name}
          </p>
          <StatusBadge r={r} />
        </div>
        {r.cuisineTypes && r.cuisineTypes.length > 0 && (
          <p className="truncate" style={{ color: 'var(--tgo-text-muted)', fontSize: 10 }}>
            {r.cuisineTypes.slice(0, 1).join('')}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {r.estimatedPickupTime && isNetwork && r.isOperational !== false && (
            <span className="flex items-center gap-0.5" style={TEXT_PICKUP}>
              <Clock size={8} />
              {r.estimatedPickupTime} min
            </span>
          )}
          {proximity && (
            <span className="flex items-center gap-0.5" style={TEXT_MUTED}>
              <proximity.icon size={8} />
              {proximity.label}
            </span>
          )}
          {opportunity && (
            <span className="flex items-center gap-0.5" style={TEXT_PROMO}>
              <opportunity.icon size={8} />
              {opportunity.label}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
