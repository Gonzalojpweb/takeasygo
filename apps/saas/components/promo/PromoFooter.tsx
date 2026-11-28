'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { readableTextOn } from './color'

// ─── Pie fijo de la promo ────────────────────────────────────────────────────
// Botón principal (color de la marca con texto de contraste suficiente),
// acción secundaria y condiciones. Siempre a la vista, sin importar el largo
// del contenido.

interface PromoFooterProps {
  primaryLabel?: string
  onPrimary?: () => void
  onSecondary: () => void
  terms?: string
  accentColor: string
}

export function PromoFooter({ primaryLabel, onPrimary, onSecondary, terms, accentColor }: PromoFooterProps) {
  const text = readableTextOn(accentColor)
  return (
    <div className="flex flex-col gap-1">
      {primaryLabel && onPrimary && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={onPrimary}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold"
          style={{ backgroundColor: accentColor, color: text }}
        >
          <span className="truncate">{primaryLabel}</span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </motion.button>
      )}
      <button
        type="button"
        onClick={onSecondary}
        className="h-11 w-full rounded-2xl text-sm font-semibold"
        style={{ color: 'var(--tgo-text-secondary, #6B6560)' }}
      >
        Seguir navegando
      </button>
      {terms && (
        <p className="px-2 text-center text-[11px] leading-snug" style={{ color: 'var(--tgo-text-muted, #A09A95)' }}>
          {terms}
        </p>
      )}
    </div>
  )
}
