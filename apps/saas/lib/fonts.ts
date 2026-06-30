import {
  Inter,
  DM_Sans,
  Plus_Jakarta_Sans,
  Playfair_Display,
  Lora,
} from 'next/font/google'

// ── Google Fonts (self-hosted via next/font) ────────────────────────────
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
export const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-dm-sans' })
export const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-plus-jakarta-sans' })
export const playfairDisplay = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair-display' })
export const lora = Lora({ subsets: ['latin'], variable: '--font-lora' })

/** Map from curated font ID → next/font instance. Used by TenantFontLoader to force @font-face loading. */
export const FONT_INSTANCES: Record<string, typeof inter> = {
  inter,
  'dm-sans': dmSans,
  'plus-jakarta-sans': plusJakartaSans,
  'playfair-display': playfairDisplay,
  lora,
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
