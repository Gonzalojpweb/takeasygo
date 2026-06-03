'use client'

import { useState, useRef } from 'react'
import { Sparkles, Plus, Percent, Info, Megaphone, Heart, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import PromotionLoyaltyModal from './PromotionLoyaltyModal'

// Helper function to check if a hex color is light
function isLightColor(color?: string) {
  if (!color) return true
  const hex = color.replace('#', '')
  let r = 255, g = 255, b = 255
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16)
    g = parseInt(hex[1] + hex[1], 16)
    b = parseInt(hex[2] + hex[2], 16)
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16)
    g = parseInt(hex.substring(2, 4), 16)
    b = parseInt(hex.substring(4, 6), 16)
  }
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 180
}

interface PromotionCardProps {
  promotion: {
    _id: string
    type?: 'sale' | 'info' | 'announcement' | 'loyalty'
    title: string
    shortDescription?: string
    imageUrl?: string
    price: number
    originalPrice?: number
    conditions?: string
    isFeatured?: boolean
    ctaText?: string
    ctaLink?: string
    customStyles?: {
      backgroundColor?: string
      textColor?: string
      accentColor?: string
      badgeColor?: string
      borderRadius?: string
    }
  }
  tenantSlug?: string
  onAdd?: (promotion: any) => void
  primary?: string
  bg?: string
  textColor?: string
  mode?: 'takeaway' | 'dine-in'
  variant?: 'featured' | 'standard'
  typeLabels?: {
    sale: string
    info: string
    announcement: string
    loyalty: string
  }
  loyaltyMessaging?: {
    modalSubtitle?: string
    successTitle?: string
    successMessage?: string
    welcomePointsMsg?: string
  }
}

