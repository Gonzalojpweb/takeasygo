import type { CSSProperties } from 'react'
import { isLightColor } from '@/lib/color-utils'

/**
 * Tema de las tarjetas del menú público (Tarjeta del Club, cierre del menú):
 * variables --club-* derivadas de los colores del local, para que funcionen en
 * menús claros y oscuros con la misma estética.
 */
export function menuCardTheme(primary: string, bg: string, text: string): CSSProperties {
  const safe = (hex: string, fallback: string) => (/^#[0-9a-f]{3,8}$/i.test(hex || '') ? hex : fallback)
  const brand = safe(primary, '#E8590C')
  const ground = safe(bg, '#FFFFFF')
  const fg = safe(text, '#1A1A1A')
  const lightGround = isLightColor(ground)
  return {
    '--club-brand': brand,
    '--club-deep': `color-mix(in oklab, ${brand} 62%, #2a0010)`,
    '--club-glow': `color-mix(in oklab, ${brand} 55%, #FFD43B)`,
    '--club-on-brand': isLightColor(brand) ? '#1A1A1A' : '#FFFFFF',
    '--club-card': lightGround ? `color-mix(in oklab, ${ground} 35%, #FFFFFF)` : `color-mix(in oklab, ${ground} 88%, #FFFFFF)`,
    '--club-soft': `color-mix(in oklab, ${brand} 12%, var(--club-card))`,
    '--club-track': `color-mix(in oklab, var(--club-glow) 18%, var(--club-card))`,
    '--club-fg': fg,
    '--club-muted': `color-mix(in oklab, ${fg} 62%, transparent)`,
    '--club-line': `color-mix(in oklab, ${fg} 12%, transparent)`,
    '--club-chip': `color-mix(in oklab, ${fg} 6%, transparent)`,
  } as CSSProperties
}

