'use client'

import { Check } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'

interface OptionChipProps {
  name: string
  extraPrice: number
  isSelected: boolean
  primaryColor: string
  textColor: string
  /** Agotada hoy: se ve en gris y no se puede elegir. */
  soldOut?: boolean
  onClick: () => void
}

export default function OptionChip({ name, extraPrice, isSelected, primaryColor, textColor, soldOut = false, onClick }: OptionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soldOut && !isSelected}
      aria-label={soldOut ? `${name}, agotado` : undefined}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] border"
      style={{
        backgroundColor: isSelected ? `${primaryColor}15` : 'white',
        borderColor: isSelected ? primaryColor : '#e4e4e7',
        color: isSelected ? primaryColor : textColor,
        opacity: soldOut ? 0.5 : 1,
        cursor: soldOut ? 'not-allowed' : undefined,
      }}
    >
      {isSelected && (
        <Check size={14} strokeWidth={3} style={{ color: primaryColor }} />
      )}
      <span className={soldOut ? 'truncate line-through' : 'truncate'}>{name}</span>
      {soldOut && <span className="text-[10px] font-bold uppercase tracking-wide">Agotado</span>}
      {!soldOut && extraPrice > 0 && (
        <span className="text-xs opacity-70 whitespace-nowrap">
          +${toPesos(extraPrice).toLocaleString('es-AR')}
        </span>
      )}
    </button>
  )
}
