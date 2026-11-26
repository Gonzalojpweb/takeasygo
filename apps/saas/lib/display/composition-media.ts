// Ilustraciones de una composición: tienen que ser imágenes subidas por el
// flujo firmado a la carpeta de pantallas de ESTE comercio (cuenta ads).
// Una URL pegada de otro sitio u otro comercio se rechaza.
import { adsAssetFromUrl, belongsTo } from '@/lib/media/ads'
import { illustrationUrls, type CompositionConfig } from '@/lib/display/composition-schema'

export function compositionMediaError(config: CompositionConfig, tenantId: string): string | null {
  for (const url of illustrationUrls(config)) {
    const a = adsAssetFromUrl(url)
    if (!a || a.kind !== 'image' || !belongsTo(a.publicId, { kind: 'tenant', tenantId }, 'screen')) {
      return 'La ilustración tiene que ser una imagen subida desde Pantallas. Subila de nuevo.'
    }
  }
  return null
}

/** Imágenes de una pieza de Display Studio: subidas a la carpeta de pantallas de este comercio. */
export function studioMediaError(urls: string[], tenantId: string): string | null {
  for (const url of urls) {
    const a = adsAssetFromUrl(url)
    const owner = { kind: 'tenant' as const, tenantId }
    if (!a || a.kind !== 'image' || !(belongsTo(a.publicId, owner, 'studio') || belongsTo(a.publicId, owner, 'screen'))) {
      return 'La imagen tiene que estar subida desde Pantallas. Subila de nuevo.'
    }
  }
  return null
}

/**
 * Display Studio: cada foto tiene que ser una subida del comercio (Studio o
 * Pantallas) o la foto de un plato de SU carta. Otra URL se rechaza.
 */
export async function studioImagesError(urls: string[], tenantId: string): Promise<string | null> {
  const foreign = urls.filter((u) => studioMediaError([u], tenantId))
  if (!foreign.length) return null
  const { default: Menu } = await import('@/models/Menu')
  const mongoose = (await import('mongoose')).default
  const menus = await Menu.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    .select('categories.items.imageUrl categories.subcategories.items.imageUrl').lean<Array<Record<string, any>>>()
  const own = new Set<string>()
  for (const m of menus) for (const c of m.categories ?? []) {
    for (const i of c.items ?? []) if (i?.imageUrl) own.add(String(i.imageUrl))
    for (const sc of c.subcategories ?? []) for (const i of sc.items ?? []) if (i?.imageUrl) own.add(String(i.imageUrl))
  }
  return foreign.every((u) => own.has(u)) ? null : 'La imagen tiene que estar subida desde Pantallas o ser la foto de un plato de tu carta. Subila de nuevo.'
}
