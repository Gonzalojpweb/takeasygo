'use client'

import { motion } from 'framer-motion'
import { readableTextOn } from './color'

// ─── Imagen principal de la promo ────────────────────────────────────────────
// Una sola imagen, completa (object-contain: nunca se recorta el arte, que en
// las promos suele traer texto). El espacio que sobra se rellena con la misma
// imagen desenfocada, así no quedan bandas vacías. Sin imagen: franja del
// color de la marca. La insignia de descuento va sobre la imagen.

interface PromoHeroProps {
  imageUrl?: string
  alt: string
  accentColor: string
  /** «40% OFF» (promos de descuento). */
  badge?: string | null
  tenantLogo?: string
}

export function PromoHero({ imageUrl, alt, accentColor, badge, tenantLogo }: PromoHeroProps) {
  const badgeText = readableTextOn(accentColor)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full overflow-hidden rounded-[20px]"
      // Cuadrado (formato habitual de las piezas de promo), con tope de alto en
      // pantallas bajas; sin imagen, una franja compacta del color de la marca.
      style={imageUrl ? { aspectRatio: '1 / 1', maxHeight: '44dvh', backgroundColor: accentColor } : { height: 96, backgroundColor: accentColor }}
    >
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
          <img src={imageUrl} alt={alt} className="relative h-full w-full object-contain" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <img src={tenantLogo || '/tgoicon-192.png'} alt="" className="h-14 w-14 rounded-2xl object-cover shadow-sm" />
        </div>
      )}
      {badge && (
        <span
          className="absolute left-3 top-3 rounded-full px-3 py-1.5 text-sm font-black tracking-tight shadow-md"
          style={{ backgroundColor: accentColor, color: badgeText }}
        >
          {badge}
        </span>
      )}
    </motion.div>
  )
}
