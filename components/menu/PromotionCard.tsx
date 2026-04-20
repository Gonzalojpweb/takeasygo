'use client'

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
        'group relative overflow-hidden rounded-2xl border border-border cursor-pointer',
        'transition-all duration-200 hover:border-opacity-50'
      )}
      style={{
        backgroundColor: '#fff',
        borderColor: '#e5e5e5',
      }}
      onClick={() => onAdd?.(promotion)}
    >
      <div className="flex">
        {promotion.imageUrl ? (
          <div className="w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0">
            <img 
              src={promotion.imageUrl} 
              alt={promotion.title} 
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div 
            className="w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: accent + '10' }}
          >
            <span style={{ fontSize: '32px', color: accent }}>%</span>
          </div>
        )}

        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate flex-1">
                {promotion.title}
              </h3>
              {discount > 0 && (
                <span 
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ backgroundColor: accent, color: '#fff' }}
                >
                  {discount}% OFF
                </span>
              )}
            </div>
            
            {promotion.shortDescription && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {promotion.shortDescription}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-gray-900 text-base sm:text-lg">
                ${promotion.price}
              </span>
              {promotion.originalPrice && (
                <span className="text-xs text-gray-400 line-through">
                  ${promotion.originalPrice}
                </span>
              )}
            </div>
            
            <button
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
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
      </div>

      {promotion.conditions && (
        <div className="px-3 py-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">
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
  return (
    <div className="flex flex-col gap-3">
      {promotions.map((promo) => (
        <PromotionCard 
          key={promo._id} 
          promotion={promo} 
          onAdd={onAdd}
          primary={primary}
          mode={mode}
        />
      ))}
    </div>
  )
}