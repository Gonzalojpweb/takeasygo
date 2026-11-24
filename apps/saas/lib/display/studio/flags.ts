// SERVER-ONLY — interruptores de Display Studio (variables de Vercel).

/** Interruptor de apagado: DISPLAY_STUDIO_ENABLED=0 oculta Studio y deja de mostrar sus piezas. Prendido por defecto. */
export const studioEnabled = () => process.env.DISPLAY_STUDIO_ENABLED !== '0'

export type BgRemovalMode = 'free' | 'cloudinary' | 'both'
/** Quitar fondo: 'free' (por defecto: PNG recortado + navegador), 'cloudinary' (HD pago) o 'both'. */
export function bgRemovalMode(): BgRemovalMode {
  const v = process.env.DISPLAY_STUDIO_BG_REMOVAL
  return v === 'cloudinary' || v === 'both' ? v : 'free'
}
/** Tope mensual de «Quitar fondo HD» por comercio. */
export const bgRemovalMonthlyCap = () => Math.max(0, Number(process.env.DISPLAY_STUDIO_BG_REMOVAL_CAP) || 20)
