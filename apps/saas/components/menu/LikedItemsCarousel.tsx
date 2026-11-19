'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { Heart } from 'lucide-react'
import { cloudinaryUrl, cloudinaryBlurUrl } from '@/lib/utils'
import { toPesos } from '@takeasygo/business/browser'
import { captureLikedCarouselClicked, captureLikedCarouselViewed } from '@/lib/tia/events'
import { formatLikes, LIKED_DEFAULT_TITLE, type LikedCarouselSettings, type LikedEntry } from '@/lib/menu/liked-items'

// ============================================================================
// Carrusel «Los que se ganaron un ❤️»
// ============================================================================
// Sección automática: recibe los platos ya elegidos por pickLikedItems (3 a 6,
// ordenados por likes, sin pausados). Cada tarjeta muestra el corazón con la
// cantidad de likes, como Instagram. Con `onSelect` (takeaway) la tarjeta
// abre el flujo normal de compra del plato; en la carta de salón abre el detalle.
// ============================================================================

interface Props {
  entries: Array<LikedEntry<any, any>>
  settings?: LikedCarouselSettings
  primary: string
  textColor?: string
  /** Precio a mostrar según el canal (takeaway usa su precio propio). */
  getPrice: (item: any) => number
  onSelect: (item: any, category: any) => void
  /** Texto del botón; sin texto no se muestra botón (carta de salón). */
  actionLabel?: string
  locationId?: string
  mode?: 'takeaway' | 'dine-in' | 'business'
  /** Nombre visible del plato (traducciones). */
  getName?: (item: any) => string
}

export default function LikedItemsCarousel({
  entries, settings, primary, textColor, getPrice, onSelect, actionLabel, locationId, mode, getName,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const viewedRef = useRef(false)
  const hidden = entries.length === 0 || settings?.showSection === false

  useEffect(() => {
    const el = sectionRef.current
    if (!el || hidden || viewedRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !viewedRef.current) {
        viewedRef.current = true
        captureLikedCarouselViewed({ items: entries.length, locationId, mode })
        observer.disconnect()
      }
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hidden, entries.length, locationId, mode])

  if (hidden) return null

  const style = settings?.style ?? {}
  const accent = style.accentColor || primary
  const heart = style.heartColor || '#ef4444'
  const titleColor = style.textColor || textColor
  const title = settings?.sectionTitle?.trim() || LIKED_DEFAULT_TITLE
  const subtitle = settings?.sectionSubtitle?.trim() || 'Los platos que más corazones juntaron de quienes los pidieron'
  const nameOf = (item: any) => (getName ? getName(item) : item.name)

  return (
    <section
      ref={sectionRef}
      aria-label={title}
      className="mb-8 rounded-2xl py-3"
      style={{ backgroundColor: style.backgroundColor || undefined, paddingLeft: style.backgroundColor ? 12 : 4, paddingRight: style.backgroundColor ? 12 : 4 }}
    >
      <div className="mb-3 px-1">
        <h2 className="text-base font-bold tracking-tight" style={{ color: titleColor }}>{title}</h2>
        <p className="mt-0.5 text-[11px] leading-snug opacity-60" style={{ color: titleColor }}>{subtitle}</p>
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map(({ item, category }, index) => {
          const likes = item.likesCount ?? 0
          const name = nameOf(item)
          const select = () => {
            captureLikedCarouselClicked({ _id: String(item._id), name: item.name, likes, position: index, locationId })
            onSelect(item, category)
          }
          return (
            <article
              key={String(item._id)}
              className="w-[46%] max-w-[220px] flex-shrink-0 snap-start overflow-hidden rounded-2xl border shadow-sm transition-transform active:scale-[0.98]"
              style={{ backgroundColor: style.cardBgColor || '#ffffff', borderColor: accent + '22' }}
            >
              <button type="button" onClick={select} className="block w-full text-left" aria-label={`${name}, ${likes} me gusta`}>
                <div className="relative h-28 w-full bg-zinc-100">
                  {item.imageUrl ? (
                    <Image
                      src={cloudinaryUrl(item.imageUrl, { w: 400 })}
                      alt=""
                      fill
                      sizes="(max-width: 480px) 46vw, 220px"
                      className="object-cover food-photo"
                      placeholder="blur"
                      blurDataURL={cloudinaryBlurUrl(item.imageUrl)}
                      unoptimized={!String(item.imageUrl).includes('cloudinary')}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-300">🍽️</div>
                  )}
                </div>
                <div className="px-2.5 pt-2">
                  {/* Corazón + cantidad, como Instagram */}
                  <p className="flex items-center gap-1 text-[12px] font-bold tabular-nums" style={{ color: '#18181b' }}>
                    <Heart size={15} strokeWidth={2.2} style={{ color: heart, fill: heart }} aria-hidden />
                    {formatLikes(likes)}
                    <span className="font-medium opacity-60">me gusta</span>
                  </p>
                  <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-tight text-zinc-900">{name}</h3>
                </div>
              </button>
              <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1.5">
                <span className="text-[15px] font-bold" style={{ color: accent }}>
                  ${toPesos(getPrice(item)).toLocaleString('es-AR')}
                </span>
                {actionLabel && (
                  <button
                    type="button"
                    onClick={select}
                    className="rounded-xl px-3.5 py-2 text-[11px] font-semibold leading-none text-white transition-transform active:scale-95"
                    style={{ backgroundColor: accent }}
                  >
                    {actionLabel}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
