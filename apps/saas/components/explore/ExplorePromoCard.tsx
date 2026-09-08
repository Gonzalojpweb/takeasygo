'use client'

// ── ExplorePromoCard ─────────────────────────────────────────────────────────
//
// Card horizontal compacta para "Hoy podés aprovechar".
// Mismo estilo que DiscoverCard pero más chica.
// Layout: logo izquierda + contenido derecha.

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
        width: 210,
        height: 100,
        padding: '12px 14px',
        borderRadius: 16,
        backgroundColor: 'var(--tgo-surface-1)',
        border: '1px solid var(--tgo-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Type badge — top right */}
      <span
        className="absolute top-2.5 right-3 px-2 py-0.5"
        style={{
          fontSize: 8,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          borderRadius: 4,
          backgroundColor: typeColor,
          color: '#FFFFFF',
        }}
      >
        {typeLabel}
      </span>

      {/* Logo / Image */}
      <div className="relative shrink-0">
        <div
          className="relative overflow-hidden"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: `${typeColor}15`,
            border: promo.tenantLogo ? '1px solid var(--tgo-border)' : 'none',
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
              <PuntoTGO expression="wink" size="xs" animate={false} />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Tenant name */}
        {promo.tenantName && (
          <p
            className="text-[11px] truncate"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            {promo.tenantName}
          </p>
        )}

        {/* Title */}
        <p
          className="text-[14px] font-bold leading-tight truncate"
          style={{ color: 'var(--tgo-text-primary)' }}
        >
          {promo.title}
        </p>

        {/* Price + discount */}
        {hasDiscount && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="text-[13px] font-bold"
              style={{ color: 'var(--tgo-state-reward)' }}
            >
              {formatPrice(promo.price, promo.currency)}
            </span>
            <span
              className="text-[10px] line-through"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              {formatPrice(promo.originalPrice, promo.currency)}
            </span>
            {discountPercent > 0 && (
              <span
                className="text-[10px] font-bold"
                style={{ color: 'var(--tgo-state-reward)' }}
              >
                -{discountPercent}%
              </span>
            )}
          </div>
        )}

        {/* Short description fallback */}
        {!hasDiscount && promo.shortDescription && (
          <p
            className="text-[11px] truncate mt-0.5"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            {promo.shortDescription}
          </p>
        )}
      </div>
    </button>
  )
}