export function PromotionCard({
  promotion,
  tenantSlug,
  onAdd,
  primary,
  bg,
  textColor: pageTextColor,
  mode,
  variant,
  typeLabels,
  loyaltyMessaging,
}: PromotionCardProps) {
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false)
  const isFeatured = variant === 'featured' || (variant === undefined && promotion.isFeatured)
  
  const styles = promotion.customStyles || {}
  const accent = styles.accentColor || primary || '#f14722'
  
  const discount = promotion.originalPrice 
    ? Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100)
    : 0

  const promoType = promotion.type || 'sale'
  const buttonText = mode === 'dine-in' ? 'Ver' : 'Agregar'

  const isPageBgLight = isLightColor(bg)
  const canAddToCart = promoType === 'sale'

  // ==================== FEATURED CARD (VERSIÓN PREMIUM) ====================
  if (isFeatured) {
    const cardBgColor = styles.backgroundColor || primary || '#f14722'
    const isBgLight = isLightColor(cardBgColor)
    const cardTextColor = styles.textColor || (isBgLight ? '#1f2937' : '#ffffff')
    const buttonBg = isBgLight ? '#1f2937' : '#ffffff'
    const buttonTextColor = isBgLight ? '#ffffff' : cardBgColor

    return (
      <>
        <div
          onClick={() => { if (canAddToCart) onAdd?.(promotion) }}
          className={cn(
            "relative h-[178px] sm:h-[170px] overflow-hidden select-none rounded-3xl shadow-xl",
            "transition-all duration-200 active:scale-[0.985] border border-black/5",
            canAddToCart ? "cursor-pointer" : "cursor-default"
          )}
          style={{
            borderRadius: styles.borderRadius || '24px',
            backgroundColor: cardBgColor,
            color: cardTextColor,
          }}
        >
          {/* Background Image + Gradient Overlay */}
          <div className="absolute inset-0">
            {promotion.imageUrl ? (
              <img
                src={promotion.imageUrl}
                alt={promotion.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />
          </div>

          {/* Content */}
          <div className="relative h-full p-5 flex flex-col justify-between z-10">
            {/* Top Badges */}
            <div className="flex justify-between items-start">
              <div className="w-9 h-9 rounded-2xl bg-white/95 backdrop-blur-md flex items-center justify-center shadow-md">
                {promoType === 'sale' && <Percent size={18} className="text-orange-600" />}
                {promoType === 'info' && <Info size={18} className="text-blue-600" />}
                {promoType === 'announcement' && <Megaphone size={18} className="text-amber-600" />}
                {promoType === 'loyalty' && <Heart size={18} className="text-pink-600" />}
              </div>

              {discount > 0 && (
                <div className="bg-emerald-500 text-white text-xs font-black px-3 py-1 rounded-2xl shadow-md">
                  {discount}% OFF
                </div>
              )}
            </div>

            {/* Main Content */}
            <div>
              <h3 className="text-white font-bold text-xl leading-tight tracking-tight line-clamp-2 mb-1.5">
                {promotion.title}
              </h3>
              
              {promotion.shortDescription && (
                <p className="text-white/90 text-sm line-clamp-2 leading-snug">
                  {promotion.shortDescription}
                </p>
              )}
            </div>

            {/* Price + Action Button */}
            <div className="flex items-center justify-between">
              {promoType === 'sale' ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-white tracking-tighter">
                    ${promotion.price.toLocaleString('es-AR')}
                  </span>
                  {promotion.originalPrice && (
                    <span className="text-white/60 line-through text-base">
                      ${promotion.originalPrice.toLocaleString('es-AR')}
                    </span>
                  )}
                </div>
              ) : (
                <div />
              )}

              {promoType === 'sale' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onAdd?.(promotion) }}
                  className="px-6 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all"
                  style={{ backgroundColor: buttonBg, color: buttonTextColor }}
                >
                  {buttonText} <Plus size={16} strokeWidth={3} />
                </button>
              ) : promoType === 'loyalty' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowLoyaltyModal(true) }}
                  className="px-6 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all"
                  style={{ backgroundColor: buttonBg, color: buttonTextColor }}
                >
                  Unirme <Heart size={16} strokeWidth={3} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {tenantSlug && (
          <PromotionLoyaltyModal
            tenantSlug={tenantSlug}
            promotionId={promotion._id}
            title={promotion.title}
            ctaText={promotion.ctaText}
            accentColor={accent}
            isOpen={showLoyaltyModal}
            onClose={() => setShowLoyaltyModal(false)}
            modalSubtitle={loyaltyMessaging?.modalSubtitle}
            successTitle={loyaltyMessaging?.successTitle}
            successMessage={loyaltyMessaging?.successMessage}
            welcomePointsMsg={loyaltyMessaging?.welcomePointsMsg}
          />
        )}
      </>
    )
  }

  // ==================== STANDARD CARD ====================
  const isBgLight = isLightColor(styles.backgroundColor || bg)
  const cardBg = styles.backgroundColor || (isPageBgLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.08)')
  const cardBorder = styles.accentColor || (isPageBgLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)')
  
  const titleColor = styles.textColor || (isBgLight ? '#1f2937' : '#ffffff')
  const subtitleColor = styles.textColor || (isBgLight ? '#4b5563' : '#d1d5db')
  const labelColor = styles.textColor || (isBgLight ? '#6b7280' : '#9ca3af')

  return (
    <>
      <div
        onClick={() => { if (canAddToCart) onAdd?.(promotion) }}
        className={cn(
          "flex gap-3 p-3 rounded-2xl backdrop-blur-md transition-all active:scale-[0.985] w-full min-h-[108px]",
          canAddToCart ? "cursor-pointer" : "cursor-default"
        )}
        style={{
          backgroundColor: cardBg,
          border: styles.accentColor ? `1.5px solid ${styles.accentColor}` : `1px solid ${cardBorder}`,
          borderRadius: styles.borderRadius || '20px',
        }}
      >
        {/* Image */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 self-center bg-black/5">
          {promotion.imageUrl ? (
            <img
              src={promotion.imageUrl}
              alt={promotion.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/10">
              {promoType === 'sale' && <Percent className="w-8 h-8" style={{ color: accent }} />}
              {promoType === 'info' && <Info className="w-8 h-8" style={{ color: accent }} />}
              {promoType === 'announcement' && <Megaphone className="w-8 h-8" style={{ color: accent }} />}
              {promoType === 'loyalty' && <Heart className="w-8 h-8" style={{ color: accent }} />}
            </div>
          )}

          {promoType === 'sale' && discount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow">
              {discount}%
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div className="space-y-1">
            <span 
              className="text-[9px] uppercase font-black tracking-widest block"
              style={{ color: labelColor }}
            >
              {promoType === 'sale' ? (promotion.conditions?.split('·')[0] || typeLabels?.sale || 'PROMO') : 
               promoType === 'info' ? (typeLabels?.info || 'INFO') : 
               promoType === 'announcement' ? (typeLabels?.announcement || 'AVISO') : 
               (typeLabels?.loyalty || 'CLUB')}
            </span>

            <h3 
              className="font-extrabold text-[13.5px] sm:text-sm leading-tight line-clamp-2 pr-2"
              style={{ color: titleColor }}
            >
              {promotion.title}
            </h3>

            {promotion.shortDescription && (
              <p 
                className="text-xs leading-snug line-clamp-2 pr-4"
                style={{ color: subtitleColor }}
              >
                {promotion.shortDescription}
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            {promoType === 'sale' ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-base sm:text-lg font-black tracking-tight" style={{ color: accent }}>
                    ${promotion.price.toLocaleString('es-AR')}
                  </span>
                  {promotion.originalPrice && (
                    <span className="text-xs line-through opacity-60">
                      ${promotion.originalPrice.toLocaleString('es-AR')}
                    </span>
                  )}
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); onAdd?.(promotion) }}
                  className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-all"
                  style={{ backgroundColor: accent, color: isLightColor(accent) ? '#111' : '#fff' }}
                >
                  <Plus size={18} strokeWidth={3} />
                </button>
              </>
            ) : (
              <button
                onClick={(e) => { 
                  e.stopPropagation()
                  if (promoType === 'loyalty') setShowLoyaltyModal(true)
                }}
                className="w-full py-2.5 rounded-full text-xs font-bold shadow-sm active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: accent, color: isLightColor(accent) ? '#111' : '#fff' }}
              >
                {promoType === 'loyalty' && <Heart size={16} />}
                {promoType === 'announcement' && <ExternalLink size={16} />}
                <span>{promotion.ctaText || (promoType === 'loyalty' ? 'Unirme' : 'Ver más')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {tenantSlug && (
        <PromotionLoyaltyModal
          tenantSlug={tenantSlug}
          promotionId={promotion._id}
          title={promotion.title}
          ctaText={promotion.ctaText}
          accentColor={accent}
          isOpen={showLoyaltyModal}
          onClose={() => setShowLoyaltyModal(false)}
          modalSubtitle={loyaltyMessaging?.modalSubtitle}
          successTitle={loyaltyMessaging?.successTitle}
          successMessage={loyaltyMessaging?.successMessage}
          welcomePointsMsg={loyaltyMessaging?.welcomePointsMsg}
        />
      )}
    </>
  )
}

interface PromotionCarouselProps { 
  promotions: any[] 
  tenantSlug?: string
  onAdd?: (promotion: any) => void
  primary?: string
  bg?: string
  textColor?: string
  mode?: 'takeaway' | 'dine-in'
  variant?: 'featured' | 'standard'
  typeLabels?: {
    sale: string
    info: string
    announcement: string
    loyalty: string
  }
  loyaltyMessaging?: {
    modalSubtitle?: string
    successTitle?: string
    successMessage?: string
    welcomePointsMsg?: string
  }
}

export function PromotionCarousel({ 
  promotions, 
  tenantSlug,
  onAdd, 
  primary, 
  bg,
  textColor,
  mode, 
  variant = 'featured',
  typeLabels,
  loyaltyMessaging,
}: PromotionCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (carouselRef.current) {
      const scrollLeft = carouselRef.current.scrollLeft
      const itemWidth = carouselRef.current.children[0]?.getBoundingClientRect().width || 0
      const index = Math.round(scrollLeft / (itemWidth + 12))
      setActiveIndex(index)
    }
  }

  const isFeatured = variant === 'featured'

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div
        ref={carouselRef}
        className="flex gap-3 overflow-x-auto scroll-smooth pb-4 scrollbar-none snap-x snap-mandatory"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        onScroll={handleScroll}
      >
        {promotions.map((promo) => (
          <div
            key={promo._id}
            className="flex-shrink-0 snap-start"
            style={{
              width: isFeatured ? '90%' : '84%',
              maxWidth: isFeatured ? '340px' : '290px',
            }}
          >
            <PromotionCard
              promotion={promo}
              tenantSlug={tenantSlug}
              onAdd={onAdd}
              primary={primary}
              bg={bg}
              textColor={textColor}
              mode={mode}
              variant={variant}
              typeLabels={typeLabels}
              loyaltyMessaging={loyaltyMessaging}
            />
          </div>
        ))}
      </div>

      {/* Pagination Dots */}
      {promotions.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {promotions.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (carouselRef.current) {
                  const itemWidth = carouselRef.current.children[0]?.getBoundingClientRect().width || 0
                  carouselRef.current.scrollTo({
                    left: index * (itemWidth + 12),
                    behavior: 'smooth',
                  })
                }
              }}
              className="transition-all duration-300 h-1.5 rounded-full"
              style={{
                width: activeIndex === index ? '18px' : '6px',
                backgroundColor: activeIndex === index ? primary : primary + '40',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}