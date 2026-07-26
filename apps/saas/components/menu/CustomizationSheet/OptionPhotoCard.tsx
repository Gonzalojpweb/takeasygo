'use client'

import { Check } from 'lucide-react'

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
        className="flex-shrink-0 flex flex-col items-center transition-all active:scale-[0.97]"
        style={{ width: 80 }}
      >
        <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 mb-1"
          style={{ borderColor: isSelected ? primaryColor : '#e4e4e7' }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-100" />
          )}
          {isSelected && (
            <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
              style={{ backgroundColor: primaryColor }}
            >
              <Check size={12} color="white" strokeWidth={3} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-medium leading-tight text-center truncate w-full" style={{ color: isSelected ? primaryColor : '#3f3f46' }}>
          {name}
        </span>
        {extraPrice > 0 && (
          <span className="text-[9px] opacity-60 whitespace-nowrap">
            +${extraPrice.toLocaleString('es-AR')}
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center transition-all active:scale-[0.97] rounded-xl overflow-hidden border-2"
      style={{ borderColor: isSelected ? primaryColor : '#e4e4e7' }}
    >
      <div className="relative w-full aspect-square overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-zinc-100" />
        )}
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow"
            style={{ backgroundColor: primaryColor }}
          >
            <Check size={14} color="white" strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="w-full px-2 py-1.5 text-center">
        <p className="text-[10px] font-medium leading-tight truncate" style={{ color: isSelected ? primaryColor : '#3f3f46' }}>
          {name}
        </p>
        {extraPrice > 0 && (
          <p className="text-[9px] opacity-60 whitespace-nowrap mt-0.5">
            +${extraPrice.toLocaleString('es-AR')}
          </p>
        )}
      </div>
    </button>
  )
}
