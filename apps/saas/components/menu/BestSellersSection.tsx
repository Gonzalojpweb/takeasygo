'use client'

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, cloudinaryUrl, cloudinaryBlurUrl } from '@/lib/utils'
import { toPesos } from '@takeasygo/business/browser'
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
  mode?: 'takeaway' | 'dine-in' | 'business'
}

export default function BestSellersSection({
  bestSellers,
  onAdd,
  styles = {},
  locationName,
  primaryColor,
  mode = 'takeaway',
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
  const subtitle = styles.sectionSubtitle || (locationName ? `Lo que más piden en ${locationName}` : '')

  function resolvePrice(item: BestSellerItem): number {
    if (mode === 'takeaway' && item.takeawayPrice != null) return item.takeawayPrice
    if (mode === 'business' && item.businessPrice != null) return item.businessPrice
    return item.price
  }

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
    <section ref={sectionRef} className="mt-6 px-4">
      {/* Header */}
      <div className="flex items-end justify-between mb-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold truncate" style={{ color: primaryColor }}>
            🔥 {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          <button
            onClick={() => scroll('left')}
            className="w-7 h-7 rounded-full flex items-center justify-center active:bg-zinc-100 transition-colors"
          >
            <ChevronLeft size={16} className="text-zinc-400" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-7 h-7 rounded-full flex items-center justify-center active:bg-zinc-100 transition-colors"
          >
            <ChevronRight size={16} className="text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Cards scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide -mx-1 px-1"
      >
        {bestSellers.map((item, index) => (
          <div
            key={item._id}
            className="w-[46%] flex-shrink-0 snap-start"
          >
            <div
              className={cn(
                'rounded-2xl overflow-hidden border border-zinc-100 active:scale-[0.97] transition-all duration-200 cursor-pointer'
              )}
              style={{ backgroundColor: cardBg }}
              onClick={() => handleCardClick(item, index)}
            >
              {/* Image */}
              <div className="relative h-28">
                {item.imageUrl ? (
                  <Image
                    src={cloudinaryUrl(item.imageUrl, { w: 400 })}
                    alt={item.name}
                    fill
                    sizes="46vw"
                    className="object-cover food-photo"
                    placeholder="blur"
                    blurDataURL={cloudinaryBlurUrl(item.imageUrl)}
                    priority={index === 0}
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-2xl text-zinc-300">
                    🍽️
                  </div>
                )}
                {/* Badge */}
                <span
                  className="absolute top-2 right-2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm"
                  style={{ backgroundColor: badgeBg }}
                >
                  🔥 Top
                </span>
              </div>

              {/* Content */}
              <div className="p-2.5">
                <h3 className="font-semibold text-[13px] leading-tight text-zinc-900 line-clamp-1">
                  {item.name}
                </h3>

                {item.description && (
                  <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
                    {item.description}
                  </p>
                )}

                {item.count > 0 && (
                  <p className="text-[9px] text-zinc-400 mt-1">
                    🔥 {item.count.toLocaleString()} pedidos/mes
                  </p>
                )}

                {/* Price + Add row */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-bold" style={{ color: accent }}>
                    ${toPesos(resolvePrice(item)).toLocaleString('es-AR')}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCardClick(item, index)
                    }}
                    className="text-white px-3 py-1 rounded-xl font-semibold text-[11px] active:scale-95 transition-all leading-none"
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
