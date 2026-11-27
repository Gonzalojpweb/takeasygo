'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import { Leaf, Package, Sparkles, UtensilsCrossed } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { cn, cloudinaryUrl, cloudinaryBlurUrl } from '@/lib/utils'
import type { CategoryLayout } from '@/lib/menu-layout'
import LikeBadge from '@/components/menu/LikeBadge'
import { ItemImageFallback } from './ItemImageFallback'

interface Props {
  layout: CategoryLayout
  name: string
  description: string
  imageUrl?: string
  isVeg: boolean
  tags: string[]
  likesCount: number
  /** Precio de lista (centavos). */
  price: number
  /** Precio con descuento del club, si aplica (centavos). */
  clubPrice: { original: number; discounted: number } | null
  /** 21/11/2026: descuento % de carta (precio de lista, con descuento y % mayor). */
  promoPrice?: { original: number; discounted: number; percent: number; stackable?: boolean } | null
  primary: string
  borderStyle: string
  logoUrl?: string
  onOpen: () => void
  /** Control de la derecha: carrito, like o «Catálogo» (ya armado para el layout). */
  action: ReactNode
  /** Multi-rubro (etapa 2): marca arriba del nombre (tiendas). */
  brand?: string
  /** Multi-rubro: el precio es el menor de varias variantes → «Desde $». */
  fromPrice?: boolean
  /** Multi-rubro: ícono sin foto. Ausente = plato (lo de siempre). */
  fallbackIcon?: 'dish' | 'product' | 'service'
}

const ars = (cents: number) => `$${toPesos(cents).toLocaleString('es-AR')}`

/** Tarjeta de producto del menú takeaway / delivery / business, en lista, grilla o carrusel. */
export function TakeawayItemCard({
  layout, name, description, imageUrl, isVeg, tags, likesCount, price, clubPrice, promoPrice,
  primary, borderStyle, logoUrl, onOpen, action, brand, fromPrice = false, fallbackIcon = 'dish',
}: Props) {
  const KindIcon = fallbackIcon === 'product' ? Package : fallbackIcon === 'service' ? Sparkles : UtensilsCrossed
  const fromLabel = fromPrice ? <span className="text-[11px] opacity-60">Desde</span> : null
  const brandLine = brand ? <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 leading-none mb-1">{brand}</p> : null
  // El descuento de carta ya viene en `price`; el del Club se calcula sobre él.
  const percentTag = promoPrice ? (
    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">-{promoPrice.percent}%</span>
  ) : null
  const priceBlock = clubPrice ? (
    <>
      <span className="text-xs line-through opacity-50 text-zinc-400">{ars(promoPrice && promoPrice.original > clubPrice.original ? promoPrice.original : clubPrice.original)}</span>
      <span className="font-bold text-sm text-green-600">{ars(clubPrice.discounted)}</span>
      {percentTag}
    </>
  ) : promoPrice ? (
    <>
      {promoPrice.original > promoPrice.discounted && (
        <span className="text-xs line-through opacity-50 text-zinc-400">{ars(promoPrice.original)}</span>
      )}
      <span className="font-bold text-sm text-green-600">{ars(price)}</span>
      {percentTag}
    </>
  ) : (
    <>
      {fromLabel}
      <span className="font-bold text-sm" style={{ color: primary }}>{ars(price)}</span>
    </>
  )

  if (layout === 'list') {
    return (
      <div
        className="flex items-center gap-3 py-3 border-b cursor-pointer active:scale-[0.99] transition-transform"
        style={{ borderColor: primary + '12' }}
        onClick={onOpen}
      >
        {imageUrl ? (
          <Image src={cloudinaryUrl(imageUrl, { w: 200 })} alt={name} width={64} height={64} className="w-16 h-16 object-cover rounded-xl flex-shrink-0 food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(imageUrl)} />
        ) : (
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: primary + '10' }}>
            {isVeg ? <Leaf size={14} style={{ color: '#22c55e' }} /> : <KindIcon size={13} style={{ color: primary + '60' }} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {brandLine}
          <p className="font-semibold text-base">{name}</p>
          {description && <p className="text-sm opacity-70 line-clamp-2 mt-0.5">{description}</p>}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {priceBlock}
            {tags.map(tag => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                {tag}
              </span>
            ))}
            <LikeBadge count={likesCount} variant="inline" />
            {likesCount >= 5 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Popular</span>
            )}
          </div>
        </div>
        {action}
      </div>
    )
  }

  const carousel = layout === 'carousel'
  const imgHeight = carousel ? 'h-32' : 'h-36'

  return (
    <div
      className={cn('relative border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform', carousel && 'flex h-full flex-col')}
      style={{ borderColor: primary + '20', borderRadius: borderStyle }}
      onClick={onOpen}
    >
      {imageUrl ? (
        <Image src={cloudinaryUrl(imageUrl, { w: 500 })} alt={name} width={500} height={200} className={cn('w-full object-cover food-photo', imgHeight)} placeholder="blur" blurDataURL={cloudinaryBlurUrl(imageUrl)} />
      ) : (
        <ItemImageFallback name={name} logoUrl={logoUrl} primary={primary} className={imgHeight} />
      )}
      <LikeBadge count={likesCount} variant="overlay" />
      <div className={cn('p-3', carousel && 'flex flex-1 flex-col')}>
        {brandLine}
        <div className="flex items-center gap-1.5 mb-1">
          {isVeg
            ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
            : <KindIcon size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
          <p className={cn('font-semibold leading-tight', carousel ? 'text-sm line-clamp-2' : 'text-base')}>{name}</p>
        </div>
        {description && (
          <p className={cn('opacity-70 line-clamp-2 mb-1.5', carousel ? 'text-xs' : 'text-sm')}>{description}</p>
        )}
        <div className={cn('flex items-center justify-between gap-1', carousel && 'mt-auto')}>
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">{priceBlock}</div>
          {action}
        </div>
      </div>
    </div>
  )
}
