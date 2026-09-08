'use client'

// ── ExplorePromoCard ─────────────────────────────────────────────────────────
//
// Card horizontal para "Hoy podés aprovechar".
// Ancha (320px) para que el texto respire sin scroll interno.

import PuntoTGO from '@/components/tgo/PuntoTGO'
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
      {/* Type badge — top right */}
      <span
        className="absolute top-3 right-3 px-2 py-1"
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          borderRadius: 6,
          backgroundColor: typeColor,
          color: '#FFFFFF',
          zIndex: 2,
        }}
      >
        {typeLabel}
      </span>

      {/* Promo Image */}
      <div className="relative shrink-0">
        <div
          className="relative overflow-hidden"
          style={{
            width: 80,
            height: 80,
            borderRadius: 14,
            backgroundColor: `${typeColor}12`,
            border: '1px solid var(--tgo-border)',
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
          ) : promo.tenantLogo ? (
            <Image
              src={promo.tenantLogo}
              alt={promo.tenantName || ''}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <PuntoTGO expression="wink" size="sm" animate={false} />
            </div>
          )}
        </div>
      </div>

      {/* Content — wraps naturally, plenty of room */}
      <div className="flex-1 min-w-0 flex flex-col pr-6">
        {promo.tenantName && (
          <p className="text-xs mb-0.5" style={{ color: 'var(--tgo-text-muted)' }}>
            {promo.tenantName}
          </p>
        )}

        <p className="text-[15px] font-bold leading-snug" style={{ color: 'var(--tgo-text-primary)' }}>
          {promo.title}
        </p>

        {promo.shortDescription && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--tgo-text-muted)' }}>
            {promo.shortDescription}
          </p>
        )}

        {hasDiscount && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-sm font-bold" style={{ color: 'var(--tgo-state-reward)' }}>
              {formatPrice(promo.price, promo.currency)}
            </span>
            <span className="text-xs line-through" style={{ color: 'var(--tgo-text-muted)' }}>
              {formatPrice(promo.originalPrice, promo.currency)}
            </span>
            {discountPercent > 0 && (
              <span className="text-xs font-bold" style={{ color: 'var(--tgo-state-reward)' }}>
                -{discountPercent}%
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}
