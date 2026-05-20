'use client'

import { useState, useRef } from 'react'
import { Sparkles, Plus, Percent, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    title: string
    shortDescription?: string
    imageUrl?: string
    price: number
    originalPrice?: number
    conditions?: string
    isFeatured?: boolean
    customStyles?: {
      backgroundColor?: string
      textColor?: string
      accentColor?: string
      badgeColor?: string
      borderRadius?: string
      cardStyle?: 'modern' | 'classic' | 'minimal'
    }
  }
  onAdd?: (promotion: any) => void
  primary?: string
  bg?: string
  textColor?: string
  mode?: 'takeaway' | 'dine-in'
  variant?: 'featured' | 'standard'
}

export function PromotionCard({
  promotion,
  onAdd,
  primary,
  bg,
  textColor: pageTextColor,
  mode,
  variant,
}: PromotionCardProps) {
  const isFeatured = variant === 'featured' || (variant === undefined && promotion.isFeatured)
  
  const styles = promotion.customStyles || {}
  const accent = styles.accentColor || primary || '#f14722'
  
  const discount = promotion.originalPrice 
    ? Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100)
    : 0

  const buttonText = mode === 'dine-in' ? 'Ver' : 'Agregar'

  // Decide if page background is light/dark for standard card styling
  const isPageBgLight = isLightColor(bg)

  if (isFeatured) {
    const cardBgColor = styles.backgroundColor || primary || '#f14722'
    const isBgLight = isLightColor(cardBgColor)
    const cardTextColor = styles.textColor || (isBgLight ? '#1f2937' : '#ffffff')
    const buttonBg = isBgLight ? '#1f2937' : '#ffffff'
    const buttonTextColor = isBgLight ? '#ffffff' : cardBgColor

    return (
      <div
        onClick={() => onAdd?.(promotion)}
        className={cn(
          "relative flex items-center h-32 overflow-hidden select-none",
          "active:scale-[0.98] transition-all duration-200 cursor-pointer",
          "shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-black/5"
        )}
        style={{
          borderRadius: styles.borderRadius || '24px',
          backgroundColor: cardBgColor,
          color: cardTextColor,
        }}
      >
        {/* Left Side: Product Image or Icon */}
        {promotion.imageUrl ? (
          <div className="relative w-[40%] h-full flex-shrink-0 overflow-hidden bg-slate-100/10">
            <img
              src={promotion.imageUrl}
              alt={promotion.title}
              className="w-full h-full object-cover"
            />
            {/* Convex Overlap Curve */}
            <div 
              className="absolute -right-4 top-0 bottom-0 w-8 rounded-l-[100%] z-10" 
              style={{ backgroundColor: cardBgColor }}
            />
          </div>
        ) : (
          <div className="relative w-[30%] h-full flex-shrink-0 overflow-hidden flex items-center justify-center bg-white/10">
            <Sparkles className="w-8 h-8 opacity-80" style={{ color: cardTextColor }} />
            {/* Convex Overlap Curve */}
            <div 
              className="absolute -right-4 top-0 bottom-0 w-8 rounded-l-[100%] z-10" 
              style={{ backgroundColor: cardBgColor }}
            />
          </div>
        )}

        {/* Right Side: Text & Actions */}
        <div className="flex-1 h-full p-4 pl-3 flex flex-col justify-between z-20 min-w-0">
          <div className="min-w-0">
            {discount > 0 && (
              <span 
                className="inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 bg-white/20 text-white"
              >
                {discount}% OFF
              </span>
            )}
            <h3 className="font-extrabold text-sm sm:text-base leading-tight line-clamp-2">
              {promotion.title}
            </h3>
            {promotion.shortDescription && (
              <p className="text-[10px] opacity-80 mt-0.5 line-clamp-1 leading-normal font-medium">
                {promotion.shortDescription}
              </p>
            )}
          </div>
          
          <div className="flex items-center justify-between mt-1 gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-black tracking-tight">
                ${promotion.price.toLocaleString('es-AR')}
              </span>
              {promotion.originalPrice && (
                <span className="text-[10px] opacity-60 line-through font-medium">
                  ${promotion.originalPrice.toLocaleString('es-AR')}
                </span>
              )}
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAdd?.(promotion)
              }}
              className="px-4 py-1.5 rounded-full text-xs font-black shadow-md hover:shadow-lg transition-all transform active:scale-95 flex items-center gap-1"
              style={{
                backgroundColor: buttonBg,
                color: buttonTextColor,
              }}
            >
              <span>{buttonText}</span>
              <Plus size={12} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standard Card Style (Row layout)
  const cardBg = isPageBgLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.05)'
  const cardBorder = isPageBgLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)'
  const titleColor = isPageBgLight ? '#1f2937' : '#f9fafb'
  const subtitleColor = isPageBgLight ? '#4b5563' : '#d1d5db'
  const labelColor = isPageBgLight ? '#9ca3af' : '#9ca3af'
  const priceColor = isPageBgLight ? '#111827' : '#ffffff'

  // Dynamic button contrast calculation
  const isAccentLight = isLightColor(accent)
  const buttonIconColor = isAccentLight ? '#1f2937' : '#ffffff'
  const buttonBorder = isAccentLight ? '1px solid rgba(0, 0, 0, 0.12)' : 'none'

  return (
    <div
      onClick={() => onAdd?.(promotion)}
      className={cn(
        "flex items-stretch gap-3 p-3 rounded-2xl select-none backdrop-blur-sm",
        "active:scale-[0.98] transition-all duration-200 cursor-pointer w-full min-h-[100px] h-auto"
      )}
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: styles.borderRadius || '20px',
      }}
    >
      {/* Left Side: Square Rounded Image */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 bg-black/[0.02] dark:bg-white/[0.02] self-center">
        {promotion.imageUrl ? (
          <img
            src={promotion.imageUrl}
            alt={promotion.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Percent className="w-8 h-8 opacity-30" style={{ color: accent }} />
          </div>
        )}
        {discount > 0 && (
          <div className="absolute top-1 left-1 bg-red-500 text-white font-extrabold text-[8px] px-1.5 py-0.5 rounded-md shadow-sm">
            {discount}% OFF
          </div>
        )}
      </div>

      {/* Right Side: Info & Actions */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <span 
            className="text-[9px] uppercase font-black tracking-wider block mb-0.5 line-clamp-1 truncate"
            style={{ color: labelColor }}
          >
            {promotion.conditions?.split('·')[0] || 'Promoción'}
          </span>
          <h3 
            className="font-extrabold text-xs sm:text-sm line-clamp-1 leading-tight"
            style={{ color: titleColor }}
          >
            {promotion.title}
          </h3>
          {promotion.shortDescription && (
            <p 
              className="text-[10px] line-clamp-1 mt-0.5 leading-normal"
              style={{ color: subtitleColor }}
            >
              {promotion.shortDescription}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex items-baseline gap-1">
            <span 
              className="text-sm sm:text-base font-black tracking-tight"
              style={{ color: priceColor }}
            >
              ${promotion.price.toLocaleString('es-AR')}
            </span>
            {promotion.originalPrice && (
              <span className="text-[10px] text-slate-400 line-through">
                ${promotion.originalPrice.toLocaleString('es-AR')}
              </span>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onAdd?.(promotion)
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90 flex-shrink-0"
            style={{ 
              backgroundColor: accent,
              color: buttonIconColor,
              border: buttonBorder
            }}
          >
            <Plus size={16} strokeWidth={2.5} className="text-inherit" />
          </button>
        </div>
      </div>
    </div>
  )
}

interface PromotionCarouselProps { 
  promotions: any[] 
  onAdd?: (promotion: any) => void
  primary?: string
  bg?: string
  textColor?: string
  mode?: 'takeaway' | 'dine-in'
  variant?: 'featured' | 'standard'
}

export function PromotionCarousel({ 
  promotions, 
  onAdd, 
  primary, 
  bg,
  textColor,
  mode, 
  variant = 'featured'
}: PromotionCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (carouselRef.current) {
      const scrollLeft = carouselRef.current.scrollLeft
      const itemWidth = carouselRef.current.children[0]?.getBoundingClientRect().width || 0
      const index = Math.round(scrollLeft / (itemWidth + 12)) // Include gap
      setActiveIndex(index)
    }
  }

  const isFeatured = variant === 'featured'

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div
        ref={carouselRef}
        className="flex gap-3 overflow-x-auto scroll-smooth pb-3 scrollbar-none snap-x snap-mandatory"
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
              width: isFeatured ? '90%' : '82%',
              maxWidth: isFeatured ? '340px' : '290px',
            }}
          >
            <PromotionCard
              promotion={promo}
              onAdd={onAdd}
              primary={primary}
              bg={bg}
              textColor={textColor}
              mode={mode}
              variant={variant}
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
                width: activeIndex === index ? '16px' : '6px',
                backgroundColor: activeIndex === index ? primary : primary + '30',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}