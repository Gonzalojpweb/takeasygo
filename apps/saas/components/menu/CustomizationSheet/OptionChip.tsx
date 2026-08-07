'use client'

import { Check } from 'lucide-react'
import { toPesos } from '@takeasygo/business'

interface OptionChipProps {
  name: string
  extraPrice: number
  isSelected: boolean
  primaryColor: string
  textColor: string
  onClick: () => void
}

export default function OptionChip({ name, extraPrice, isSelected, primaryColor, textColor, onClick }: OptionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] border"
      style={{
        backgroundColor: isSelected ? `${primaryColor}15` : 'white',
        borderColor: isSelected ? primaryColor : '#e4e4e7',
        color: isSelected ? primaryColor : textColor,
      }}
    >
      {isSelected && (
        <Check size={14} strokeWidth={3} style={{ color: primaryColor }} />
      )}
      <span className="truncate">{name}</span>
      {extraPrice > 0 && (
        <span className="text-xs opacity-70 whitespace-nowrap">
          +${toPesos(extraPrice).toLocaleString('es-AR')}
        </span>
      )}
    </button>
  )
}
