'use client'

import Image from 'next/image'
import { Layers } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/utils'
import { toPesos } from '@takeasygo/business/browser'

// ============================================================================
// Carrusel de Combos — separado de Promociones y de Más vendidos
// ============================================================================
// Scroll horizontal con CSS nativo. Sin `onSelect` es solo informativo (la carta
// de salón no toma pedidos).
// ============================================================================

export interface PublicCombo {
  _id: string
  name: string
  description?: string
  priceMode: 'fixed' | 'sumItems'
  fixedPrice?: number | null
  maxItems: number
  allowRepeat: boolean
  chargeCustomizationExtras: boolean
  style?: { bgColor?: string; textColor?: string; badgeLabel?: string; urgencyLabel?: string; imageUrl?: string }
  items: any[]
}

export interface ComboCarouselSettings {
  showSection?: boolean
  sectionTitle?: string
  position?: 'afterBestsellers' | 'afterFeatured' | 'beforeCategories' | 'afterCategories'
  style?: { backgroundColor?: string; textColor?: string; badgeColor?: string; accentColor?: string }
}

interface Props {
  combos: PublicCombo[]
  settings?: ComboCarouselSettings
  primary: string
  textColor?: string
  onSelect?: (combo: PublicCombo) => void
}

const money = (cents: number) => `$${toPesos(cents).toLocaleString('es-AR')}`

export default function ComboCarousel({ combos, settings, primary, textColor, onSelect }: Props) {
  if (combos.length === 0 || settings?.showSection === false) return null
  const accent = settings?.style?.accentColor || primary
  const title = settings?.sectionTitle || 'COMBOS'

  return (
    <section aria-label={title} className="mb-8 rounded-2xl px-1 py-3" style={{ backgroundColor: settings?.style?.backgroundColor || undefined }}>
      <div className="mb-4 flex items-center gap-2 px-1">
        <Layers size={18} style={{ color: accent }} strokeWidth={2.5} aria-hidden />
        <h2 className="text-base font-bold tracking-tight" style={{ color: settings?.style?.textColor || textColor }}>{title}</h2>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
        {combos.map((combo) => {
          const cardText = combo.style?.textColor || settings?.style?.textColor || textColor
          const content = (
            <>
              {combo.style?.imageUrl && (
                <div className="relative h-28 w-full">
                  <Image src={cloudinaryUrl(combo.style.imageUrl, { w: 480 })} alt="" fill sizes="240px" className="object-cover" unoptimized={!combo.style.imageUrl.includes('cloudinary')} />
                </div>
              )}
              <div className="space-y-1 p-3">
                {combo.style?.badgeLabel && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase text-white" style={{ backgroundColor: settings?.style?.badgeColor || accent }}>{combo.style.badgeLabel}</span>
                )}
                <p className="text-sm font-bold leading-tight">{combo.name}</p>
                <p className="line-clamp-2 text-xs opacity-70">{combo.description || combo.items.map((i) => i.name).join(' · ')}</p>
                {combo.style?.urgencyLabel && <p className="text-xs font-bold" style={{ color: accent }}>{combo.style.urgencyLabel}</p>}
                <p className="pt-1 text-sm font-black" style={{ color: accent }}>
                  {combo.priceMode === 'fixed' ? money(combo.fixedPrice ?? 0) : `${combo.maxItems} platos · según lo que elijas`}
                </p>
              </div>
            </>
          )
          const cardClass = 'w-60 flex-shrink-0 snap-start overflow-hidden rounded-2xl border text-left shadow-sm'
          const cardStyle = { backgroundColor: combo.style?.bgColor || undefined, color: cardText, borderColor: accent + '30' }
          return onSelect ? (
            <button key={combo._id} type="button" className={cardClass} style={cardStyle} onClick={() => onSelect(combo)}>{content}</button>
          ) : (
            <article key={combo._id} className={cardClass} style={cardStyle}>{content}</article>
          )
        })}
      </div>
    </section>
  )
}
