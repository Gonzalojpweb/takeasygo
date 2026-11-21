// ============================================================================
// Medidas y límites de los archivos de marketing (CP3, 21/11/2026)
// ============================================================================
// Nunca se recorta al subir: se guarda el original y cada componente lo
// encuadra al mostrarlo (object-cover). Estas medidas son la guía que ve quien
// sube y el piso que verifica el servidor.
//
//  Superficie          Cómo se ve hoy                          Proporción  Recomendado  Mínimo
//  story               pantalla completa, object-cover          9:16        1080×1920    720×1280
//  promo_card          destacada 48 % × 172 px; compacta 108 px ~1:1        800×800      400×400
//                      (Descubrí usa la misma imagen a 64×64)
//  home_banner         todavía no existe (propuesta)            2:1         1200×600     900×450
//
// Imagen: JPG, PNG, WebP o HEIC · hasta 8 MB · hasta 6000 px por lado.
// Video (solo story): MP4, MOV o WebM · 3 a 15 s · hasta 30 MB · vertical
// (de 9:16 a 4:5; horizontal se rechaza) · mínimo 720×1280.
// ============================================================================

export type MediaSurface = 'story' | 'promo_card' | 'home_banner'
export type MediaKind = 'image' | 'video'

export interface SurfaceSpec {
  label: string
  /** Cómo se ve hoy (texto para el formulario). */
  howShown: string
  ratioLabel: string
  recommended: { w: number; h: number }
  min: { w: number; h: number }
  kinds: MediaKind[]
  /** Zona segura (solo story): px libres arriba y abajo sobre 1920 de alto. */
  safeZone?: { top: number; bottom: number }
}

export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const
export const VIDEO_FORMATS = ['mp4', 'mov', 'webm'] as const
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024
export const IMAGE_MAX_SIDE = 6000
export const VIDEO_MIN_SECONDS = 3
export const VIDEO_MAX_SECONDS = 15
/** Video vertical: ancho/alto entre 9:16 (0,5625) y 4:5 (0,8), con tolerancia. */
export const VIDEO_RATIO_MIN = 0.55
export const VIDEO_RATIO_MAX = 0.81

export const SURFACE_SPECS: Record<MediaSurface, SurfaceSpec> = {
  story: {
    label: 'Story',
    howShown: 'Pantalla completa del celular; se recorta para llenar.',
    ratioLabel: '9:16 (vertical)',
    recommended: { w: 1080, h: 1920 },
    min: { w: 720, h: 1280 },
    kinds: ['image', 'video'],
    safeZone: { top: 220, bottom: 560 },
  },
  promo_card: {
    label: 'Tarjeta de promoción',
    howShown: 'Menú: destacada 48 % del ancho × 172 px, compacta 108 px. Descubrí: miniatura 64×64.',
    ratioLabel: '1:1 (cuadrada)',
    recommended: { w: 800, h: 800 },
    min: { w: 400, h: 400 },
    kinds: ['image'],
  },
  home_banner: {
    label: 'Banner del inicio',
    howShown: 'Todavía no se muestra (propuesta).',
    ratioLabel: '2:1 (apaisado)',
    recommended: { w: 1200, h: 600 },
    min: { w: 900, h: 450 },
    kinds: ['image'],
  },
}

export interface MediaFacts {
  kind: MediaKind
  format: string
  bytes: number
  width: number
  height: number
  /** Segundos (solo video). */
  duration?: number | null
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

/**
 * Verifica un archivo contra la superficie. Devuelve null si cumple o el
 * motivo, en castellano y con el dato concreto, si no.
 */
export function checkMedia(surface: MediaSurface, f: MediaFacts): string | null {
  const spec = SURFACE_SPECS[surface]
  if (!spec) return 'Superficie desconocida.'
  if (!spec.kinds.includes(f.kind)) return `${spec.label}: solo acepta imágenes.`
  const format = (f.format || '').toLowerCase()

  if (f.kind === 'image') {
    if (!(IMAGE_FORMATS as readonly string[]).includes(format)) return `Formato «${format || 'desconocido'}» no admitido. Usá JPG, PNG, WebP o HEIC.`
    if (f.bytes > IMAGE_MAX_BYTES) return `La imagen pesa ${mb(f.bytes)}; el máximo es 8 MB.`
    if (f.width > IMAGE_MAX_SIDE || f.height > IMAGE_MAX_SIDE) return `La imagen mide ${f.width}×${f.height}; el máximo es ${IMAGE_MAX_SIDE} px por lado.`
  } else {
    if (!(VIDEO_FORMATS as readonly string[]).includes(format)) return `Formato «${format || 'desconocido'}» no admitido. Usá MP4, MOV o WebM.`
    if (f.bytes > VIDEO_MAX_BYTES) return `El video pesa ${mb(f.bytes)}; el máximo es 30 MB.`
    const d = typeof f.duration === 'number' ? f.duration : NaN
    if (!Number.isFinite(d)) return 'No se pudo leer la duración del video.'
    if (d < VIDEO_MIN_SECONDS) return `El video dura ${d.toFixed(1).replace('.', ',')} s; el mínimo es ${VIDEO_MIN_SECONDS} s.`
    if (d > VIDEO_MAX_SECONDS + 0.5) return `El video dura ${Math.round(d)} s; el máximo es ${VIDEO_MAX_SECONDS} s.`
    const ratio = f.height > 0 ? f.width / f.height : 0
    if (ratio > 1) return `El video es horizontal (${f.width}×${f.height}); tiene que ser vertical.`
    if (ratio < VIDEO_RATIO_MIN || ratio > VIDEO_RATIO_MAX) return `El video mide ${f.width}×${f.height}; tiene que ser vertical entre 9:16 y 4:5.`
  }
  if (f.width < spec.min.w || f.height < spec.min.h) {
    return `${f.kind === 'image' ? 'La imagen' : 'El video'} mide ${f.width}×${f.height}; para ${spec.label.toLowerCase()} el mínimo es ${spec.min.w}×${spec.min.h} (recomendado ${spec.recommended.w}×${spec.recommended.h}).`
  }
  return null
}

/** Duración que usa el visor para un video (s → ms, con tope). */
export function storyVideoDurationMs(seconds: number | null | undefined): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  return Math.round(Math.min(seconds, VIDEO_MAX_SECONDS) * 1000)
}
