'use client'

import { Plus } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { cn, cloudinaryUrl } from '@/lib/utils'
import type { CategoryLayout } from '@/lib/menu-layout'
import { ItemImageFallback } from './ItemImageFallback'

interface Props {
  layout: CategoryLayout
  name: string
  description: string
  imageUrl?: string
  tags: string[]
  /** Precio (centavos) o variantes para mostrar «Desde $…». */
  price: number
  variantPrices: number[]
  /** 21/11/2026: descuento % de carta (precio de lista, con descuento y % mayor). */
  promoPrice?: { original: number; discounted: number; percent: number } | null
  /** El plato se puede personalizar: muestra el «+» sobre la foto. */
  customizable: boolean
  primary: string
  text: string
  mutedText: string
  cardBg: string
  cardBorder: string
  logoUrl?: string
  onOpen: () => void
}

function priceLabel(price: number, variantPrices: number[]): string {
  if (variantPrices.length > 0) {
    const minP = Math.min(...variantPrices)
    const maxP = Math.max(...variantPrices)
    return minP !== maxP
      ? `Desde $${toPesos(minP).toLocaleString('es-AR')}`
      : `$${toPesos(minP).toLocaleString('es-AR')}`
  }
  return `$${toPesos(price).toLocaleString('es-AR')}`
}

/** Tarjeta informativa del menú de salón (sin carrito), en lista, grilla o carrusel. */
export function DineInItemCard({
  layout, name, description, imageUrl, tags, price, variantPrices, promoPrice, customizable,
  primary, text, mutedText, cardBg, cardBorder, logoUrl, onOpen,
}: Props) {
  const stacked = layout !== 'list'
  const carousel = layout === 'carousel'

  const plusBadge = customizable && (
    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: primary }}>
      <Plus size={12} className="text-white" />
    </div>
  )

  let media
  if (imageUrl) {
    media = (
      <div className={cn('relative', stacked ? (carousel ? 'w-full h-32' : 'w-full h-28') : 'flex-shrink-0 w-[88px] h-[88px]')} style={{ cursor: 'pointer' }}>
        {/* 23/11/2026: con f_auto/q_auto (como el menú online). La URL original
            fallaba con fotos HEIC (iPhone): el navegador no las muestra. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- el salón no usa next/image */}
        <img src={cloudinaryUrl(imageUrl, { w: stacked ? 480 : 240 })} alt={name} loading="lazy" className="w-full h-full object-cover" />
        {plusBadge}
      </div>
    )
  } else if (stacked) {
    media = (
      <div className="relative">
        <ItemImageFallback name={name} logoUrl={logoUrl} primary={primary} className={carousel ? 'h-32' : 'h-28'} />
        {plusBadge}
      </div>
    )
  } else {
    media = <div className="flex-shrink-0 w-3 self-stretch" style={{ backgroundColor: primary + '18' }} />
  }

  return (
    <div
      className={cn('rounded-xl border transition-all overflow-hidden', stacked ? 'flex flex-col' : 'flex items-start gap-3', carousel && 'h-full')}
      style={{ backgroundColor: cardBg, borderColor: cardBorder }}
      onClick={onOpen}
    >
      {media}
      <div className={cn('min-w-0', stacked ? 'p-3' : 'flex-1 py-3 pr-3')}>
        <div className={cn('flex justify-between gap-2', carousel ? 'flex-col items-start gap-1' : 'items-start')}>
          <p className={cn('font-bold tracking-wide', carousel ? 'text-sm line-clamp-2' : 'text-base')} style={{ color: text }}>
            {name}
          </p>
          <p className={cn('font-bold flex-shrink-0', carousel ? 'text-sm' : 'text-base')} style={{ color: primary }}>
            {promoPrice && promoPrice.original > promoPrice.discounted && (
              <span className="mr-1 text-xs font-normal line-through opacity-50">${toPesos(promoPrice.original).toLocaleString('es-AR')}</span>
            )}
            {priceLabel(price, variantPrices)}
            {promoPrice && (
              <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 align-middle">-{promoPrice.percent}%</span>
            )}
          </p>
        </div>
        {description && (
          <p className={cn('leading-relaxed text-sm mt-1', stacked && 'line-clamp-2', carousel && 'text-xs')} style={{ color: mutedText }}>
            {description}
          </p>
        )}
        {tags.length > 0 && !carousel && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {tags.map(tag => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: primary + '50', color: primary }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
