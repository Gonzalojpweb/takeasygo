'use client'

import { Check } from 'lucide-react'
import { toPesos } from '@takeasygo/business'

interface OptionPhotoCardProps {
  name: string
  extraPrice: number
  imageUrl?: string
  isSelected: boolean
  primaryColor: string
  compact?: boolean
  onClick: () => void
}

export default function OptionPhotoCard({ name, extraPrice, imageUrl, isSelected, primaryColor, compact = false, onClick }: OptionPhotoCardProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex-shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all active:scale-[0.97]"
        style={{ borderColor: isSelected ? primaryColor : '#e4e4e7', backgroundColor: isSelected ? `${primaryColor}08` : '#fff' }}
      >
        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-100" />
          )}
          {isSelected && (
            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              <Check size={10} color="white" strokeWidth={3} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[11px] font-medium leading-tight truncate max-w-[70px]" style={{ color: isSelected ? primaryColor : '#3f3f46' }}>
            {name}
          </span>
          {extraPrice > 0 && (
            <span className="text-[9px] opacity-50 whitespace-nowrap">
              +${toPesos(extraPrice).toLocaleString('es-AR')}
            </span>
          )}
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl border transition-all active:scale-[0.98] text-left"
      style={{ borderColor: isSelected ? primaryColor : '#e4e4e7', backgroundColor: isSelected ? `${primaryColor}08` : '#fff' }}
    >
      <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-zinc-100" />
        )}
        {isSelected && (
          <div className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <Check size={11} color="white" strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] font-medium leading-tight truncate" style={{ color: isSelected ? primaryColor : '#3f3f46' }}>
          {name}
        </span>
        {extraPrice > 0 && (
          <span className="text-[10px] opacity-50 whitespace-nowrap mt-0.5">
            +${toPesos(extraPrice).toLocaleString('es-AR')}
          </span>
        )}
      </div>
      {isSelected && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: primaryColor }}
        >
          <Check size={12} color="white" strokeWidth={3} />
        </div>
      )}
    </button>
  )
}
