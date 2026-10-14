// ── Google Fonts configuration ──────────────────────────────────────────
// Rather than using `next/font/google` at build time (which fails in CI/Vercel
// when Google CDN serves extensionless dynamic kit URLs causing `next/font` parser crash),
// we provide font definitions, css variables, and CDN links loaded on demand.

export interface FontInstanceLike {
  className: string
  variable: string
  style: { fontFamily: string }
}

export const inter: FontInstanceLike = {
  className: '',
  variable: '--font-inter',
  style: { fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
}

export const dmSans: FontInstanceLike = {
  className: '',
  variable: '--font-dm-sans',
  style: { fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
}

export const plusJakartaSans: FontInstanceLike = {
  className: '',
  variable: '--font-plus-jakarta-sans',
  style: { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
}

export const playfairDisplay: FontInstanceLike = {
  className: '',
  variable: '--font-playfair-display',
  style: { fontFamily: "'Playfair Display', Georgia, serif" },
}

export const lora: FontInstanceLike = {
  className: '',
  variable: '--font-lora',
  style: { fontFamily: "'Lora', Georgia, serif" },
}

/** Map from curated font ID → font instance. Used by TenantFontLoader and typography components. */
export const FONT_INSTANCES: Record<string, FontInstanceLike> = {
  inter,
  'dm-sans': dmSans,
  'plus-jakarta-sans': plusJakartaSans,
  'playfair-display': playfairDisplay,
  lora,
}

export const GOOGLE_FONT_URLS: Record<string, string> = {
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'dm-sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap',
  'plus-jakarta-sans': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
  'playfair-display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap',
  lora: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
}

export function getGoogleFontUrl(idOrFamily: string): string | null {
  if (GOOGLE_FONT_URLS[idOrFamily]) {
    return GOOGLE_FONT_URLS[idOrFamily]
  }
  const fontDef = FONT_MAP.get(idOrFamily)
  const familyName = fontDef?.family || idOrFamily
  if (familyName) {
    const encoded = encodeURIComponent(familyName)
    return `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`
  }
  return null
}

export type FontSource = 'google' | 'adobe' | 'custom'
export type FontRole = 'heading' | 'body' | 'display' | 'tag'

export const FONT_ROLES: { key: FontRole; label: string; cssVar: string; description: string }[] = [
  { key: 'heading', label: 'Títulos', cssVar: '--font-heading', description: 'H1, H2, H3, encabezados' },
  { key: 'body', label: 'Texto', cssVar: '--font-body', description: 'Párrafos, contenido general' },
  { key: 'display', label: 'Destacado', cssVar: '--font-display', description: 'Hero, citas, textos grandes' },
  { key: 'tag', label: 'Etiquetas', cssVar: '--font-tag', description: 'Tags, badges, texto pequeño' },
]

export interface FontDefinition {
  id: string
  label: string
  family: string
  category: string
  source: FontSource
  recommendedFor: FontRole[]
  adobeFamily?: string
  weight?: string
}

export const CURATED_FONTS: FontDefinition[] = [
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    category: 'sans-serif',
    source: 'google',
    recommendedFor: ['body', 'heading', 'tag'],
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    family: 'DM Sans',
    category: 'sans-serif',
    source: 'google',
    recommendedFor: ['body', 'heading'],
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    family: 'Plus Jakarta Sans',
    category: 'sans-serif',
    source: 'google',
    recommendedFor: ['body', 'heading', 'tag'],
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    family: 'Playfair Display',
    category: 'serif',
    source: 'google',
    recommendedFor: ['heading', 'display'],
  },
  {
    id: 'lora',
    label: 'Lora',
    family: 'Lora',
    category: 'serif',
    source: 'google',
    recommendedFor: ['body', 'heading'],
  },
  {
    id: 'swear-display',
    label: 'Swear Display',
    family: 'Swear Display',
    category: 'display',
    source: 'adobe',
    adobeFamily: 'swear-display',
    recommendedFor: ['heading', 'display'],
  },
]

export const FONT_MAP = new Map(CURATED_FONTS.map(f => [f.id, f]))

/** Look up a font by its id and return the CSS font-family string for Google Fonts */
export function getGoogleFontFamily(id: string): string | null {
  const instance = FONT_INSTANCES[id]
  return instance?.style.fontFamily ?? null
}
