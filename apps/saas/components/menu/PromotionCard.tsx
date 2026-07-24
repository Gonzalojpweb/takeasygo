'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Tag, Plus, Percent, Info, Megaphone, Heart, ExternalLink, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { capturePromotionViewed, capturePromotionClicked, capturePromotionApplied } from '@/lib/tia/events'
import ClubOnboardingModal from '../club/ClubOnboardingModal'

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

// Darken a hex color by a percentage
function darkenColor(hex?: string, amount = 20): string {
  if (!hex) return '#c0392b'
  const h = hex.replace('#', '')
  let r = parseInt(h.substring(0, 2), 16)
  let g = parseInt(h.substring(2, 4), 16)
  let b = parseInt(h.substring(4, 6), 16)
  r = Math.max(0, r - amount)
  g = Math.max(0, g - amount)
  b = Math.max(0, b - amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
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
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          capturePromotionViewed({ _id: promotion._id, type: promotion.type, title: promotion.title })
          obs.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const styles = promotion.customStyles || {}
  const accent = styles.accentColor || primary || '#e11d48'

  const discount = promotion.originalPrice
    ? Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100)
    : 0

  const promoType = promotion.type || 'sale'
  const canAddToCart = promoType === 'sale'

  // ==================== FEATURED CARD (Banner estilo PedidosYA) ====================
  if (isFeatured) {
    const cardBgColor = styles.backgroundColor || primary || '#e11d48'
    const cardBgDark = darkenColor(cardBgColor, 40)
    const onCard = '#ffffff' // always white text on vibrant bg

    return (
      <>
        <div
          ref={cardRef}
          onClick={() => {
            capturePromotionClicked({ _id: promotion._id, type: promotion.type })
            if (canAddToCart) {
              onAdd?.(promotion)
            } else if (promoType === 'loyalty') {
              setShowLoyaltyModal(true)
            } else if (promotion.conditions || promotion.shortDescription) {
              // Show details for info/announcements if there is a description/conditions
              alert(`${promotion.title}\n\n${promotion.shortDescription || ''}\n\nCondiciones: ${promotion.conditions || 'Ninguna'}`)
            }
          }}
          className={cn(
            'relative overflow-hidden select-none flex flex-row justify-between items-stretch transition-all duration-200 active:scale-[0.982]',
            (canAddToCart || promoType === 'loyalty' || promotion.conditions || promotion.shortDescription) ? 'cursor-pointer' : 'cursor-default'
          )}
          style={{
            borderRadius: styles.borderRadius || '20px',
            background: `linear-gradient(130deg, ${cardBgColor} 0%, ${cardBgDark} 100%)`,
            height: '172px',
            minWidth: 0,
          }}
        >
          {/* Decorative circle */}
          <div
            className="absolute -right-8 -top-8 rounded-full opacity-10 pointer-events-none"
            style={{ width: 160, height: 160, backgroundColor: '#ffffff' }}
          />
          <div
            className="absolute -right-4 bottom-0 rounded-full opacity-[0.07] pointer-events-none"
            style={{ width: 120, height: 120, backgroundColor: '#ffffff' }}
          />

          {/* Left Content Column */}
          <div className="flex-1 flex flex-col justify-between p-4 z-10 min-w-0">
            {/* Top: type badge */}
            <div className="flex items-center gap-1.5">
              <span
                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: onCard }}
              >
                {promoType === 'sale' ? (typeLabels?.sale || 'PROMO')
                  : promoType === 'info' ? (typeLabels?.info || 'INFO')
                  : promoType === 'announcement' ? (typeLabels?.announcement || 'AVISO')
                  : (typeLabels?.loyalty || 'CLUB')}
              </span>
            </div>

            {/* Middle: title + discount */}
            <div className="flex flex-col gap-0.5 overflow-y-auto pr-1 scrollbar-thin">
              {discount > 0 && (
                <div className="flex flex-col leading-none mb-1">
                  <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    Hasta
                  </span>
                  <span className="text-[30px] font-black leading-none tracking-tight" style={{ color: '#ffffff' }}>
                    {discount}% OFF
                  </span>
                </div>
              )}
              <h3
                className="font-bold text-[14px] leading-snug break-words"
                style={{ color: discount > 0 ? 'rgba(255,255,255,0.88)' : '#ffffff', marginTop: discount > 0 ? 0 : 4 }}
              >
                {promotion.title}
              </h3>
              {promotion.shortDescription && (
                <p className="text-[11px] leading-snug mt-0.5 opacity-90 break-words" style={{ color: 'rgba(255,255,255,0.80)' }}>
                  {promotion.shortDescription}
                </p>
              )}
            </div>

            {/* Bottom: price + CTA */}
            <div className="flex items-center gap-2 mt-2">
              {promoType === 'sale' && promotion.price > 0 && (
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-black text-white">
                    ${promotion.price.toLocaleString('es-AR')}
                  </span>
                  {promotion.originalPrice && (
                    <span className="text-xs line-through opacity-60 text-white">
                      ${promotion.originalPrice.toLocaleString('es-AR')}
                    </span>
                  )}
                </div>
              )}

              <div className="ml-auto">
                {promoType === 'sale' ? (
                  mode === 'takeaway' || (mode === 'dine-in' && onAdd) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd?.(promotion); capturePromotionApplied({ _id: promotion._id, type: promotion.type, title: promotion.title }, discount) }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all flex-shrink-0"
                      style={{ backgroundColor: '#ffffff', color: cardBgColor }}
                    >
                      Agregar <Plus size={13} strokeWidth={3} />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (promotion.conditions || promotion.shortDescription) {
                          alert(`${promotion.title}\n\n${promotion.shortDescription || ''}\n\nCondiciones: ${promotion.conditions || 'Ninguna'}`)
                        } else {
                          alert(`Promoción: ${promotion.title}`)
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md flex-shrink-0"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff' }}
                    >
                      Ver detalle <ChevronRight size={13} strokeWidth={3} />
                    </button>
                  )
                ) : promoType === 'loyalty' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowLoyaltyModal(true) }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all flex-shrink-0"
                    style={{ backgroundColor: '#ffffff', color: cardBgColor }}
                  >
                    Unirme <Heart size={13} strokeWidth={3} />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (promotion.ctaLink) {
                        window.open(promotion.ctaLink, '_blank');
                      } else if (promotion.conditions || promotion.shortDescription) {
                        alert(`${promotion.title}\n\n${promotion.shortDescription || ''}\n\nCondiciones: ${promotion.conditions || 'Ninguna'}`)
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff' }}
                  >
                    {promotion.ctaText || 'Ver más'} {promotion.ctaLink ? <ExternalLink size={12} /> : <ChevronRight size={13} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Image Column (Cleanly integrated using flex-shrink-0, respecting border-radius of parent container) */}
          {promotion.imageUrl && (
            <div
              className="w-[48%] flex-shrink-0 relative overflow-hidden self-stretch pointer-events-none"
              style={{
                borderTopRightRadius: styles.borderRadius || '20px',
                borderBottomRightRadius: styles.borderRadius || '20px',
              }}
            >
              <img
                src={promotion.imageUrl}
                alt={promotion.title}
                className="w-full h-full object-cover object-[center_35%]"
              />
              {/* Soft gradient mask to blend left edge with the colored card background */}
              <div
                className="absolute inset-y-0 left-0 w-8 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, ${cardBgColor}, transparent)`
                }}
              />
            </div>
          )}
        </div>

        {tenantSlug && (
          <ClubOnboardingModal
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
  const isPageBgLight = isLightColor(bg)
  const isBgLight = isLightColor(styles.backgroundColor || bg)
  const cardBg = styles.backgroundColor || (isPageBgLight ? '#ffffff' : 'rgba(255,255,255,0.06)')
  const cardBorderColor = isPageBgLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.10)'
  const titleColor = styles.textColor || (isBgLight ? '#111827' : '#ffffff')
  const subtitleColor = isBgLight ? '#6b7280' : '#d1d5db'

  return (
    <>
      <div
        ref={cardRef}
        onClick={() => {
          capturePromotionClicked({ _id: promotion._id, type: promotion.type })
          if (canAddToCart) onAdd?.(promotion)
        }}
        className={cn(
          'flex gap-3 rounded-2xl transition-all active:scale-[0.983] w-full overflow-hidden',
          canAddToCart ? 'cursor-pointer' : 'cursor-default'
        )}
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${cardBorderColor}`,
          borderRadius: styles.borderRadius || '16px',
          minHeight: '110px',
        }}
      >
        {/* Image */}
        <div className="relative flex-shrink-0 self-stretch" style={{ width: 108 }}>
          {promotion.imageUrl ? (
            <>
              <img
                src={promotion.imageUrl}
                alt={promotion.title}
                className="w-full h-full object-cover object-[center_35%]"
                style={{ borderRadius: '16px 0 0 16px' }}
              />
              {/* Discount badge on image */}
              {discount > 0 && (
                <div
                  className="absolute top-2 left-2 rounded-lg px-1.5 py-0.5 text-[10px] font-black text-white shadow-md"
                  style={{ backgroundColor: '#ef4444' }}
                >
                  -{discount}%
                </div>
              )}
            </>
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-1"
              style={{
                borderRadius: '16px 0 0 16px',
                background: `linear-gradient(135deg, ${accent}25, ${accent}10)`,
              }}
            >
              {promoType === 'sale' && <Percent size={22} style={{ color: accent }} />}
              {promoType === 'info' && <Info size={22} style={{ color: accent }} />}
              {promoType === 'announcement' && <Megaphone size={22} style={{ color: accent }} />}
              {promoType === 'loyalty' && <Heart size={22} style={{ color: accent }} />}
              {discount > 0 && (
                <span className="text-[11px] font-black" style={{ color: accent }}>-{discount}%</span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-3 pr-3">
          <div className="space-y-1">
            <span
              className="text-[9px] uppercase font-black tracking-widest block"
              style={{ color: accent }}
            >
              {promoType === 'sale' ? (typeLabels?.sale || 'PROMO')
                : promoType === 'info' ? (typeLabels?.info || 'INFO')
                : promoType === 'announcement' ? (typeLabels?.announcement || 'AVISO')
                : (typeLabels?.loyalty || 'CLUB')}
            </span>
            <h3
              className="font-bold text-sm leading-tight line-clamp-2"
              style={{ color: titleColor }}
            >
              {promotion.title}
            </h3>
            {promotion.shortDescription && (
              <p
                className="text-xs leading-snug line-clamp-2"
                style={{ color: subtitleColor }}
              >
                {promotion.shortDescription}
              </p>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            {promoType === 'sale' ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-black tracking-tight" style={{ color: accent }}>
                    ${promotion.price.toLocaleString('es-AR')}
                  </span>
                  {promotion.originalPrice && (
                    <span className="text-xs line-through" style={{ color: subtitleColor }}>
                      ${promotion.originalPrice.toLocaleString('es-AR')}
                    </span>
                  )}
                </div>
                {(mode === 'takeaway' || (mode === 'dine-in' && onAdd)) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd?.(promotion); capturePromotionApplied({ _id: promotion._id, type: promotion.type, title: promotion.title }, discount) }}
                      className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-all flex-shrink-0"
                      style={{ backgroundColor: accent, color: isLightColor(accent) ? '#111' : '#fff' }}
                    >
                      <Plus size={16} strokeWidth={3} />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (promoType === 'loyalty') setShowLoyaltyModal(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold active:scale-[0.97] transition-all"
                style={{ backgroundColor: accent + '18', color: accent, border: `1px solid ${accent}30` }}
              >
                {promoType === 'loyalty' && <Heart size={13} />}
                {promoType === 'announcement' && <ExternalLink size={13} />}
                <span>{promotion.ctaText || (promoType === 'loyalty' ? 'Unirme' : 'Ver más')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {tenantSlug && (
        <ClubOnboardingModal
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

// ==================== CAROUSEL ====================

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

const AUTO_PLAY_INTERVAL = 4000   // 4s between slides
const PAUSE_ON_TOUCH_MS = 8000    // pause 8s after user interaction

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
  const [progress, setProgress] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPausedRef = useRef(false)
  const isFeatured = variant === 'featured'

  const total = promotions.length

  // Detect reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const scrollToIndex = useCallback((index: number) => {
    if (!carouselRef.current) return
    const items = carouselRef.current.children
    if (!items[index]) return
    const item = items[index] as HTMLElement
    carouselRef.current.scrollTo({
      left: item.offsetLeft - carouselRef.current.offsetLeft,
      behavior: 'smooth',
    })
    setActiveIndex(index)
  }, [])

  const startProgress = useCallback(() => {
    setProgress(0)
    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    const step = 100 / (AUTO_PLAY_INTERVAL / 50)
    progressTimerRef.current = setInterval(() => {
      setProgress(p => Math.min(p + step, 100))
    }, 50)
  }, [])

  const stopProgress = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    setProgress(0)
  }, [])

  const scheduleNext = useCallback((currentIndex: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (prefersReducedMotion || total <= 1) return

    startProgress()
    timerRef.current = setTimeout(() => {
      if (isPausedRef.current) return
      const next = currentIndex + 1
      if (next < total) {
        scrollToIndex(next)
        scheduleNext(next)
      } else {
        stopProgress()
      }
    }, AUTO_PLAY_INTERVAL)
  }, [total, prefersReducedMotion, scrollToIndex, startProgress, stopProgress])

  // Start auto-play on mount
  useEffect(() => {
    if (total > 1 && !prefersReducedMotion) {
      scheduleNext(0)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [total]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause on user interaction
  const handlePointerDown = () => {
    isPausedRef.current = true
    stopProgress()
    if (timerRef.current) clearTimeout(timerRef.current)

    // Resume after pause period
    setTimeout(() => {
      isPausedRef.current = false
      const current = activeIndex
      scheduleNext(current)
    }, PAUSE_ON_TOUCH_MS)
  }

  const handleScroll = () => {
    if (!carouselRef.current) return
    const scrollLeft = carouselRef.current.scrollLeft
    const containerWidth = carouselRef.current.offsetWidth
    const index = Math.round(scrollLeft / containerWidth)
    if (index !== activeIndex) setActiveIndex(index)
  }

  const isPageBgLight = isLightColor(bg)

  return (
    <div className="relative select-none">
      {/* Carousel track */}
      <div
        ref={carouselRef}
        className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          gap: isFeatured ? '12px' : '10px',
        }}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
      >
        {promotions.map((promo) => {
          const cardIsFeatured = promo.isFeatured
          return (
            <div
              key={promo._id}
              className="flex-shrink-0 snap-start"
              style={{
                width: cardIsFeatured ? 'calc(92% - 6px)' : 'calc(88% - 5px)',
                maxWidth: cardIsFeatured ? '420px' : '320px',
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
                variant={cardIsFeatured ? 'featured' : 'standard'}
                typeLabels={typeLabels}
                loyaltyMessaging={loyaltyMessaging}
              />
            </div>
          )
        })}
      </div>

      {/* Dots + progress */}
      {total > 1 && (
        <div className="flex flex-col items-center gap-2 mt-3">
          {/* Dots row */}
          <div className="flex items-center gap-1.5">
            {promotions.map((_, index) => {
              const isActive = activeIndex === index
              return (
                <button
                  key={index}
                  onClick={() => {
                    scrollToIndex(index)
                    handlePointerDown()
                  }}
                  className="transition-all duration-300 rounded-full"
                  style={{
                    width: isActive ? '20px' : '6px',
                    height: '6px',
                    backgroundColor: isActive ? primary : (isPageBgLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'),
                  }}
                />
              )
            })}
          </div>

          {/* Progress bar for active slide — only when auto-play is running */}
          {!prefersReducedMotion && activeIndex < total - 1 && progress > 0 && (
            <div
              className="rounded-full overflow-hidden"
              style={{
                width: '40px',
                height: '2px',
                backgroundColor: isPageBgLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)',
              }}
            >
              <div
                className="h-full rounded-full transition-none"
                style={{
                  width: `${progress}%`,
                  backgroundColor: primary,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}