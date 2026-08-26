'use client'

import { useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import { captureBestSellerViewed, captureBestSellerClicked } from '@/lib/tia/events'
import type { BestSellerItem } from '@/lib/tia/bestSellers'

interface BestSellersStyles {
  showSection?: boolean
  sectionTitle?: string
  sectionSubtitle?: string
  accentColor?: string
  cardBgColor?: string
  badgeBgColor?: string
}

interface Props {
  bestSellers: BestSellerItem[]
  onAdd: (item: BestSellerItem) => void
  styles?: BestSellersStyles
  locationName?: string
  primaryColor: string
}

export default function BestSellersSection({
  bestSellers,
  onAdd,
  styles = {},
  locationName,
  primaryColor,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const viewedRef = useRef(false)

  useEffect(() => {
    if (!sectionRef.current || viewedRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !viewedRef.current) {
          viewedRef.current = true
          captureBestSellerViewed()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  if (!bestSellers || bestSellers.length === 0) return null

  const accent = styles.accentColor || primaryColor
  const cardBg = styles.cardBgColor || '#ffffff'
  const badgeBg = styles.badgeBgColor || '#ef4444'
  const title = styles.sectionTitle || 'Los más vendidos'
  const subtitle = styles.sectionSubtitle || (locationName ? `Lo que más están pidiendo en ${locationName}` : '')

  function scroll(dir: 'left' | 'right') {
    if (!scrollRef.current) return
    const w = scrollRef.current.offsetWidth * 0.78
    scrollRef.current.scrollBy({ left: dir === 'left' ? -w : w, behavior: 'smooth' })
  }

  function handleCardClick(item: BestSellerItem, position: number) {
    captureBestSellerClicked({ _id: item._id, name: item.name, price: item.price, position })
    onAdd(item)
  }

  return (
    <section ref={sectionRef} className="mt-8 px-5">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>
            🔥 {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full flex items-center justify-center active:bg-zinc-100 transition-colors"
          >
            <ChevronLeft size={20} className="text-zinc-400" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full flex items-center justify-center active:bg-zinc-100 transition-colors"
          >
            <ChevronRight size={20} className="text-zinc-400" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-1 px-1"
      >
        {bestSellers.map((item, index) => (
          <div
            key={item._id}
            className="w-[58%] flex-shrink-0 snap-start"
          >
            <div
              className={cn(
                'rounded-3xl overflow-hidden shadow-sm border border-zinc-100 active:scale-[0.97] transition-all duration-200 cursor-pointer'
              )}
              style={{ backgroundColor: cardBg }}
              onClick={() => handleCardClick(item, index)}
            >
              <div className="relative h-35">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-200 flex items-center justify-center text-4xl text-zinc-400">
                    🍽️
                  </div>
                )}
                <div
                  className="absolute top-3 right-3 text-white text-xs font-bold px-3 py-1 rounded-full shadow"
                  style={{ backgroundColor: badgeBg }}
                >
                  🔥 Más vendido
                </div>
              </div>

              <div className="p-4">
                <h3 className="font-bold text-sm leading-tight text-zinc-900">
                  {item.name}
                </h3>

                {item.description && (
                  <p className="text-[12px] text-zinc-600 line-clamp-2 mt-2">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center justify-between mt-5">
                  <span className="text-xl font-bold" style={{ color: accent }}>
                    ${toPesos(item.price).toLocaleString('es-AR')}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCardClick(item, index)
                    }}
                    className="text-white px-6 py-2 rounded-2xl font-semibold text-sm active:scale-95 transition-all"
                    style={{ backgroundColor: accent }}
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
