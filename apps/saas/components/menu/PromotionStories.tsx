'use client'

import { X, ShoppingCart, Gift } from 'lucide-react'
import Link from 'next/link'
import { safeCtaHref } from '@/lib/cta-link'
import { trackPlacement, trackPlacementOnce } from '@/lib/placement-track'
import { useStoryPlayer } from './useStoryPlayer'
import { toPesos } from '@takeasygo/business/browser'

interface StoryPromotion {
  _id: string
  title: string
  description?: string
  shortDescription?: string
  imageUrl?: string
  price?: number
  originalPrice?: number
  conditions?: string
  ctaText?: string
  ctaLink?: string
  type?: string
}

interface Props {
  promotions: StoryPromotion[]
  onClose: () => void
  primaryColor?: string
  onAddToCart?: (promotion: any) => void
  tenantSlug?: string
  /** Métricas (20/11/2026): sede del menú donde se abre. */
  locationId?: string
}

function formatPrice(n: number): string {
  return '$' + toPesos(n).toLocaleString('es-AR')
}

export default function PromotionStories({ promotions, onClose, primaryColor = '#000', onAddToCart, tenantSlug, locationId }: Props) {
  const DURATION = 5000
  const ctx = { placement: 'menu_promo_story' as const, kind: 'promotion' as const, tenantSlug, locationId }

  const { index: currentIndex, progress, goTo, close, handlers } = useStoryPlayer({
    count: promotions.length,
    durationMs: DURATION,
    onClose,
    onView: (i) => { if (promotions[i]) trackPlacementOnce({ ...ctx, type: 'story_view', pieceId: promotions[i]._id }) },
    onComplete: (i) => { if (promotions[i]) trackPlacementOnce({ ...ctx, type: 'story_complete', pieceId: promotions[i]._id }) },
    onExit: (reason, i) => { if (promotions[i]) trackPlacement({ ...ctx, type: 'exit', pieceId: promotions[i]._id, reason, index: i }) },
  })

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation()
    const promo = promotions[currentIndex]
    if (promo) trackPlacement({ ...ctx, type: 'cta_tap', pieceId: promo._id, action: 'add' })
    if (onAddToCart && promo) {
      onAddToCart(promo)
      onClose()
    }
  }

  if (promotions.length === 0) return null

  const promo = promotions[currentIndex]
  const hasSale = promo.type === 'sale' && (promo.price ?? 0) > 0
  const hasLoyalty = promo.type === 'loyalty'
  const hasAction = hasSale || hasLoyalty || promo.ctaText

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="flex gap-1 px-2 pt-3 pb-2 z-10">
        {promotions.map((p, i) => (
          <div key={p._id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                backgroundColor: 'white',
                width: i < currentIndex ? '100%' : i === currentIndex ? `${progress * 100}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => close('close')}
        aria-label="Cerrar"
        className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"
      >
        <X size={18} className="text-white" />
      </button>

      <div
        className="flex-1 flex items-center justify-center relative select-none overflow-hidden"
        {...handlers}
      >
        {promo.imageUrl ? (
          <img src={promo.imageUrl} alt={promo.title} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: primaryColor }}>
            <div className="text-center max-w-md">
              <p className="text-white text-2xl font-black mb-3">{promo.title}</p>
              {promo.shortDescription && <p className="text-white/80 text-sm">{promo.shortDescription}</p>}
              {promo.description && <p className="text-white/60 text-xs mt-2">{promo.description}</p>}
            </div>
          </div>
        )}

        {/* Overlay gradient + content */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 pt-16">
          {hasSale && promo.originalPrice && promo.originalPrice > promo.price! && (
            <p className="text-white/50 text-xs line-through mb-1">{formatPrice(promo.originalPrice)}</p>
          )}
          <p className="text-white font-bold text-lg leading-tight">{promo.title}</p>
          {promo.shortDescription && <p className="text-white/70 text-sm mt-1 leading-tight">{promo.shortDescription}</p>}
          {promo.description && <p className="text-white/50 text-xs mt-1.5">{promo.description}</p>}
          {promo.conditions && <p className="text-white/35 text-[10px] mt-2">{promo.conditions}</p>}

          {/* Contextual action button */}
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            {hasSale ? (
              <button
                onClick={handleAddToCart}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm shadow-lg active:scale-[0.97] transition-transform"
                style={{ backgroundColor: primaryColor, color: 'white' }}
              >
                <ShoppingCart size={16} />
                Agregar al carrito &middot; {formatPrice(promo.price!)}
              </button>
            ) : hasLoyalty ? (
              <Link
                href={`/${tenantSlug}/club/lookup`}
                onClick={() => trackPlacement({ ...ctx, type: 'cta_tap', pieceId: promo._id, action: 'loyalty' })}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border-2 border-white/50 text-white active:scale-[0.97] transition-transform"
              >
                <Gift size={16} />
                Unite al Club
              </Link>
            ) : promo.ctaText && safeCtaHref(promo.ctaLink) ? (
              // Link inválido (incluidos los viejos) → sin botón.
              <a
                href={safeCtaHref(promo.ctaLink)!.href}
                {...(safeCtaHref(promo.ctaLink)!.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => trackPlacement({ ...ctx, type: 'cta_tap', pieceId: promo._id, action: 'link' })}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm shadow-lg active:scale-[0.97] transition-transform"
                style={{ backgroundColor: primaryColor, color: 'white' }}
              >
                {promo.ctaText}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-1.5 py-3">
        {promotions.slice(0, Math.min(promotions.length, 7)).map((p, i) => (
          <button
            key={p._id}
            onClick={() => goTo(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === currentIndex ? 'bg-white scale-125' : 'bg-white/40'
            }`}
          />
        ))}
        {promotions.length > 7 && (
          <span className="text-white/40 text-xs ml-1">+{promotions.length - 7}</span>
        )}
      </div>
    </div>
  )
}
