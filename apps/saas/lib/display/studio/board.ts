// ============================================================================
// Display Studio — datos que viajan a la pantalla (servidor)
// ============================================================================
// Una pieza de Studio → board 'studio': plantilla, lienzo, valores ya
// validados (imágenes en tamaño de pantalla), marca (logo, colores, nombre) y
// las fuentes elegidas como archivos a guardar en el equipo (nunca se piden a
// internet en la TV).
// ============================================================================

import { boardImageUrl, type AnyDoc } from '@/lib/display/templates'
import { compositionBrandOf, type CompositionBrand } from '@/lib/display/composition'
import { studioTemplate, type ParsedStudioConfig } from '@/lib/display/studio/catalog'

export interface StudioBoard {
  kind: 'studio'
  templateId: string
  tier: 'free' | 'premium'
  orientation: 'landscape' | 'portrait'
  designWidth: number
  designHeight: number
  viewing: 'near' | 'far'
  /** Compatibilidad con el resto de las plantillas del reproductor (colores del detalle). */
  style: 'brand'
  pageMs: number
  showQr: boolean
  values: Record<string, unknown>
  brand: CompositionBrand
  /** Fuentes elegidas (familia → archivo). Las que no se pudieron resolver quedan con la del sistema. */
  fontFiles: Array<{ family: string; url: string }>
}

export function buildStudioBoard(config: ParsedStudioConfig, tenant: AnyDoc, fonts: Record<string, string | null>): StudioBoard {
  const t = studioTemplate(config.templateId)!
  const values: Record<string, unknown> = { ...config.values }
  const fontFiles: StudioBoard['fontFiles'] = []
  for (const f of t.fields) {
    const v = values[f.key]
    // Una foto con «Quitar fondo HD» ya es una derivada: no se le encadena otra transformación (se pagaría de nuevo).
    if (f.type === 'image' && typeof v === 'string' && v) values[f.key] = /\/e_background_removal\//.test(v) ? v : boardImageUrl(v, 1600, 1600, 'fit')
    if (f.type === 'font' && typeof v === 'string' && v !== 'brand') {
      const url = fonts[v]
      if (url && !fontFiles.some((x) => x.family === v)) fontFiles.push({ family: v, url })
    }
  }
  return {
    kind: 'studio',
    templateId: t.id,
    tier: t.tier,
    orientation: config.orientation,
    designWidth: config.designWidth,
    designHeight: config.designHeight,
    viewing: config.viewing,
    style: 'brand',
    pageMs: config.pageSeconds * 1000,
    showQr: values.showQr !== false,
    values,
    brand: compositionBrandOf(tenant, fonts),
    fontFiles,
  }
}

export function studioAssets(b: StudioBoard): string[] {
  const out = new Set<string>()
  if (b.brand.logo && b.values.showLogo !== false) out.add(b.brand.logo)
  for (const f of b.brand.fontFiles) out.add(f.url)
  for (const f of b.fontFiles) out.add(f.url)
  const t = studioTemplate(b.templateId)
  for (const f of t?.fields ?? []) {
    const v = b.values[f.key]
    if (f.type === 'image' && typeof v === 'string' && v) out.add(v)
  }
  return [...out]
}
