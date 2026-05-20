'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface PromotionCardProps {
  promotion: {
    _id: string
    title: string
    shortDescription?: string
    imageUrl?: string
    price: number
    originalPrice?: number
    conditions?: string
    customStyles?: {
      backgroundColor?: string
      textColor?: string
      accentColor?: string
      badgeColor?: string
      borderRadius?: string
    }
  }
  onAdd?: (promotion: any) => void
  primary?: string
  mode?: 'takeaway' | 'dine-in'
}

export function PromotionCard({ promotion, onAdd, primary, mode }: PromotionCardProps) {
  const styles = promotion.customStyles || {}
  const accent = styles.accentColor || primary || '#f14722'
  
  const discount = promotion.originalPrice 
    ? Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100)
    : 0

  const buttonText = mode === 'dine-in' ? 'No te lo pierdas!' : 'Agregar'

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border cursor-pointer',
        'transition-all duration-300 hover:shadow-lg'
      )}
      style={{
        backgroundColor: '#f0f0ea',
        borderColor: '#f0f0ea',
      }}
      onClick={() => onAdd?.(promotion)}
    >
      {/* Image Section */}
      {promotion.imageUrl ? (
        <div className="relative w-full h-32 sm:h-36">
          <img 
            src={promotion.imageUrl} 
            alt={promotion.title} 
            className="w-full h-full object-cover"
          />
          {discount > 0 && (
            <div 
              className="absolute top-2 right-2 px-2 py-1 rounded-full shadow-md"
              style={{ backgroundColor: accent, color: '#fff' }}
            >
              <span className="text-[10px] font-bold">
                {discount}% OFF
              </span>
            </div>
          )}
        </div>
      ) : (
        <div 
          className="relative w-full h-32 sm:h-36 flex items-center justify-center"
          style={{ backgroundColor: accent + '10' }}
        >
          <span style={{ fontSize: '36px', color: accent, fontWeight: 600 }}>%</span>
          {discount > 0 && (
            <div 
              className="absolute top-2 right-2 px-2 py-1 rounded-full shadow-md"
              style={{ backgroundColor: accent, color: '#fff' }}
            >
              <span className="text-[10px] font-bold">
                {discount}% OFF
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content Section */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">
          {promotion.title}
        </h3>
        
        {promotion.shortDescription && (
          <p className="text-[11px] text-gray-500 mb-2 line-clamp-2 leading-relaxed">
            {promotion.shortDescription}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-gray-900 text-base">
              ${promotion.price}
            </span>
            {promotion.originalPrice && (
              <span className="text-xs text-gray-400 line-through">
                ${promotion.originalPrice}
              </span>
            )}
          </div>
          
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ 
              backgroundColor: accent, 
              color: '#fff',
            }}
            onClick={(e) => {
              e.stopPropagation()
              onAdd?.(promotion)
            }}
          >
            {buttonText}
          </button>
        </div>
      </div>

      {promotion.conditions && (
        <div className="px-3 pb-2">
          <p className="text-[9px] text-gray-400 leading-tight">
            * {promotion.conditions}
          </p>
        </div>
      )}
    </div>
  )
}

interface PromotionCarouselProps { 
  promotions: any[] 
  onAdd?: (promotion: any) => void
  primary?: string
  mode?: 'takeaway' | 'dine-in'
}

export function PromotionCarousel({ promotions, onAdd, primary, mode }: PromotionCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (carouselRef.current) {
      const scrollLeft = carouselRef.current.scrollLeft
      const itemWidth = carouselRef.current.children[0]?.getBoundingClientRect().width || 0
      const index = Math.round(scrollLeft / itemWidth)
      setActiveIndex(index)
    }
  }

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div
        ref={carouselRef}
        className="flex gap-3 overflow-x-auto scroll-smooth pb-2"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollSnapType: 'x mandatory',
        }}
        onScroll={handleScroll}
      >
        {promotions.map((promo) => (
          <div
            key={promo._id}
            className="flex-shrink-0"
            style={{
              width: '85%',
              maxWidth: '320px',
              scrollSnapAlign: 'start',
            }}
          >
            <PromotionCard
              promotion={promo}
              onAdd={onAdd}
              primary={primary}
              mode={mode}
            />
          </div>
        ))}
      </div>

      {/* Pagination Dots */}
      {promotions.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {promotions.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (carouselRef.current) {
                  const itemWidth = carouselRef.current.children[0]?.getBoundingClientRect().width || 0
                  carouselRef.current.scrollTo({
                    left: index * itemWidth,
                    behavior: 'smooth',
                  })
                }
              }}
              className="transition-all duration-300"
              style={{
                width: activeIndex === index ? '20px' : '8px',
                height: '8px',
                borderRadius: '9999px',
                backgroundColor: activeIndex === index ? primary : primary + '40',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}