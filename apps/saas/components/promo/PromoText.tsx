'use client'

import { motion } from 'framer-motion'

// ─── Textos de la promo ──────────────────────────────────────────────────────
// Jerarquía fija: etiqueta (fecha / campaña) → título → descripción. Texto
// oscuro sobre fondo blanco: legible con cualquier color de marca.

interface PromoTextProps {
  eyebrow?: string
  title: string
  description?: string
  accentColor: string
}

export function PromoText({ eyebrow, title, description, accentColor }: PromoTextProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.35 }}
      className="pt-4"
    >
      {eyebrow && (
        <span
          className="mb-2 inline-block max-w-full rounded-xl px-2.5 py-1 text-[11px] font-bold uppercase leading-snug tracking-wide"
          style={{ backgroundColor: `${accentColor}26`, color: 'var(--tgo-text-primary, #1A1A1A)' }}
        >
          {eyebrow}
        </span>
      )}
      <h2 className="text-[22px] font-extrabold leading-tight tracking-tight" style={{ color: 'var(--tgo-text-primary, #1A1A1A)' }}>
        {title}
      </h2>
      {description && (
        <p className="mt-1.5 text-[15px] leading-snug" style={{ color: 'var(--tgo-text-secondary, #6B6560)' }}>
          {description}
        </p>
      )}
    </motion.div>
  )
}
