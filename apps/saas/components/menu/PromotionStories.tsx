'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

interface StoryPromotion {
  _id: string
  title: string
  description?: string
  shortDescription?: string
  imageUrl?: string
  conditions?: string
  ctaText?: string
  ctaLink?: string
  type?: string
}

interface Props {
  promotions: StoryPromotion[]
  onClose: () => void
  primaryColor?: string
}

export default function PromotionStories({ promotions, onClose, primaryColor = '#000' }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const animRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const DURATION = 5000

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < promotions.length - 1

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
    setProgress(0)
    startTimeRef.current = Date.now()
  }, [])

  const goNext = useCallback(() => {
    if (hasNext) goTo(currentIndex + 1)
    else onClose()
  }, [hasNext, currentIndex, goTo, onClose])

  const goPrev = useCallback(() => {
    if (hasPrev) goTo(currentIndex - 1)
  }, [hasPrev, currentIndex, goTo])

  useEffect(() => {
    if (paused || promotions.length === 0) return
    startTimeRef.current = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min(elapsed / DURATION, 1)
      setProgress(pct)
      if (pct >= 1) { goNext(); return }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [currentIndex, paused, promotions.length, goNext])

  const handleTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.3) goPrev()
    else goNext()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return
    const diff = e.changedTouches[0].clientX - touchStart
    if (Math.abs(diff) > 50) {
      if (diff > 0) goPrev()
      else goNext()
    }
    setTouchStart(null)
  }

  if (promotions.length === 0) return null

  const promo = promotions[currentIndex]

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
        onClick={onClose}
        className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"
      >
        <X size={18} className="text-white" />
      </button>

      <div
        className="flex-1 flex items-center justify-center relative select-none"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        {promo.imageUrl ? (
          <img src={promo.imageUrl} alt={promo.title} className="w-full h-full object-contain" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: primaryColor }}>
            <div className="text-center max-w-md">
              <p className="text-white text-2xl font-black mb-3">{promo.title}</p>
              {promo.shortDescription && <p className="text-white/80 text-sm">{promo.shortDescription}</p>}
              {promo.description && <p className="text-white/60 text-xs mt-2">{promo.description}</p>}
            </div>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 pt-12">
          <p className="text-white font-bold text-lg">{promo.title}</p>
          {promo.shortDescription && <p className="text-white/70 text-sm mt-1">{promo.shortDescription}</p>}
          {promo.conditions && <p className="text-white/40 text-xs mt-2">{promo.conditions}</p>}
          {promo.ctaText && (
            <a
              href={promo.ctaLink || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 px-6 py-2 rounded-full text-sm font-bold"
              style={{ backgroundColor: primaryColor, color: 'white' }}
              onClick={(e) => e.stopPropagation()}
            >
              {promo.ctaText}
            </a>
          )}
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
