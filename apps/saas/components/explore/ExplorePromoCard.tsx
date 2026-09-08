'use client'

// ── ExplorePromoCard ─────────────────────────────────────────────────────────
//
// Card full-width para "Hoy podés aprovechar".
// Tamaño fijo consistente — todas las cards miden igual.

import { useHaptic } from '@/components/tgo/useHaptic'
import Image from 'next/image'

export interface ExplorePromo {
  id: string
  title: string
  description?: string
  shortDescription?: string
  imageUrl?: string
  price?: number
  originalPrice?: number
  currency?: string
  type?: string
  conditions?: string
  tenantName?: string
  tenantSlug?: string
  tenantLogo?: string
}

interface Props {
  promo: ExplorePromo
  onClick?: () => void
}

function formatPrice(cents: number | undefined, currency: string = 'ARS'): string {
  if (cents == null) return ''
  const amount = cents / 100
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getDiscountPercent(original: number, current: number): number {
  if (original <= 0) return 0
  return Math.round(((original - current) / original) * 100)
}

function getTypeLabel(type?: string): string {
  switch (type) {
    case 'sale': return 'Oferta'
    case 'loyalty': return 'Club'
    case 'info': return 'Info'
    case 'announcement': return 'Nuevo'
    default: return 'Promo'
  }
}

function getTypeColor(type?: string): string {
  switch (type) {
    case 'sale': return 'var(--tgo-state-reward)'
    case 'loyalty': return 'var(--tgo-state-discovery)'
    case 'info': return 'var(--tgo-state-proximity)'
    case 'announcement': return 'var(--tgo-state-activity)'
    default: return 'var(--tgo-state-reward)'
  }
}

export default function ExplorePromoCard({ promo, onClick }: Props) {
  const haptic = useHaptic()

  const hasDiscount = promo.originalPrice != null && promo.price != null && promo.originalPrice > promo.price
  const discountPercent = hasDiscount ? getDiscountPercent(promo.originalPrice!, promo.price!) : 0
  const typeLabel = getTypeLabel(promo.type)
  const typeColor = getTypeColor(promo.type)

  return (
    <button
      onClick={() => { haptic.impact('light'); onClick?.() }}
      className="text-left active:scale-[0.98] transition-transform relative w-full overflow-hidden"
      style={{
        height: 140,
        borderRadius: 20,
        backgroundColor: 'var(--tgo-ink)',
        position: 'relative',
      }}
    >
      {/* Promo image — overlapping from top */}
      <div
        className="absolute"
        style={{
          top: -12,
          left: 16,
          width: 64,
          height: 64,
          borderRadius: 14,
          overflow: 'hidden',
          border: '3px solid var(--tgo-ink)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 2,
        }}
      >
        {promo.imageUrl ? (
          <Image
            src={promo.imageUrl}
            alt={promo.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: 'var(--tgo-surface-2)' }} />
        )}
      </div>

      {/* Badge — top right */}
      <span
        className="absolute"
        style={{
          top: 10,
          right: 16,
          padding: '3px 8px',
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          borderRadius: 5,
          backgroundColor: '#FFFFFF',
          color: 'var(--tgo-ink)',
          zIndex: 2,
        }}
      >
        {typeLabel}
      </span>

      {/* Content */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 96,
          right: 16,
          bottom: 12,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {/* Tenant */}
        {promo.tenantName && (
          <p
            className="text-xs truncate"
            style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}
          >
            {promo.tenantName}
          </p>
        )}

        {/* Title — max 2 lines */}
        <p
          className="font-bold text-[15px] leading-snug"
          style={{
            color: '#FFFFFF',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {promo.title}
        </p>

        {/* Price row */}
        {hasDiscount && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm font-bold" style={{ color: typeColor }}>
              {formatPrice(promo.price, promo.currency)}
            </span>
            <span className="text-xs line-through" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {formatPrice(promo.originalPrice, promo.currency)}
            </span>
            {discountPercent > 0 && (
              <span className="text-xs font-bold" style={{ color: typeColor }}>
                -{discountPercent}%
              </span>
            )}
          </div>
        )}

        {/* Conditions */}
        {promo.conditions && !hasDiscount && (
          <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {promo.conditions}
          </p>
        )}
      </div>
    </button>
  )
}
