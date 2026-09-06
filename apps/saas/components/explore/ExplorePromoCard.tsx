'use client'

// ── ExplorePromoCard ─────────────────────────────────────────────────────────
//
// Card horizontal para mostrar una promoción real en "Hoy podés aprovechar".
// Muestra: imagen de la promo, título, descripción, precio con descuento, restaurante.

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
      className="shrink-0 text-left active:scale-[0.97] transition-transform flex flex-col items-center"
      style={{
        width: 132,
        height: 164,
        padding: '14px 12px',
        borderRadius: 18,
        backgroundColor: 'var(--tgo-surface-2)',
        border: '1px solid var(--tgo-border)',
        justifyContent: 'space-between',
      }}
    >
      {/* Image / Avatar */}
      <div className="relative mb-2">
        <div
          className="relative overflow-hidden"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: `${typeColor}15`,
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
            <div className="flex items-center justify-center w-full h-full">
              <PuntoTGO expression="wink" size="sm" />
            </div>
          )}
        </div>

        {/* Type badge */}
        <div
          className="absolute -bottom-1 -right-1 px-1 py-0"
          style={{
            borderRadius: 'var(--tgo-radius-pill)',
            backgroundColor: typeColor,
            color: '#FFFFFF',
            fontSize: 7,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            lineHeight: '14px',
          }}
        >
          {typeLabel}
        </div>
      </div>

      {/* Content — centered like DiscoverCard */}
      <div className="flex flex-col items-center text-center w-full">
        {/* Tenant name */}
        <div className="flex items-center gap-1 mb-0.5">
          {promo.tenantLogo && (
            <div
              className="relative shrink-0"
              style={{ width: 10, height: 10, borderRadius: '50%', overflow: 'hidden' }}
            >
              <Image
                src={promo.tenantLogo}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}
          <span
            className="text-[8px] font-semibold truncate max-w-[90px]"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            {promo.tenantName}
          </span>
        </div>

        {/* Title */}
        <p
          className="text-[11px] font-bold truncate max-w-[110px]"
          style={{ color: 'var(--tgo-text-primary)' }}
        >
          {promo.title}
        </p>

        {/* Short description */}
        {promo.shortDescription && (
          <p
            className="text-[9px] truncate max-w-[110px] mt-0.5"
            style={{ color: 'var(--tgo-text-muted)' }}
          >
            {promo.shortDescription}
          </p>
        )}

        {/* Price */}
        {hasDiscount && (
          <div className="flex items-center gap-1 mt-1">
            <span
              className="text-[11px] font-bold"
              style={{ color: 'var(--tgo-state-reward)' }}
            >
              {formatPrice(promo.price, promo.currency)}
            </span>
            <span
              className="text-[8px] line-through"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              {formatPrice(promo.originalPrice, promo.currency)}
            </span>
          </div>
        )}

        {/* Discount badge */}
        {discountPercent > 0 && (
          <span
            className="text-[8px] font-bold mt-0.5"
            style={{ color: 'var(--tgo-state-reward)' }}
          >
            -{discountPercent}%
          </span>
        )}
      </div>
    </button>
  )
}
