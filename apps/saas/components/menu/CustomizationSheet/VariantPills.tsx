'use client'

import { channelPrice, toPesos } from '@takeasygo/business/browser'

interface VariantInfo {
  _id?: string
  name: string
  nameTranslations?: { en: string }
  price: number
  takeawayPrice?: number
  businessPrice?: number
  /** 21/11/2026: descuento % de carta (lib/menu-discounts). */
  _menuDiscount?: { percent: number; list: { price: number; takeawayPrice?: number; businessPrice?: number } }
}

interface VariantPillsProps {
  variants: VariantInfo[]
  selectedVariant: VariantInfo | null
  mode: 'takeaway' | 'dine-in' | 'business'
  primaryColor: string
  onSelect: (variant: VariantInfo) => void
}

export default function VariantPills({ variants, selectedVariant, mode, primaryColor, onSelect }: VariantPillsProps) {
  if (variants.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-zinc-900">Elegí tu variante</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Obligatorio</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {variants.map((v) => {
          const variantPrice = channelPrice(v, mode)

          const isSelected = selectedVariant?.name === v.name
          const listPrice = v._menuDiscount ? channelPrice(v._menuDiscount.list, mode) : 0
          const hasDiscount = listPrice > variantPrice

          return (
            <button
              key={v.name}
              onClick={() => onSelect(v)}
              className="flex items-center justify-between p-3 rounded-xl border-2 transition-all active:scale-[0.97]"
              style={{
                borderColor: isSelected ? primaryColor : '#e4e4e7',
                backgroundColor: isSelected ? `${primaryColor}08` : 'white',
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ borderColor: isSelected ? primaryColor : '#d4d4d8' }}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                  )}
                </div>
                <span className="text-sm font-medium text-zinc-800 truncate">{v.name}</span>
              </div>
              {hasDiscount ? (
                <span className="flex flex-col items-end flex-shrink-0 ml-2 leading-tight">
                  <span className="text-[11px] text-zinc-400 line-through">${toPesos(listPrice).toLocaleString('es-AR')}</span>
                  <span className="text-sm font-bold text-green-600">
                    ${toPesos(variantPrice).toLocaleString('es-AR')}
                    <span className="ml-1 text-[10px] font-black">-{v._menuDiscount!.percent}%</span>
                  </span>
                </span>
              ) : (
                <span className="text-sm font-bold flex-shrink-0 ml-2" style={{ color: primaryColor }}>
                  ${toPesos(variantPrice).toLocaleString('es-AR')}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
