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
